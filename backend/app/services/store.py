"""문서 원문·분석·준비 계획 저장소. 등록된 todos는 같은 계획에서 갱신한다."""
from __future__ import annotations

import copy
import json
from datetime import datetime, timezone
from functools import lru_cache
from threading import RLock

from app.config import get_settings
from app.schemas import AnalysisResult, SourceDocument
from app.services.preparation_plan import PlanSave, RevisionConflict, plan_todos

_firebase_init_lock = RLock()
_store_lock = RLock()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _summary(analysis):
    from app.services.frontend_view import to_analysis_detail
    view = to_analysis_detail(analysis)
    return {"title": analysis.title, "type": f"{analysis.doc_category.value} 문서",
            "status": "needs_review" if analysis.needs_review else "in_progress",
            "deadline": (view.get("deadline") or {}).get("datetime"),
            "analysis": analysis.model_dump(mode="json"), "updated_at": _now(), "error": None}


def _check_size(record):
    if len(json.dumps(record, ensure_ascii=False, default=str).encode("utf-8")) > 900_000:
        raise ValueError("저장할 분석 결과나 일정이 너무 큽니다.")


def _new_plan(record, body, registered=False):
    current = record.get("plan") or {}
    if current.get("revision", 0) != body.revision:
        raise RevisionConflict("다른 화면에서 계획이 변경되었습니다. 다시 불러와 주세요.")
    plan = {"steps": [step.model_dump() for step in body.steps],
            "registered": registered or current.get("registered", False),
            "revision": body.revision + 1, "updated_at": _now()}
    _check_size({**record, "plan": plan})
    return plan


def _changed_analysis_plan(record, analysis):
    """원문 확인에서 수정/제외한 자동 일정을 반영하고 직접 편집한 이름·메모는 보존한다."""
    plan = copy.deepcopy(record.get("plan"))
    if not plan:
        return None
    old_fields = {field["id"]: field for field in (record.get("analysis") or {}).get("fields", [])}
    fields = {field.id: field for field in analysis.fields if field.status != "unverified"}
    steps = []
    for step in plan["steps"]:
        if step["id"].startswith("document-todo-"):
            field_id = step["id"][len("document-todo-"):]
            # 기존 버전의 t1/t2 ID 계획은 그대로 유지한다.
            if field_id in old_fields:
                if field_id not in fields:
                    continue
                if step["label"] == old_fields[field_id]["value"]:
                    step["label"] = fields[field_id].value
        steps.append(step)
    plan.update(steps=steps, revision=plan["revision"] + 1, updated_at=_now())
    return plan


class MemoryStore:
    def __init__(self):
        self._data = {}
        self._sources = {}
        self._todos = {}
        self._lock = RLock()

    def save_source(self, doc_id, source, title="문서"):
        with self._lock:
            self._sources[doc_id] = source.model_copy(deep=True)
            self._data[doc_id] = {"title": title, "created_at": _now(), "status": "analyzing",
                                  "source_kind": source.source_kind}

    def get_source(self, doc_id):
        with self._lock:
            source = self._sources.get(doc_id)
            return source.model_copy(deep=True) if source else None

    def get_record(self, doc_id):
        with self._lock:
            return copy.deepcopy(self._data.get(doc_id))

    def get(self, doc_id):
        record = self.get_record(doc_id)
        if not record or not record.get("analysis"):
            return None
        return AnalysisResult.model_validate(record["analysis"]), self.get_source(doc_id)

    def list_records(self):
        with self._lock:
            return sorted([(doc_id, copy.deepcopy(record)) for doc_id, record in self._data.items()],
                          key=lambda pair: pair[1]["created_at"], reverse=True)

    def list(self):
        return [AnalysisResult.model_validate(record["analysis"]) for _, record in self.list_records() if record.get("analysis")]

    def save(self, analysis, source):
        with self._lock:
            if analysis.document_id not in self._data:
                self.save_source(analysis.document_id, source, analysis.title)
            self._data[analysis.document_id].update(_summary(analysis))

    def mark_failed(self, doc_id, message):
        with self._lock:
            self._data[doc_id].update(status="analysis_failed", error=message, updated_at=_now())

    def _sync_todos(self, doc_id, record):
        for key in [key for key, item in self._todos.items() if item.get("document_id") == doc_id]:
            del self._todos[key]
        plan = record.get("plan")
        if plan and plan["registered"]:
            for item in plan_todos(doc_id, record["title"], plan):
                self._todos[item["id"]] = item

    def update_analysis(self, analysis):
        with self._lock:
            record = self._data[analysis.document_id]
            plan = _changed_analysis_plan(record, analysis)
            record.update(_summary(analysis))
            if plan:
                record["plan"] = plan
            self._sync_todos(analysis.document_id, record)

    def save_plan(self, doc_id, body: PlanSave, registered=False):
        with self._lock:
            record = self._data.get(doc_id)
            if not record or not record.get("analysis"):
                raise KeyError(doc_id)
            plan = _new_plan(record, body, registered)
            record["plan"] = plan
            self._sync_todos(doc_id, record)
            return copy.deepcopy(plan)

    def list_todos(self, doc_id=None):
        with self._lock:
            return sorted([copy.deepcopy(item) for item in self._todos.values()
                           if not doc_id or item.get("document_id") == doc_id], key=lambda item: (item.get("doc_title", ""), item.get("order", 0)))

    def mutate_todo(self, item_id, completed=None, delete=False):
        with self._lock:
            item = self._todos.get(item_id)
            if not item:
                raise KeyError(item_id)
            record = self._data[item["document_id"]]
            plan = copy.deepcopy(record["plan"])
            plan["steps"] = [step for step in plan["steps"] if not (delete and step["id"] == item["step_id"])]
            for step in plan["steps"]:
                if step["id"] == item["step_id"] and not step.get("isDeadline"):
                    step["done"] = completed
            return self.save_plan(item["document_id"], PlanSave(steps=plan["steps"], revision=plan["revision"]))


