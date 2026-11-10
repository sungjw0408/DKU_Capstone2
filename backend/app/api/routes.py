from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from google.genai import errors as genai_errors
from pydantic import BaseModel

from app.agents import intake
from app.api.authn import active_uid, locked_identity
from app.config import get_settings
from app.llm import get_llm
from app.schemas import AnalysisResult
from app.services import originals, pipeline
from app.services.frontend_view import to_analysis_detail
from app.services.notice_mail import MailDraftRequest, mail_options, prepare_draft
from app.services.preparation_plan import DocumentPatch, PlanSave, RevisionConflict, TodoCreate, TodoPatch, document_list_item
from app.services.store import get_store
from app.utils.text import split_sentences

router = APIRouter(prefix="/api")
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
MAX_IMAGE_FILES = 5
ATTACHMENT_TYPES = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}


def user_store(uid: str = Depends(active_uid)):
    return get_store(uid)


def google_mail_store(uid: str = Depends(active_uid), identity=Depends(locked_identity)):
    firebase = identity.get("firebase")
    if not isinstance(firebase, dict) or firebase.get("sign_in_provider") != "google.com":
        raise HTTPException(403, "Google 계정으로 로그인하면 메일을 작성할 수 있어요.")
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
    source = store.get_source(analysis.document_id)

    return {
        "documentId": analysis.document_id,
        "view": to_analysis_detail(analysis, source),
        "analysis": analysis,
        "plan": record.get("plan"),
        "sourceKind": record.get("source_kind", "text"),
    }



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


@router.post("/documents/analyze-images")
def analyze_images(
    files: list[UploadFile] = File(...),
    store=Depends(user_store),
):
    """여러 장의 사진을 하나의 공지로 분석한다."""

    if not 2 <= len(files) <= MAX_IMAGE_FILES:
        raise HTTPException(
            422,
            f"사진은 2장 이상 {MAX_IMAGE_FILES}장 이하로 올려주세요.",
        )

    images = []
    total_bytes = 0

    for file in files:
        raw_mime = (file.content_type or "").lower()
        filename = (file.filename or "").lower()

        # 정상적인 이미지 MIME 또는 이미지 확장자 허용
        # 확장자 추론은 MIME이 비어 있거나 octet-stream일 때만 수행
        allowed_exts = (
            ".jpg", ".jpeg", ".png",
            ".webp", ".heic", ".heif",
        )
        supported = intake.SUPPORTED_IMAGE_TYPES

        mime = image_mime(file)

        valid = (
            raw_mime in supported
            or raw_mime == "image/jpg"
            or (
                raw_mime in ("", "application/octet-stream")
                and filename.endswith(allowed_exts)
            )
        )

        if not valid or mime not in supported:
            raise HTTPException(
                422,
                f"지원하지 않는 이미지 형식입니다: {file.filename}",
            )

        # 전체 업로드 용량을 15MB 이하로 제한
        remaining = MAX_UPLOAD_BYTES - total_bytes
        data = file.file.read(remaining + 1)

        if not data:
            raise HTTPException(
                422,
                "빈 사진 파일은 업로드할 수 없습니다.",
            )

        total_bytes += len(data)

        if total_bytes > MAX_UPLOAD_BYTES:
            raise HTTPException(
                413,
                "전체 사진 용량은 15MB 이하이어야 합니다.",
            )

        images.append((data, mime))

    llm = get_llm()

    try:
        source = intake.from_images(images, llm)

    except intake.IntakeError as exc:
        raise HTTPException(422, str(exc)) from exc

    except RuntimeError as exc:
        raise HTTPException(501, str(exc)) from exc

    except genai_errors.APIError as exc:
        raise HTTPException(
            503,
            "사진에서 텍스트를 추출하지 못했습니다.",
        ) from exc

    # 모든 사진을 하나의 문서로 저장
    doc_id = f"doc-{uuid.uuid4().hex}"
    title = f"사진 공지 ({len(files)}페이지)"

    try:
        store.save_source(doc_id, source, title)

    except ValueError as exc:
        raise HTTPException(413, str(exc)) from exc

    # 다중 사진 원본과 페이지별 위치 정보 저장
    try:
        originals.save_images(
            _original_id(store, doc_id),
            images,
            source._image_lines_by_page,
        )
    except OSError:
        # 원본 저장 실패 시 텍스트 원문으로 대체
        pass

    # 기존 분석 파이프라인 사용
    return _analyze_saved(doc_id, llm, store)


