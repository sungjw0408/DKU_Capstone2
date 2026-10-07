from datetime import date
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from time import sleep

import pytest
from fastapi.testclient import TestClient
from google.genai import errors

from app.api import routes
from app.llm.mock import MockProvider
from app.main import app
from app.services.preparation_plan import document_list_item
from app.services.store import MemoryStore
from app.services import store as store_module
from tests.conftest import SAMPLE


@pytest.fixture
def saved_document(monkeypatch):
    store = MemoryStore()
    monkeypatch.setattr(routes, "get_store", lambda: store)
    monkeypatch.setattr(routes, "get_llm", MockProvider)
    client = TestClient(app)
    result = client.post("/api/documents/analyze", data={"text": SAMPLE}).json()
    steps = [{"id": f'document-todo-{todo["id"]}', "label": todo["text"],
              "date": "", "time": "", "notes": "필요 서류: 신청서", "done": False}
             for todo in result["view"]["todos"]]
    assert len(steps) >= 2
    steps.append({"id": "document-deadline", "label": "최종 마감", "date": "2070-09-25",
                  "time": "17:00", "isDeadline": True, "done": True})
    return client, store, result["documentId"], steps


def put(client, doc_id, steps, revision=0, register=False):
    return client.request("POST" if register else "PUT",
                          f'/api/documents/{doc_id}/plan' + ("/register" if register else ""),
                          json={"steps": steps, "revision": revision})


def test_plan_is_restored_with_manual_fields_and_deadline_is_never_completed(saved_document):
    client, _, doc_id, steps = saved_document
    steps[0].update(date="2070-09-20", time="10:30", durationMinutes=95, done=True,
                    notes="필요 서류: 신청서\n발급 후 업로드")
    response = put(client, doc_id, steps)
    assert response.status_code == 200
    saved = client.get(f"/api/documents/{doc_id}").json()["plan"]
    assert saved == response.json()["plan"]
    assert saved["steps"][0]["durationMinutes"] == 95
    assert saved["steps"][0]["notes"].endswith("발급 후 업로드")
    assert saved["steps"][-1]["done"] is False
    assert saved["registered"] is False
    assert client.get("/api/todos").json() == []


def test_stale_revision_does_not_overwrite_other_screen_changes(saved_document):
    client, _, doc_id, steps = saved_document
    first = put(client, doc_id, steps).json()["plan"]
    steps[0]["label"] = "잘못된 덮어쓰기"
    assert put(client, doc_id, steps, 0).status_code == 409
    assert client.get(f"/api/documents/{doc_id}").json()["plan"] == first


def test_registration_is_idempotent_and_never_registers_deadline(saved_document):
    client, _, doc_id, steps = saved_document
    first = put(client, doc_id, steps, register=True).json()["plan"]
    assert first["registered"] is True
    assert put(client, doc_id, first["steps"], first["revision"], register=True).status_code == 200
    todos = client.get("/api/todos", params={"document_id": doc_id}).json()
    assert len(todos) == len(steps) - 1
    assert len({todo["id"] for todo in todos}) == len(todos)
    assert all(todo["step_id"] != "document-deadline" for todo in todos)


def test_existing_document_todos_are_replaced_by_registered_plan(saved_document):
    client, store, doc_id, steps = saved_document
    store._todos["legacy-item"] = {"document_id": doc_id, "title": steps[0]["label"], "is_completed": False}
    put(client, doc_id, steps, register=True)
    todos = client.get("/api/todos", params={"document_id": doc_id}).json()
    assert len(todos) == len(steps) - 1
    assert all(todo["id"] != "legacy-item" for todo in todos)


def test_first_concurrent_requests_share_one_store(monkeypatch):
    @lru_cache
    def slow_create():
        sleep(0.02)
        return MemoryStore()
    monkeypatch.setattr(store_module, "_create_store", slow_create)
    with ThreadPoolExecutor(max_workers=8) as pool:
        stores = list(pool.map(lambda _: store_module.get_store(), range(8)))
    assert len({id(store) for store in stores}) == 1


