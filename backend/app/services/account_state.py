"""탈퇴 진행 상태. 사용자 트리를 삭제하는 동안에도 새 저장 요청을 막는다."""
from datetime import datetime, timezone
from functools import lru_cache
from threading import RLock

from fastapi import HTTPException
from app.config import get_settings
from app.services.firebase_admin_client import get_firebase_app


class AccountDeleting(Exception):
    pass


class MemoryAccountState:
    def __init__(self):
        self.states = {}
        self.lock = RLock()

    def pending(self, uid):
        with self.lock:
            return uid in self.states

    def begin(self, uid):
        with self.lock:
            self.states.setdefault(uid, {"startedAt": datetime.now(timezone.utc).isoformat()})

    def finish(self, uid):
        with self.lock:
            self.states.pop(uid, None)

    def list_pending(self):
        with self.lock:
            return list(self.states)[:100]


class FirestoreAccountState:
    def __init__(self):
        from firebase_admin import firestore
        self.db = firestore.client(app=get_firebase_app())
        self.col = self.db.collection("accountDeletions")

    def pending(self, uid):
        return self.col.document(uid).get().exists

    def begin(self, uid):
        self.col.document(uid).set({"startedAt": datetime.now(timezone.utc).isoformat()})

    def finish(self, uid):
        self.col.document(uid).delete()

    def list_pending(self):
        return [snap.id for snap in self.col.limit(100).stream()]


_lock = RLock()


@lru_cache
def _state_store():
    return FirestoreAccountState() if get_settings().storage_backend == "firestore" else MemoryAccountState()


def get_account_state():
    with _lock:
        return _state_store()


def require_active(uid):
    if get_account_state().pending(uid):
        raise HTTPException(423, {"code": "account-deleting", "message": "회원 탈퇴를 진행하고 있어요. 삭제를 마무리해 주세요."})
