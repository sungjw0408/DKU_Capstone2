from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from google.genai import errors as genai_errors
from pydantic import BaseModel

from app.agents import intake
from app.api.authn import active_uid
from app.config import get_settings
from app.llm import get_llm
from app.schemas import AnalysisResult
from app.services import originals, pipeline
from app.services.frontend_view import to_analysis_detail
from app.services.preparation_plan import DocumentPatch, PlanSave, RevisionConflict, TodoPatch, document_list_item
from app.services.store import get_store
from app.utils.text import split_sentences

router = APIRouter(prefix="/api")
MAX_UPLOAD_BYTES = 15 * 1024 * 1024


def user_store(uid: str = Depends(active_uid)):
    return get_store(uid)


def _original_id(store, doc_id):
    return originals.scoped_id(store.uid, doc_id)


def _today():
    return datetime.now(ZoneInfo(get_settings().timezone)).date()


def image_mime(file: UploadFile) -> str:
    mime = (file.content_type or "").lower()
    if mime == "image/jpg":
        return "image/jpeg"
    if mime.startswith("image/"):
        return mime
    name = (file.filename or "").lower()
    ext = name.rsplit(".", 1)[-1] if "." in name else ""
    return {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp",
            "heic": "image/heic", "heif": "image/heif"}.get(ext, "image/jpeg")


def _save_original(doc_id, data, file, source, store):
    doc_id = _original_id(store, doc_id)
    """원문 근거 화면용 원본 보관 (PDF·사진). 실패해도 분석은 계속한다 (근거 화면은 텍스트 보기로 대체)."""
    if data is None:
        return
    try:
        if source.source_kind == "pdf":
            originals.save_pdf(doc_id, data)
        elif source.source_kind == "image":
            originals.save_image(doc_id, data, image_mime(file), source._image_lines)
    except OSError:
        pass


def _record(doc_id, store):
    record = store.get_record(doc_id)
    if not record:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")
    return record


def _response(analysis, store, record=None):
    record = record or _record(analysis.document_id, store)
    return {"documentId": analysis.document_id, "view": to_analysis_detail(analysis),
            "analysis": analysis, "plan": record.get("plan"), "sourceKind": record.get("source_kind", "text")}


def _analysis(doc_id, store):
    record = _record(doc_id, store)
    if not record.get("analysis"):
        raise HTTPException(409, {"message": record.get("error") or "아직 문서 분석이 완료되지 않았습니다.", "documentId": doc_id})
    return AnalysisResult.model_validate(record["analysis"])


def _analyze_saved(doc_id, llm, store):
    source = store.get_source(doc_id)
    if not source:
        raise HTTPException(404, "저장된 원문을 찾을 수 없습니다.")
    try:
        analysis = pipeline.analyze(source, llm, document_id=doc_id)
    except genai_errors.APIError as exc:
        message = "지금 AI 서버에 요청이 몰려 있어요. 원문은 저장되었으니 잠시 후 다시 시도해 주세요." if exc.code in (429, 503) else "AI 분석에 실패했습니다. 저장된 원문으로 다시 시도해 주세요."
        store.mark_failed(doc_id, message)
        raise HTTPException(503 if exc.code in (429, 503) else 502,
                            {"message": message, "documentId": doc_id}) from exc
    except Exception as exc:
        message = "AI 분석 결과를 처리하지 못했습니다. 저장된 원문으로 다시 시도해 주세요."
        store.mark_failed(doc_id, message)
        raise HTTPException(502, {"message": message, "documentId": doc_id}) from exc
    try:
        store.save(analysis, source)
    except ValueError as exc:
        raise HTTPException(413, str(exc)) from exc
    return _response(analysis, store)