def test_management_completion_and_deletion_update_canonical_plan(saved_document):
    client, _, doc_id, steps = saved_document
    put(client, doc_id, steps, register=True)
    todos = client.get("/api/todos").json()
    updated = client.patch(f'/api/todos/{todos[0]["id"]}', json={"is_completed": True})
    assert updated.status_code == 200
    assert updated.json()["plan"]["revision"] == 2
    assert client.get(f"/api/documents/{doc_id}").json()["plan"]["steps"][0]["done"] is True
    assert client.delete(f'/api/todos/{todos[0]["id"]}').status_code == 200
    remaining = client.get(f"/api/documents/{doc_id}").json()["plan"]["steps"]
    assert all(step["id"] != todos[0]["step_id"] for step in remaining)
    assert remaining[-1]["isDeadline"] is True
    assert len(client.get("/api/todos").json()) == len(todos) - 1


def test_lists_use_saved_deadline_and_real_progress(saved_document):
    client, store, doc_id, steps = saved_document
    steps[0]["done"] = True
    put(client, doc_id, steps)
    item = document_list_item(doc_id, store.get_record(doc_id), date(2070, 9, 20))
    assert item["deadline"] == "2070-09-25T17:00"
    assert item["dday"] == -5
    assert item["progress"] == 1 / (len(steps) - 1)
    assert item["title"] == store.get_record(doc_id)["title"]


def test_documents_keep_their_own_todos(saved_document):
    client, _, doc_id, steps = saved_document
    second = client.post("/api/documents/analyze", data={"text": SAMPLE}).json()["documentId"]
    put(client, doc_id, steps, register=True)
    put(client, second, steps, register=True)
    first_todos = client.get("/api/todos", params={"document_id": doc_id}).json()
    second_todos = client.get("/api/todos", params={"document_id": second}).json()
    assert {todo["id"] for todo in first_todos}.isdisjoint({todo["id"] for todo in second_todos})
    assert {todo["document_id"] for todo in first_todos} == {doc_id}


def test_rejected_analysis_todo_is_removed_without_renumbering_saved_steps(saved_document):
    client, _, doc_id, steps = saved_document
    put(client, doc_id, steps, register=True)
    field_id = steps[0]["id"].removeprefix("document-todo-")
    remaining_id = steps[1]["id"]
    response = client.delete(f"/api/documents/{doc_id}/fields/{field_id}")
    assert response.status_code == 200
    assert all(todo["id"] != field_id for todo in response.json()["view"]["todos"])
    plan = response.json()["plan"]
    assert plan["steps"][0]["id"] == remaining_id
    assert len(client.get("/api/todos").json()) == len(steps) - 2


def test_failed_ai_keeps_source_and_retry_uses_same_document(monkeypatch):
    store = MemoryStore()
    monkeypatch.setattr(routes, "get_store", lambda: store)
    monkeypatch.setattr(routes, "get_llm", MockProvider)
    original = routes.pipeline.analyze
    def overloaded(*args, **kwargs):
        raise errors.ServerError(503, {"error": {"message": "overloaded", "status": "UNAVAILABLE"}})
    monkeypatch.setattr(routes.pipeline, "analyze", overloaded)
    client = TestClient(app)
    response = client.post("/api/documents/analyze", data={"text": SAMPLE})
    assert response.status_code == 503
    doc_id = response.json()["detail"]["documentId"]
    assert client.get(f"/api/documents/{doc_id}").status_code == 409
    assert client.post(f"/api/documents/{doc_id}/fields/unknown/confirm", json={}).status_code == 409
    assert client.get(f"/api/documents/{doc_id}/source").json()["pages"] == [SAMPLE.strip()]
    assert store.get_record(doc_id)["status"] == "analysis_failed"
    monkeypatch.setattr(routes.pipeline, "analyze", original)
    retried = client.post(f"/api/documents/{doc_id}/retry")
    assert retried.status_code == 200
    assert retried.json()["documentId"] == doc_id
    assert len(store.list_records()) == 1
    # 분석이 완료된 문서의 재시도는 AI를 다시 호출하지 않는다.
    monkeypatch.setattr(routes.pipeline, "analyze", overloaded)
    assert client.post(f"/api/documents/{doc_id}/retry").status_code == 200


@pytest.mark.parametrize("change", [
    {"date": "2070-02-30"}, {"time": "24:00"}, {"durationMinutes": 0},
    {"date": "2070-09-26"}, {"id": "document-deadline"},
])
def test_invalid_schedule_does_not_save_partial_changes(saved_document, change):
    client, _, doc_id, steps = saved_document
    steps[0].update(change)
    assert put(client, doc_id, steps).status_code == 422
    assert client.get(f"/api/documents/{doc_id}").json()["plan"] is None
