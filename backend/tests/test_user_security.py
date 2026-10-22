import io
import time
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from fastapi.testclient import TestClient
from firebase_admin import auth
from PIL import Image

from app.api import authn, routes
from app.config import get_settings
from app.llm.mock import MockProvider
from app.main import app
from app.schemas import LLMLine
from app.services import account_deletion, originals, store as stores, user_profiles
from app.services.user_profiles import MemoryProfileStore, get_affiliations
from tests.conftest import SAMPLE


@pytest.fixture
def secured(monkeypatch, tmp_path, account_state_for_tests):
    monkeypatch.setattr(stores, "_user_memory_stores", {})
    profiles = MemoryProfileStore()
    monkeypatch.setattr(user_profiles, "_profile_store", lambda: profiles)
    monkeypatch.setattr(get_settings(), "originals_dir", str(tmp_path))
    monkeypatch.setattr(routes, "get_llm", MockProvider)
    deleted = set()
    def verify(token):
        if token not in {"alice", "bob", "stale"} or token in deleted:
            raise auth.InvalidIdTokenError("invalid")
        return {"uid": token, "auth_time": time.time() - (1000 if token == "stale" else 0)}
    monkeypatch.setattr(authn, "verify_token", verify)
    monkeypatch.setattr(account_deletion, "delete_auth_user", lambda uid: deleted.add(uid))
    return {"client": TestClient(app), "profiles": profiles, "deleted": deleted,
            "state": account_state_for_tests, "files": tmp_path}


def headers(uid="alice"):
    return {"Authorization": f"Bearer {uid}"}


def upload(client, uid="alice"):
    response = client.post("/api/documents/analyze", headers=headers(uid), data={"text": SAMPLE})
    assert response.status_code == 200, response.text
    return response.json()


def register(client, result, uid="alice"):
    steps = [{"id": "prepare", "label": "서류 확인", "date": "2070-09-20", "time": "10:00", "notes": "개인 메모"},
             {"id": "deadline", "label": "최종 마감", "date": "2070-09-25", "time": "17:00", "isDeadline": True}]
    response = client.post(f'/api/documents/{result["documentId"]}/plan/register', headers=headers(uid), json={"steps": steps, "revision": 0})
    assert response.status_code == 200, response.text
    return response.json()["plan"]


PROTECTED = [
    ("GET", "/api/documents", None), ("POST", "/api/documents/analyze", None),
    ("GET", "/api/documents/foreign", None), ("GET", "/api/documents/foreign/source", None),
    ("GET", "/api/documents/foreign/pages/1/image", None), ("POST", "/api/documents/foreign/retry", None),
    ("PATCH", "/api/documents/foreign", {"title": "changed"}), ("DELETE", "/api/documents/foreign", None),
    ("PUT", "/api/documents/foreign/plan", {"steps": [], "revision": 0}),
    ("POST", "/api/documents/foreign/plan/register", {"steps": [], "revision": 0}),
    ("POST", "/api/documents/foreign/fields/f/confirm", {}), ("DELETE", "/api/documents/foreign/fields/f", None),
    ("GET", "/api/todos", None), ("PATCH", "/api/todos/foreign", {"is_completed": True}),
    ("DELETE", "/api/todos/foreign", None), ("DELETE", "/api/me/account", {"confirmed": True}),
]


@pytest.mark.parametrize("token", [None, "invalid"])
@pytest.mark.parametrize("method,path,body", PROTECTED)
def test_every_personal_route_requires_valid_auth(secured, token, method, path, body):
    response = secured["client"].request(method, path, headers=headers(token) if token else {},
                                         **({"json": body} if body is not None else {}))
    assert response.status_code == 401, (path, response.text)