class FirestoreStore:
    def __init__(self):
        import firebase_admin
        from firebase_admin import credentials, firestore
        settings = get_settings()
        # 홈에서 문서와 할 일을 동시에 요청해도 Firebase 앱은 한 번만 초기화한다.
        with _firebase_init_lock:
            try:
                firebase_admin.get_app()
            except ValueError:
                cred = credentials.Certificate(settings.google_application_credentials) if settings.google_application_credentials else None
                firebase_admin.initialize_app(cred, {"projectId": settings.gcp_project} if settings.gcp_project else None)
        self.db = firestore.client()
        self.col = self.db.collection("documents")
        self.todos = self.db.collection("todos")

    def save_source(self, doc_id, source, title="문서"):
        ref = self.col.document(doc_id)
        # 긴 페이지도 UTF-8 기준 약 500KB 조각으로 나누어 Firestore 문서 크기를 제한한다.
        chunks = []
        for page_index, page in enumerate(source.pages):
            for offset in range(0, max(1, len(page)), 100_000):
                chunks.append({"page": page_index, "text": page[offset:offset + 100_000]})
        if len(chunks) > 400 or sum(len(chunk["text"].encode("utf-8")) for chunk in chunks) > 8_000_000:
            raise ValueError("추출된 원문이 너무 큽니다. 문서를 나눠 올려 주세요.")
        batch = self.db.batch()
        batch.set(ref, {"title": title, "created_at": _now(), "status": "analyzing", "source_kind": source.source_kind})
        batch.set(ref.collection("source").document("raw"), {
            "source_kind": source.source_kind, "masked_count": source.masked_count,
            "page_count": len(source.pages), "chunk_count": len(chunks)})
        for index, chunk in enumerate(chunks):
            batch.set(ref.collection("sourceChunks").document(f"{index:06d}"), chunk)
        batch.commit()

    def get_source(self, doc_id):
        ref = self.col.document(doc_id)
        snap = ref.collection("source").document("raw").get()
        if not snap.exists:
            return None
        data = snap.to_dict()
        if "pages" in data:  # 이전 FirestoreStore가 저장한 원문도 읽는다.
            return SourceDocument.model_validate(data)
        pages = [""] * data["page_count"]
        for chunk in ref.collection("sourceChunks").order_by("__name__").stream():
            part = chunk.to_dict()
            pages[part["page"]] += part["text"]
        return SourceDocument(source_kind=data["source_kind"], pages=pages, masked_count=data.get("masked_count", 0))

    def get_record(self, doc_id):
        snap = self.col.document(doc_id).get()
        return snap.to_dict() if snap.exists else None

    def get(self, doc_id):
        record = self.get_record(doc_id)
        if not record or not record.get("analysis"):
            return None
        return AnalysisResult.model_validate(record["analysis"]), self.get_source(doc_id)

    def list_records(self):
        # order_by는 created_at이 없는 기존 문서를 제외하므로 전체를 읽어 정렬한다.
        records = [(snap.id, snap.to_dict()) for snap in self.col.stream()]
        return sorted(records, key=lambda pair: str(pair[1].get("created_at") or ""), reverse=True)

    def list(self):
        return [AnalysisResult.model_validate(record["analysis"]) for _, record in self.list_records() if record.get("analysis")]

    def save(self, analysis, source):
        ref = self.col.document(analysis.document_id)
        if not ref.get().exists:
            self.save_source(analysis.document_id, source, analysis.title)
        summary = _summary(analysis)
        _check_size({**(self.get_record(analysis.document_id) or {}), **summary})
        ref.update(summary)

    def mark_failed(self, doc_id, message):
        self.col.document(doc_id).update({"status": "analysis_failed", "error": message, "updated_at": _now()})

    def _write_plan(self, transaction, doc_id, record, plan):
        from google.cloud.firestore_v1.base_query import FieldFilter
        ref = self.col.document(doc_id)
        items = plan_todos(doc_id, record["title"], plan) if plan["registered"] else []
        item_ids = {item["id"] for item in items}
        # 기존 형식으로 등록된 같은 문서의 할 일도 현재 계획으로 교체하여 중복을 방지한다.
        old_ids = {snap.id for snap in self.todos.where(filter=FieldFilter("document_id", "==", doc_id)).get(transaction=transaction)} if plan["registered"] else set()
        transaction.update(ref, {"plan": plan, "updated_at": plan["updated_at"]})
        for item_id in old_ids - item_ids:
            transaction.delete(self.todos.document(item_id))
        for item in items:
            transaction.set(self.todos.document(item["id"]), {key: value for key, value in item.items() if key != "id"})

    def save_plan(self, doc_id, body: PlanSave, registered=False):
        from firebase_admin import firestore
        @firestore.transactional
        def save(transaction):
            snap = self.col.document(doc_id).get(transaction=transaction)
            if not snap.exists or not snap.to_dict().get("analysis"):
                raise KeyError(doc_id)
            record = snap.to_dict()
            plan = _new_plan(record, body, registered)
            self._write_plan(transaction, doc_id, record, plan)
            return plan
        return save(self.db.transaction())

    def update_analysis(self, analysis):
        from firebase_admin import firestore
        @firestore.transactional
        def update(transaction):
            ref = self.col.document(analysis.document_id)
            snap = ref.get(transaction=transaction)
            if not snap.exists:
                raise KeyError(analysis.document_id)
            record = snap.to_dict()
            plan = _changed_analysis_plan(record, analysis)
            updated = {**record, **_summary(analysis), **({"plan": plan} if plan else {})}
            _check_size(updated)
            if plan:
                self._write_plan(transaction, analysis.document_id, record, plan)
            transaction.update(ref, _summary(analysis))
        update(self.db.transaction())

    def list_todos(self, doc_id=None):
        from google.cloud.firestore_v1.base_query import FieldFilter
        query = self.todos.where(filter=FieldFilter("document_id", "==", doc_id)) if doc_id else self.todos
        return sorted([{"id": snap.id, **snap.to_dict()} for snap in query.stream()],
                      key=lambda item: (item.get("doc_title", ""), item.get("order", 0)))

    def mutate_todo(self, item_id, completed=None, delete=False):
        from firebase_admin import firestore
        @firestore.transactional
        def mutate(transaction):
            todo_ref = self.todos.document(item_id)
            snap = todo_ref.get(transaction=transaction)
            if not snap.exists:
                raise KeyError(item_id)
            item = snap.to_dict()
            doc_id = item.get("document_id")
            document = self.col.document(doc_id).get(transaction=transaction) if doc_id else None
            if document and document.exists and document.to_dict().get("plan") and item.get("step_id"):
                record = document.to_dict()
                body = copy.deepcopy(record["plan"])
                body["steps"] = [step for step in body["steps"] if not (delete and step["id"] == item["step_id"])]
                for step in body["steps"]:
                    if step["id"] == item["step_id"] and not step.get("isDeadline"):
                        step["done"] = completed
                plan = _new_plan(record, PlanSave(steps=body["steps"], revision=body["revision"]))
                self._write_plan(transaction, doc_id, record, plan)
                return plan
            # 기존 팀원이 등록한 legacy todos도 관리 기능을 유지한다.
            if delete:
                transaction.delete(todo_ref)
            else:
                transaction.update(todo_ref, {"is_completed": completed, "updated_at": _now()})
            return None
        return mutate(self.db.transaction())


@lru_cache
def _create_store():
    return FirestoreStore() if get_settings().storage_backend == "firestore" else MemoryStore()


def get_store():
    # lru_cache는 최초 동시 호출에서 생성 함수를 여러 번 실행할 수 있다.
    with _store_lock:
        return _create_store()
