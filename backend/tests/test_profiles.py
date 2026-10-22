import pytest
from fastapi.testclient import TestClient
from firebase_admin import auth, exceptions

from app.api import profiles, authn
from app.main import app
from app.services.user_profiles import FirestoreProfileStore, MemoryProfileStore, get_affiliations

client = TestClient(app)


@pytest.fixture
def profile_store(monkeypatch):
    store = MemoryProfileStore()
    monkeypatch.setattr(profiles, "get_profile_store", lambda: store)
    def verify(token):
        if token not in ("alice", "bob"):
            raise auth.InvalidIdTokenError("invalid")
        return {"uid": token}
    monkeypatch.setattr(authn, "verify_token", verify)
    return store


def selection(index=0):
    college = get_affiliations()["colleges"][index]
    return {"collegeId": college["id"], "departmentId": college["departments"][0]["id"]}


def headers(uid="alice"):
    return {"Authorization": f"Bearer {uid}"}


def test_public_catalog_contains_only_jukjeon():
    response = client.get("/api/auth/affiliations")
    assert response.status_code == 200
    catalog = response.json()
    assert catalog["university"]["campusId"] == "jukjeon"
    assert len(catalog["colleges"]) == 10
    ids = [d["id"] for c in catalog["colleges"] for d in c["departments"]]
    assert len(ids) == len(set(ids)) == 63
    assert all(c["departments"] for c in catalog["colleges"])


@pytest.mark.parametrize("header", [{}, {"Authorization": "Basic alice"}, headers("fake")])
@pytest.mark.parametrize("method", ["get", "put"])
def test_missing_or_invalid_login_rejected(profile_store, header, method):
    response = client.request(method, "/api/me/profile", headers=header,
                              **({"json": selection()} if method == "put" else {}))
    assert response.status_code == 401
    assert profile_store.profiles == {}


@pytest.mark.parametrize("failure", [auth.ExpiredIdTokenError("expired", None),
    auth.RevokedIdTokenError("revoked"), auth.UserDisabledError("disabled"), auth.UserNotFoundError("deleted")])
def test_expired_revoked_disabled_deleted_login_rejected(profile_store, monkeypatch, failure):
    def verify(_):
        raise failure
    monkeypatch.setattr(authn, "verify_token", verify)
    assert client.get("/api/me/profile", headers=headers()).status_code == 401


def test_auth_service_failure_is_retryable(profile_store, monkeypatch):
    def verify(_):
        raise exceptions.UnavailableError("offline")
    monkeypatch.setattr(authn, "verify_token", verify)
    assert client.get("/api/me/profile", headers=headers()).status_code == 503


def test_profile_is_private_and_reloaded_by_verified_uid(profile_store):
    assert client.get("/api/me/profile", headers=headers()).json() == {"profile": None, "accountDeletionPending": False}
    created = client.put("/api/me/profile", headers=headers(), json=selection()).json()["profile"]
    assert created["uid"] == "alice"
    assert created["campusName"] == "죽전"
    assert "password" not in created and "email" not in created
    assert client.get("/api/me/profile", headers=headers()).json()["profile"] == created
    assert client.get("/api/me/profile", headers=headers("bob")).json() == {"profile": None, "accountDeletionPending": False}
    bob = client.put("/api/me/profile", headers=headers("bob"), json=selection(1)).json()["profile"]
    assert bob["uid"] == "bob" and bob["collegeId"] != created["collegeId"]
    assert client.get("/api/me/profile", headers=headers()).json()["profile"] == created


def test_profile_retry_preserves_created_at(profile_store):
    created = client.put("/api/me/profile", headers=headers(), json=selection()).json()["profile"]
    updated = client.put("/api/me/profile", headers=headers(), json=selection(1)).json()["profile"]
    assert updated["createdAt"] == created["createdAt"]
    assert updated["collegeId"] == selection(1)["collegeId"]
    assert len(profile_store.profiles) == 1


@pytest.mark.parametrize("extra", [{"uid": "bob"}, {"collegeName": "spoof"}, {"password": "secret"}])
def test_uid_and_profile_names_cannot_be_spoofed(profile_store, extra):
    assert client.put("/api/me/profile", headers=headers(), json={**selection(), **extra}).status_code == 422
    assert profile_store.profiles == {}


def test_department_must_belong_to_college(profile_store):
    body = {**selection(), "departmentId": selection(1)["departmentId"]}
    assert client.put("/api/me/profile", headers=headers(), json=body).status_code == 422
    assert profile_store.profiles == {}


def test_firebase_token_verification_checks_revocation(monkeypatch):
    sentinel = object()
    monkeypatch.setattr(authn, "get_firebase_app", lambda: sentinel)
    def verified(token, **kwargs):
        assert token == "only-in-test"
        assert kwargs == {"app": sentinel, "check_revoked": True}
        return {"uid": "alice"}
    monkeypatch.setattr(auth, "verify_id_token", verified)
    assert authn.verify_token("only-in-test") == {"uid": "alice"}


def test_old_or_unrelated_firestore_fields_are_not_exposed():
    class Snapshot:
        exists = True
        data = {**selection(), "uid": "forged", "privateOtherField": "hidden"}
        def to_dict(self):
            return self.data
    class FakeDB:
        def collection(self, name):
            assert name == "users"
            return self
        def document(self, uid):
            assert uid == "alice"
            return self
        def get(self):
            return Snapshot()
    store = object.__new__(FirestoreProfileStore)
    store.db = FakeDB()
    profile = store.get("alice")
    assert profile["uid"] == "alice" and "privateOtherField" not in profile
    Snapshot.data = {"collegeId": "obsolete", "departmentId": "obsolete"}
    assert store.get("alice") is None