def test_accounts_have_independent_lists_and_cannot_read_or_mutate_each_other(secured):
    client = secured["client"]
    a, b = upload(client), upload(client, "bob")
    register(client, a)
    register(client, b, "bob")
    assert {d["id"] for d in client.get("/api/documents", headers=headers()).json()} == {a["documentId"]}
    assert {d["id"] for d in client.get("/api/documents", headers=headers("bob")).json()} == {b["documentId"]}
    assert {t["document_id"] for t in client.get("/api/todos", headers=headers("bob")).json()} == {b["documentId"]}
    field = a["analysis"]["fields"][0]["id"]
    doc = a["documentId"]
    before = client.get(f"/api/documents/{doc}", headers=headers()).json()
    attempts = [("GET", f"/api/documents/{doc}", None), ("GET", f"/api/documents/{doc}/source", None),
                ("GET", f"/api/documents/{doc}/pages/1/image", None), ("POST", f"/api/documents/{doc}/retry", None),
                ("PATCH", f"/api/documents/{doc}", {"title": "stolen"}), ("DELETE", f"/api/documents/{doc}", None),
                ("PUT", f"/api/documents/{doc}/plan", {"steps": before["plan"]["steps"], "revision": 1}),
                ("POST", f"/api/documents/{doc}/plan/register", {"steps": before["plan"]["steps"], "revision": 1}),
                ("POST", f"/api/documents/{doc}/fields/{field}/confirm", {"value": "stolen"}),
                ("DELETE", f"/api/documents/{doc}/fields/{field}", None)]
    for method, path, body in attempts:
        response = client.request(method, path, headers=headers("bob"), **({"json": body} if body is not None else {}))
        assert response.status_code == 404, (path, response.text)
    todo = client.get("/api/todos", headers=headers()).json()[0]["id"]
    assert client.patch(f"/api/todos/{todo}", headers=headers("bob"), json={"is_completed": True}).status_code == 404
    assert client.delete(f"/api/todos/{todo}", headers=headers("bob")).status_code == 404
    assert client.get("/api/todos", headers=headers("bob"), params={"document_id": doc}).json() == []
    assert client.get(f"/api/documents/{doc}", headers=headers()).json() == before


def test_uid_in_form_or_query_cannot_choose_another_users_storage(secured):
    client = secured["client"]
    response = client.post("/api/documents/analyze", headers=headers("bob"), data={"text": SAMPLE, "uid": "alice"})
    assert response.status_code == 200
    assert client.get("/api/documents?uid=bob", headers=headers()).json() == []
    assert len(client.get("/api/documents?uid=alice", headers=headers("bob")).json()) == 1


def test_original_image_is_authenticated_and_namespaced(secured, monkeypatch):
    class Images(MockProvider):
        def transcribe_lines(self, data, mime_type):
            return [LLMLine(text=line, box_2d=[10, 10, 20, 900]) for line in SAMPLE.splitlines() if line.strip()]
    monkeypatch.setattr(routes, "get_llm", Images)
    buffer = io.BytesIO()
    Image.new("RGB", (300, 400), "white").save(buffer, format="PNG")
    content = buffer.getvalue()
    response = secured["client"].post("/api/documents/analyze", headers=headers(), files={"file": ("notice.png", content, "image/png")})
    doc = response.json()["documentId"]
    image = f"/api/documents/{doc}/pages/1/image"
    assert secured["client"].get(image, headers=headers()).content == content
    assert secured["client"].get(image, headers=headers("bob")).status_code == 404
    assert secured["client"].get(image).status_code == 401
    assert secured["client"].get(image, headers=headers()).headers["cache-control"] == "private, no-store"
    assert any(p.name.startswith(originals.user_prefix("alice")) for p in secured["files"].iterdir())
    assert not any(p.name.startswith(originals.user_prefix("bob")) for p in secured["files"].iterdir())


def test_deletion_requires_explicit_confirmation_recent_auth_and_never_accepts_uid(secured):
    client = secured["client"]
    for body in [{}, {"confirmed": False}, {"confirmed": True, "uid": "bob"}]:
        assert client.request("DELETE", "/api/me/account", headers=headers(), json=body).status_code == 422
    response = client.request("DELETE", "/api/me/account", headers=headers("stale"), json={"confirmed": True})
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "recent-login-required"
    assert secured["deleted"] == set()
    assert secured["state"].list_pending() == []


def test_account_deletion_removes_only_own_profile_documents_todos_and_originals(secured):
    client = secured["client"]
    a, b = upload(client), upload(client, "bob")
    register(client, a)
    register(client, b, "bob")
    college = get_affiliations()["colleges"][0]
    selection = {"collegeId": college["id"], "departmentId": college["departments"][0]["id"]}
    for uid in ("alice", "bob"):
        assert client.put("/api/me/profile", headers=headers(uid), json=selection).status_code == 200
        (secured["files"] / (originals.user_prefix(uid) + "orphan.pdf")).write_bytes(b"owned")
    before_b = stores.get_store("bob").list_records()
    legacy = stores.get_store()
    legacy.save_source("legacy-shared", routes.intake.from_text(SAMPLE))
    response = client.request("DELETE", "/api/me/account", headers=headers(), json={"confirmed": True})
    assert response.status_code == 200 and response.json() == {"deleted": True}
    assert secured["deleted"] == {"alice"}
    assert secured["profiles"].get("alice") is None and secured["profiles"].get("bob")
    assert stores.get_store("alice").list_records() == []
    assert stores.get_store("alice").list_todos() == []
    assert not list(secured["files"].glob(originals.user_prefix("alice") + "*"))
    assert list(secured["files"].glob(originals.user_prefix("bob") + "*"))
    assert stores.get_store("bob").list_records() == before_b
    assert legacy.get_record("legacy-shared")
    assert secured["state"].list_pending() == []
    assert client.get("/api/documents", headers=headers()).status_code == 401