@router.post("/documents/analyze")
def analyze_document(file: Optional[UploadFile] = File(None), text: Optional[str] = Form(None), store=Depends(user_store)):
    llm = get_llm()
    data = None
    try:
        if file is not None:
            data = file.file.read(MAX_UPLOAD_BYTES + 1)
            if len(data) > MAX_UPLOAD_BYTES:
                raise HTTPException(413, "파일은 15MB 이하만 올릴 수 있습니다.")
            source = intake.from_upload(data, file.content_type or "", file.filename or "", llm)
            title = file.filename or "문서"
        elif text and text.strip():
            if len(text.encode("utf-8")) > MAX_UPLOAD_BYTES:
                raise HTTPException(413, "텍스트는 15MB 이하만 올릴 수 있습니다.")
            source = intake.from_text(text)
            title = source.pages[0].splitlines()[0][:500]
        else:
            raise HTTPException(400, "file 또는 text 중 하나가 필요합니다.")
    except intake.IntakeError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(501, str(exc)) from exc
    except genai_errors.APIError as exc:
        raise HTTPException(503, "문서의 문자 추출에 실패했습니다. 잠시 후 다시 시도해 주세요.") from exc
    doc_id = f"doc-{uuid.uuid4().hex}"
    try:
        store.save_source(doc_id, source, title)
    except ValueError as exc:
        raise HTTPException(413, str(exc)) from exc
    _save_original(doc_id, data, file, source, store)
    return _analyze_saved(doc_id, llm, store)


@router.post("/documents/{doc_id}/retry")
def retry_document(doc_id: str, store=Depends(user_store)):
    record = _record(doc_id, store)
    if record.get("analysis"):
        return _response(AnalysisResult.model_validate(record["analysis"]), store, record)
    return _analyze_saved(doc_id, get_llm(), store)


@router.get("/documents")
def list_documents(store=Depends(user_store)):
    return [document_list_item(doc_id, record, _today()) for doc_id, record in store.list_records()]


@router.get("/documents/{doc_id}")
def get_document(doc_id: str, store=Depends(user_store)):
    record = _record(doc_id, store)
    if not record.get("analysis"):
        raise HTTPException(409, {"message": record.get("error") or "아직 문서 분석이 완료되지 않았습니다.", "documentId": doc_id})
    return _response(AnalysisResult.model_validate(record["analysis"]), store, record)

@router.patch("/documents/{doc_id}")
def update_document(doc_id: str, body: DocumentPatch, store=Depends(user_store)):
    changes = body.model_dump(
        exclude_unset=True
    )

    if not changes:
        raise HTTPException(
            422,
            "수정할 내용이 없습니다."
        )

    try:
        updated = store.mutate_document(
            doc_id,
            changes,
        )

        return {
            "updated": True,
            "document": document_list_item(
                doc_id,
                updated,
                _today(),
            ),
            "plan": updated.get("plan"),
        }

    except KeyError as exc:
        raise HTTPException(
            404,
            "문서를 찾을 수 없습니다."
        ) from exc

    except ValueError as exc:
        raise HTTPException(
            422,
            str(exc),
        ) from exc


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: str, store=Depends(user_store)):
    try:
        result = store.delete_document(doc_id)
    except KeyError as exc:
        raise HTTPException(
            404,
            "문서를 찾을 수 없습니다."
        ) from exc

    originals.delete_originals(_original_id(store, doc_id))

    return result

@router.get("/documents/{doc_id}/source")
def get_source(doc_id: str, store=Depends(user_store)):
    """원문 근거 화면용: 페이지별 원문과 문장 오프셋 + (PDF·사진이면) 원본 페이지 크기와 근거 위치"""
    source = store.get_source(doc_id)
    if not source:
        raise HTTPException(404, "원문을 찾을 수 없습니다.")
    record = store.get_record(doc_id) or {}
    analysis = AnalysisResult.model_validate(record["analysis"]) if record.get("analysis") else None
    layout = originals.page_layout(_original_id(store, doc_id))
    return {
        "kind": source.source_kind,
        "pages": source.pages,
        "sentences": split_sentences(source),
        # 원본 이미지로 보여줄 수 있으면 페이지 크기와 근거 위치(페이지 비율 좌표)를 함께 준다
        "pageImages": layout["pages"] if layout else None,
        "highlights": originals.highlights(_original_id(store, doc_id), analysis) if layout and analysis else {},
    }


