"""계정별 소속 프로필. 기존 documents/todos 저장 경로와 분리한다."""
import copy
import json
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from threading import RLock

from pydantic import BaseModel, ConfigDict, Field

from app.config import get_settings
from app.services.firebase_admin_client import get_firebase_app


@lru_cache
def get_affiliations():
    path = Path(__file__).resolve().parents[1] / "data" / "affiliations.json"
    return json.loads(path.read_text(encoding="utf-8"))


class ProfileSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    collegeId: str = Field(min_length=1, max_length=100)
    departmentId: str = Field(min_length=1, max_length=160)


def resolve_affiliation(selection: ProfileSelection):
    catalog = get_affiliations()
    college = next((c for c in catalog["colleges"] if c["id"] == selection.collegeId), None)
    department = next((d for d in (college or {}).get("departments", []) if d["id"] == selection.departmentId), None)
    if not college or not department:
        raise ValueError("선택한 단과대에 속한 학과를 다시 선택해 주세요.")
    university = catalog["university"]
    return {"universityId": university["id"], "universityName": university["name"],
            "campusId": university["campusId"], "campusName": university["campusName"],
            "collegeId": college["id"], "collegeName": college["name"], "collegeAliases": college.get("aliases", []),
            "departmentId": department["id"], "departmentName": department["name"],
            "departmentAliases": department.get("aliases", []), "catalogVersion": catalog["version"]}


def public_profile(uid, data):
    common = {"uid": uid, **{key: data[key] for key in ("createdAt", "updatedAt") if key in data}}
    if data.get("accountType") == "guest":
        return {**common, "accountType": "guest"}
    try:
        affiliation = resolve_affiliation(ProfileSelection(
            collegeId=data.get("collegeId", ""), departmentId=data.get("departmentId", "")))
    except ValueError:
        return None  # 이전 목록의 소속은 다시 선택할 수 있게 한다.
    return {**affiliation, **common, "accountType": "member"}


def new_guest_profile(uid, previous):
    now = datetime.now(timezone.utc).isoformat()
    return {"uid": uid, "accountType": "guest", "createdAt": previous.get("createdAt", now), "updatedAt": now}


class MemoryProfileStore:
    def __init__(self):
        self.profiles = {}
        self.lock = RLock()

    def get(self, uid):
        with self.lock:
            return copy.deepcopy(self.profiles.get(uid))

    def save(self, uid, selection):
        affiliation = resolve_affiliation(selection)
        with self.lock:
            now = datetime.now(timezone.utc).isoformat()
            profile = {**affiliation, "uid": uid, "accountType": "member", "createdAt": (self.profiles.get(uid) or {}).get("createdAt", now), "updatedAt": now}
            self.profiles[uid] = profile
            return copy.deepcopy(profile)

    def ensure_guest(self, uid):
        with self.lock:
            previous = self.profiles.get(uid) or {}
            profile = public_profile(uid, previous) or new_guest_profile(uid, previous)
            self.profiles[uid] = profile
            return copy.deepcopy(profile)

    def delete(self, uid):
        with self.lock:
            self.profiles.pop(uid, None)


class FirestoreProfileStore:
    def __init__(self):
        from firebase_admin import firestore
        self.db = firestore.client(app=get_firebase_app())

    def get(self, uid):
        snap = self.db.collection("users").document(uid).get()
        if not snap.exists:
            return None
        # 이 API가 관리하는 프로필 필드만 응답한다.
        return public_profile(uid, snap.to_dict())

    def ensure_guest(self, uid):
        from firebase_admin import firestore
        ref = self.db.collection("users").document(uid)

        @firestore.transactional
        def create(transaction):
            from app.services.account_state import AccountDeleting
            if self.db.collection("accountDeletions").document(uid).get(transaction=transaction).exists:
                raise AccountDeleting()
            snap = ref.get(transaction=transaction)
            previous = snap.to_dict() if snap.exists else {}
            profile = public_profile(uid, previous)
            if profile:
                return profile
            profile = new_guest_profile(uid, previous)
            transaction.set(ref, profile, merge=True)
            return profile

        return create(self.db.transaction())

    def save(self, uid, selection):
        from firebase_admin import firestore
        affiliation = resolve_affiliation(selection)
        ref = self.db.collection("users").document(uid)

        @firestore.transactional
        def save(transaction):
            from app.services.account_state import AccountDeleting
            marker = self.db.collection("accountDeletions").document(uid)
            if marker.get(transaction=transaction).exists:
                raise AccountDeleting()
            snap = ref.get(transaction=transaction)
            now = datetime.now(timezone.utc).isoformat()
            previous = snap.to_dict() if snap.exists else {}
            profile = {**affiliation, "uid": uid, "accountType": "member", "createdAt": previous.get("createdAt", now), "updatedAt": now}
            transaction.set(ref, profile, merge=True)
            return profile

        return save(self.db.transaction())


_store_lock = RLock()


@lru_cache
def _profile_store():
    return FirestoreProfileStore() if get_settings().storage_backend == "firestore" else MemoryProfileStore()


def get_profile_store():
    with _store_lock:
        return _profile_store()
