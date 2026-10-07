from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from google.genai import errors as genai_errors
from pydantic import BaseModel

from app.agents import intake
from app.config import get_settings
from app.llm import get_llm
from app.schemas import AnalysisResult
from app.services import pipeline
from app.services.frontend_view import to_analysis_detail
from app.services.preparation_plan import PlanSave, RevisionConflict, TodoPatch, document_list_item
from app.services.store import get_store
from app.utils.text import split_sentences

router = APIRouter(prefix="/api")
MAX_UPLOAD_BYTES = 15 * 1024 * 1024


def _today():
    return datetime.now(ZoneInfo(get_settings().timezone)).date()


def _record(doc_id):
    record = get_store().get_record(doc_id)
    if not record:
        raise HTTPException(404, "문서를 찾을 수 없습니다.")
    return record


def _response(analysis, record=None):
    record = record or _record(analysis.document_id)
    return {"documentId": analysis.document_id, "view": to_analysis_detail(analysis),
            "analysis": analysis, "plan": record.get("plan"), "sourceKind": record.get("source_kind", "text")}


def _analysis(doc_id):
    record = _record(doc_id)
    if not record.get("analysis"):
        raise HTTPException(409, {"message": record.get("error") or "아직 문서 분석이 완료되지 않았습니다.", "documentId": doc_id})
    return AnalysisResult.model_validate(record["analysis"])


def _analyze_saved(doc_id, llm):
    store = get_store()
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
    return _response(analysis)


@router.post("/documents/analyze")
def analyze_document(file: Optional[UploadFile] = File(None), text: Optional[str] = Form(None)):
    llm = get_llm()
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
        get_store().save_source(doc_id, source, title)
    except ValueError as exc:
        raise HTTPException(413, str(exc)) from exc
    return _analyze_saved(doc_id, llm)


@router.post("/documents/{doc_id}/retry")
def retry_document(doc_id: str):
    record = _record(doc_id)
    if record.get("analysis"):
        return _response(AnalysisResult.model_validate(record["analysis"]), record)
    return _analyze_saved(doc_id, get_llm())


@router.get("/documents")
def list_documents():
    return [document_list_item(doc_id, record, _today()) for doc_id, record in get_store().list_records()]


@router.get("/documents/{doc_id}")
def get_document(doc_id: str):
    record = _record(doc_id)
    if not record.get("analysis"):
        raise HTTPException(409, {"message": record.get("error") or "아직 문서 분석이 완료되지 않았습니다.", "documentId": doc_id})
    return _response(AnalysisResult.model_validate(record["analysis"]), record)


@router.get("/documents/{doc_id}/source")
def get_source(doc_id: str):
    source = get_store().get_source(doc_id)
    if not source:
        raise HTTPException(404, "원문을 찾을 수 없습니다.")
    return {"pages": source.pages, "sentences": split_sentences(source)}


class ConfirmBody(BaseModel):
    value: Optional[str] = None
    normalized_datetime: Optional[str] = None


@router.post("/documents/{doc_id}/fields/{field_id}/confirm")
def confirm_field(doc_id: str, field_id: str, body: ConfirmBody):
    analysis = _analysis(doc_id)
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
    get_store().update_analysis(analysis)
    return _response(analysis)


@router.delete("/documents/{doc_id}/fields/{field_id}")
def reject_field(doc_id: str, field_id: str):
    analysis = _analysis(doc_id)
    before = len(analysis.fields)
    analysis.fields = [field for field in analysis.fields if field.id != field_id]
    if len(analysis.fields) == before:
        raise HTTPException(404, "필드를 찾을 수 없습니다.")
    analysis.needs_review = any(field.status in ("needs_review", "unverified") for field in analysis.fields)
    get_store().update_analysis(analysis)
    return _response(analysis)


def _save_plan(doc_id, body, registered=False):
    try:
        return {"plan": get_store().save_plan(doc_id, body, registered)}
    except KeyError as exc:
        raise HTTPException(404, "분석된 문서를 찾을 수 없습니다.") from exc
    except RevisionConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(413, str(exc)) from exc


@router.put("/documents/{doc_id}/plan")
def save_plan(doc_id: str, body: PlanSave):
    return _save_plan(doc_id, body)


@router.post("/documents/{doc_id}/plan/register")
def register_plan(doc_id: str, body: PlanSave):
    if not any(not step.isDeadline for step in body.steps):
        raise HTTPException(422, "등록할 준비 일정을 추가해 주세요.")
    return _save_plan(doc_id, body, registered=True)


@router.get("/todos")
def list_todos(document_id: str | None = None):
    return get_store().list_todos(document_id)


@router.patch("/todos/{item_id}")
def update_todo(item_id: str, body: TodoPatch):
    try:
        plan = get_store().mutate_todo(item_id, completed=body.is_completed)
        return {"plan": plan, "is_completed": body.is_completed}
    except KeyError as exc:
        raise HTTPException(404, "할 일을 찾을 수 없습니다.") from exc


@router.delete("/todos/{item_id}")
def delete_todo(item_id: str):
    try:
        get_store().mutate_todo(item_id, delete=True)
        return {"deleted": True}
    except KeyError as exc:
        raise HTTPException(404, "할 일을 찾을 수 없습니다.") from exc
