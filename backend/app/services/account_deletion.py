"""자신의 사용자 트리·원본·Auth 계정을 삭제. 실패한 작업은 서버가 재개한다."""
import asyncio
import logging
from firebase_admin import auth, firestore
from fastapi.concurrency import run_in_threadpool

from app.config import get_settings
from app.services.account_state import get_account_state
from app.services.firebase_admin_client import get_firebase_app
from app.services.store import get_store, forget_memory_user
from app.services.user_profiles import get_profile_store
from app.services import originals

logger = logging.getLogger(__name__)


def _descendants(ref):
    # list_documents는 본체가 없고 하위 컬렉션만 남은 문서도 포함한다.
    for collection in ref.collections():
        for child in collection.list_documents():
            yield from _descendants(child)
    yield ref


def delete_firestore_tree(uid):
    db = firestore.client(app=get_firebase_app())
    root = db.collection("users").document(uid)
    batch, count = db.batch(), 0
    for ref in _descendants(root):
        batch.delete(ref)
        count += 1
        if count == 400:
            batch.commit()
            batch, count = db.batch(), 0
    if count:
        batch.commit()
    if root.get().exists or next(root.collections(), None) is not None:
        raise RuntimeError("사용자 데이터 삭제를 다시 시도해야 합니다.")


def delete_auth_user(uid):
    try:
        auth.delete_user(uid, app=get_firebase_app())
    except auth.UserNotFoundError:
        pass  # 이미 Auth 삭제까지 끝났다면 남은 작업만 마무리한다.


def finish_deletion(uid):
    state = get_account_state()
    # UI에서 확인한 요청 또는 이미 기록된 삭제 작업만 이 함수에 전달한다.
    state.begin(uid)
    originals.delete_user_originals(uid)
    if get_settings().storage_backend == "firestore":
        delete_firestore_tree(uid)
    else:
        store = get_store(uid)
        with store._lock:
            store._data.clear()
            store._sources.clear()
            store._todos.clear()
        get_profile_store().delete(uid)
    # 데이터가 모두 삭제된 다음 Auth 계정을 지운다. 실패 시 재인증 후 재시도 가능하다.
    delete_auth_user(uid)
    state.finish(uid)
    forget_memory_user(uid)


async def cleanup_worker():
    from app.api.authn import user_lock
    while True:
        try:
            pending = await run_in_threadpool(get_account_state().list_pending)
            for uid in pending:
                async with user_lock(uid):
                    if await run_in_threadpool(get_account_state().pending, uid):
                        try:
                            await run_in_threadpool(finish_deletion, uid)
                        except Exception:
                            logger.warning("미완료 회원 탈퇴 작업을 다음 주기에 다시 시도합니다.")
        except Exception:
            logger.warning("회원 탈퇴 작업 목록을 확인하지 못했습니다. 다음 주기에 다시 시도합니다.")
        await asyncio.sleep(30)