@router.get("/documents/{doc_id}/pages/{page_no}/image")
def get_page_image(doc_id: str, page_no: int, width: int = 1000, store=Depends(user_store)):
    """원본 페이지 이미지 (PDF 는 PNG 로 렌더링, 사진은 원본 그대로) — 원문 근거 화면 · 썸네일용"""
    if not store.get_record(doc_id) or originals.page_layout(_original_id(store, doc_id)) is None:
        raise HTTPException(404, "원본 페이지 이미지를 찾을 수 없습니다.")
    try:
        found = originals.page_image(_original_id(store, doc_id), page_no, width)
    except RuntimeError as e:
        raise HTTPException(500, str(e)) from e
    if found is None:
        raise HTTPException(404, "페이지를 찾을 수 없습니다.")
    body, mime = found
    return Response(body, media_type=mime, headers={"Cache-Control": "private, no-store", "Vary": "Authorization"})


class ConfirmBody(BaseModel):
    value: Optional[str] = None
    normalized_datetime: Optional[str] = None


@router.post("/documents/{doc_id}/fields/{field_id}/confirm")
def confirm_field(doc_id: str, field_id: str, body: ConfirmBody, store=Depends(user_store)):
    analysis = _analysis(doc_id, store)
    field = next((field for field in analysis.fields if field.id == field_id), None)
    if not field:
        raise HTTPException(404, "필드를 찾을 수 없습니다.")
    if body.value is not None:
        field.value = body.value
    if body.normalized_datetime is not None:
        field.normalized_datetime = body.normalized_datetime
    field.status = "user_confirmed"
    field.confidence = 100
    analysis.needs_review = any(field.status in ("needs_review", "unverified") for field in analysis.fields)
    store.update_analysis(analysis)
    return _response(analysis, store)


@router.delete("/documents/{doc_id}/fields/{field_id}")
def reject_field(doc_id: str, field_id: str, store=Depends(user_store)):
    analysis = _analysis(doc_id, store)
    before = len(analysis.fields)
    analysis.fields = [field for field in analysis.fields if field.id != field_id]
    if len(analysis.fields) == before:
        raise HTTPException(404, "필드를 찾을 수 없습니다.")
    analysis.needs_review = any(field.status in ("needs_review", "unverified") for field in analysis.fields)
    store.update_analysis(analysis)
    return _response(analysis, store)


def _save_plan(doc_id, body, store, registered=False):
    try:
        return {"plan": store.save_plan(doc_id, body, registered)}
    except KeyError as exc:
        raise HTTPException(404, "분석된 문서를 찾을 수 없습니다.") from exc
    except RevisionConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(413, str(exc)) from exc


@router.put("/documents/{doc_id}/plan")
def save_plan(doc_id: str, body: PlanSave, store=Depends(user_store)):
    return _save_plan(doc_id, body, store)


@router.post("/documents/{doc_id}/plan/register")
def register_plan(doc_id: str, body: PlanSave, store=Depends(user_store)):
    if not any(not step.isDeadline for step in body.steps):
        raise HTTPException(422, "등록할 준비 일정을 추가해 주세요.")
    return _save_plan(doc_id, body, store, registered=True)


@router.get("/todos")
def list_todos(document_id: str | None = None, store=Depends(user_store)):
    return store.list_todos(document_id)


@router.patch("/todos/{item_id}")
def update_todo(item_id: str, body: TodoPatch, store=Depends(user_store)):
    changes = body.model_dump(exclude_unset=True)

    if not changes:
        raise HTTPException(
            422,
            "수정할 내용이 없습니다."
        )

    try:
        plan = store.mutate_todo(
            item_id,
            changes=changes,
        )

        return {
            "plan": plan,
            "updated": True,
        }

    except KeyError as exc:
        raise HTTPException(
            404,
            "할 일을 찾을 수 없습니다."
        ) from exc

    except ValueError as exc:
        raise HTTPException(
            422,
            str(exc),
        ) from exc


@router.delete("/todos/{item_id}")
def delete_todo(item_id: str, store=Depends(user_store)):
    try:
        store.mutate_todo(item_id, delete=True)
        return {"deleted": True}
    except KeyError as exc:
        raise HTTPException(404, "할 일을 찾을 수 없습니다.") from exc