def test_failed_deletion_blocks_writes_and_can_resume_without_recreating_an_account(secured, monkeypatch):
    client = secured["client"]
    register(client, upload(client))
    def unavailable(uid):
        raise RuntimeError("Auth unavailable")
    monkeypatch.setattr(account_deletion, "delete_auth_user", unavailable)
    response = client.request("DELETE", "/api/me/account", headers=headers(), json={"confirmed": True})
    assert response.status_code == 503
    assert secured["state"].pending("alice")
    assert client.post("/api/documents/analyze", headers=headers(), data={"text": SAMPLE}).status_code == 423
    assert client.get("/api/todos", headers=headers()).status_code == 423
    assert client.get("/api/me/profile", headers=headers()).json()["accountDeletionPending"] is True
    monkeypatch.setattr(account_deletion, "delete_auth_user", lambda uid: secured["deleted"].add(uid))
    assert client.request("DELETE", "/api/me/account", headers=headers(), json={"confirmed": True}).status_code == 200
    assert not secured["state"].pending("alice")
    assert stores.get_store("alice").list_records() == []


def test_deletion_waits_for_inflight_analysis_and_does_not_block_other_accounts(secured, monkeypatch):
    entered, resume = Event(), Event()
    analyze = routes.pipeline.analyze
    def waiting(*args, **kwargs):
        entered.set()
        assert resume.wait(5)
        return analyze(*args, **kwargs)
    monkeypatch.setattr(routes.pipeline, "analyze", waiting)
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=3) as pool:
        pending = pool.submit(client.post, "/api/documents/analyze", headers=headers(), data={"text": SAMPLE})
        assert entered.wait(3)
        deletion = pool.submit(client.request, "DELETE", "/api/me/account", headers=headers(), json={"confirmed": True})
        try:
            assert client.get("/api/documents", headers=headers("bob")).status_code == 200
            assert not deletion.done()
        finally:
            resume.set()
        assert pending.result(timeout=5).status_code == 200
        assert deletion.result(timeout=5).status_code == 200
    assert stores.get_store("alice").list_records() == []


def test_firestore_deletion_recurses_through_orphans_and_batches_over_500_records(monkeypatch):
    records = {"users/alice", "users/alice/documents/doc", "users/bob", "users/bob/documents/keep"}
    records.update(f"users/alice/documents/doc/sourceChunks/{index}" for index in range(505))
    records.add("users/alice/futureCollection/missingParent/nested/child")
    sizes = []
    class Reference:
        def __init__(self, path): self.path = path
        def collections(self):
            prefix = self.path + "/"
            names = {path[len(prefix):].split("/")[0] for path in records if path.startswith(prefix)}
            return iter(Collection(prefix + name) for name in sorted(names))
        def get(self):
            return type("Snapshot", (), {"exists": self.path in records})()
    class Collection:
        def __init__(self, path): self.path = path
        def document(self, name): return Reference(self.path + "/" + name)
        def list_documents(self):
            prefix = self.path + "/"
            names = {path[len(prefix):].split("/")[0] for path in records if path.startswith(prefix)}
            return iter(Reference(prefix + name) for name in sorted(names))
    class Batch:
        def __init__(self): self.paths = []
        def delete(self, ref): self.paths.append(ref.path)
        def commit(self):
            sizes.append(len(self.paths))
            for path in self.paths: records.discard(path)
    class Database:
        def collection(self, name): return Collection(name)
        def batch(self): return Batch()
    monkeypatch.setattr(account_deletion, "get_firebase_app", lambda: None)
    monkeypatch.setattr(account_deletion.firestore, "client", lambda **kwargs: Database())
    account_deletion.delete_firestore_tree("alice")
    assert records == {"users/bob", "users/bob/documents/keep"}
    assert len(sizes) >= 2 and max(sizes) <= 400