@router.post("/documents/analyze-with-attachments")
def analyze_with_attachments(
    text: str = Form(...),
    files: list[UploadFile] = File(...),
    store=Depends(user_store),
):
    if not text.strip():
        raise HTTPException(422, "공지 본문을 입력해주세요.")

    if not 1 <= len(files) <= 3:
        raise HTTPException(
            422,
            "첨부 파일은 1개 이상 3개 이하로 올려주세요.",
        )

    total_bytes = len(text.encode("utf-8"))

    if total_bytes > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "전체 업로드 용량은 15MB 이하이어야 합니다.")

    attachments = []

    for file in files:
        filename = file.filename or ""


        extension = (
            "." + filename.rsplit(".", 1)[-1].lower()
            if "." in filename
            else ""
        )

        mime_type = ATTACHMENT_TYPES.get(extension)

        if mime_type is None:
            raise HTTPException(
                422,
                f"지원하지 않는 첨부 파일 형식입니다: {filename}",
            )

        provided_mime = (file.content_type or "").lower()

        allowed_mimes = {
            "",
            "application/octet-stream",
            mime_type,
        }

        if mime_type == "image/jpeg":
            allowed_mimes.add("image/jpg")

        if provided_mime not in allowed_mimes:
            raise HTTPException(
                422,
                f"파일 형식이 일치하지 않습니다: {filename}",
            )


        remaining = MAX_UPLOAD_BYTES - total_bytes
        data = file.file.read(remaining + 1)

        if not data:
            raise HTTPException(
                422,
                "빈 첨부 파일은 업로드할 수 없습니다.",
            )

        total_bytes += len(data)

        if total_bytes > MAX_UPLOAD_BYTES:
            raise HTTPException(
                413,
                "전체 업로드 용량은 15MB 이하이어야 합니다.",
            )

        attachments.append(
            (data, mime_type, filename)
        )

    llm = get_llm()

    try:
        source = intake.from_body_and_attachments(
            text,
            attachments,
            llm,
        )
    except intake.IntakeError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(501, str(exc)) from exc
    except genai_errors.APIError as exc:
        raise HTTPException(
            503,
            "첨부 파일의 텍스트 추출에 실패했습니다.",
        ) from exc

    doc_id = f"doc-{uuid.uuid4().hex}"
    title = text.strip().splitlines()[0][:500]

    try:
        store.save_source(doc_id, source, title)
    except ValueError as exc:
        raise HTTPException(413, str(exc)) from exc

    try:
        originals.save_mixed_attachments(
            _original_id(store, doc_id),
            attachments,
            source,
        )
    except OSError:
        pass

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
        "pageSources": [ item.model_dump() for item in source.page_sources ],
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
        value = body.value.strip()
        if not value:
            raise HTTPException(422, "수정할 내용을 입력해 주세요.")
        field.value = value
    if "normalized_datetime" in body.model_fields_set:
        normalized = body.normalized_datetime
        if normalized is not None:
            try:
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?", normalized):
                    raise ValueError
                datetime.fromisoformat(normalized)
            except ValueError as exc:
                raise HTTPException(422, "올바른 날짜와 시간을 선택해 주세요.") from exc
        field.normalized_datetime = normalized
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
    todos = [step for step in body.steps if not step.isDeadline]
    if not todos:
        raise HTTPException(422, "등록할 준비 일정을 추가해 주세요.")
    if any(not step.date for step in todos):
        raise HTTPException(422, "등록하기 전에 모든 할 일의 날짜를 선택해 주세요.")
    return _save_plan(doc_id, body, store, registered=True)


@router.post("/documents/{doc_id}/todos", status_code=201)
def add_document_todo(doc_id: str, body: TodoCreate, store=Depends(user_store)):
    step_id = body.step_id or f"custom-step-{uuid.uuid4().hex}"
    try:
        return {"todos": store.add_todo(doc_id, step_id, body)}
    except KeyError as exc:
        raise HTTPException(404, "분석된 문서를 찾을 수 없습니다.") from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


def _registered_mail_options(doc_id, store):
    record = _record(doc_id, store)
    if not record.get("analysis") or not (record.get("plan") or {}).get("registered"):
        raise HTTPException(409, "준비 계획을 등록한 뒤 메일을 작성할 수 있어요.")
    analysis = AnalysisResult.model_validate(record["analysis"])
    return mail_options(analysis, store.get_source(doc_id), record.get("title") or analysis.title)


@router.get("/documents/{doc_id}/mail-options")
def get_mail_options(doc_id: str, store=Depends(google_mail_store)):
    return _registered_mail_options(doc_id, store)


@router.post("/mail-drafts/{doc_id}")
def create_mail_draft(doc_id: str, body: MailDraftRequest, store=Depends(google_mail_store)):
    options = _registered_mail_options(doc_id, store)
    try:
        subject, application_details = prepare_draft(options, body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    try:
        question = body.question if body.kind == "inquiry" else ""
        text = get_llm().draft_mail(body.kind, options["title"], question).strip()
        if not text or len(text) > 3000:
            raise ValueError("Invalid draft length")
    except genai_errors.APIError as exc:
        status = 503 if exc.code in (429, 503, 504) else 502
        raise HTTPException(status, "지금 메일 초안을 만들기 어려워요. 잠시 후 다시 시도해 주세요.") from exc
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(502, "메일 초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.") from exc
    if application_details:
        text = f"{text}\n\n{application_details}\n\n감사합니다."
    return {"recipient": body.recipient, "subject": subject, "body": text}


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
