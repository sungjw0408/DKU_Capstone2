"""모든 개인 데이터 API가 공유하는 Firebase 인증 및 사용자별 요청 직렬화."""
import asyncio
from weakref import WeakKeyDictionary, WeakValueDictionary
from fastapi import Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth, exceptions
from app.services.firebase_admin_client import get_firebase_app
from app.services.account_state import require_active

bearer = HTTPBearer(auto_error=False)
_loop_locks = WeakKeyDictionary()


def user_lock(uid):
    loop = asyncio.get_running_loop()
    locks = _loop_locks.setdefault(loop, WeakValueDictionary())
    lock = locks.get(uid)
    if lock is None:
        lock = asyncio.Lock()
        locks[uid] = lock
    return lock


def verify_token(token):
    return auth.verify_id_token(token, app=get_firebase_app(), check_revoked=True)


def is_anonymous(identity):
    firebase = identity.get("firebase")
    return isinstance(firebase, dict) and firebase.get("sign_in_provider") == "anonymous"


def verified_identity(credential: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not credential or credential.scheme.lower() != "bearer":
        raise HTTPException(401, "로그인이 필요해요.", headers={"WWW-Authenticate": "Bearer"})
    try:
        decoded = verify_token(credential.credentials)
        uid = decoded.get("uid")
        if not isinstance(uid, str) or not uid or len(uid) > 128 or "/" in uid:
            raise ValueError("Invalid UID")
        return decoded
    except (auth.InvalidIdTokenError, auth.UserDisabledError, auth.UserNotFoundError, ValueError) as exc:
        raise HTTPException(401, "로그인이 만료됐어요. 다시 로그인해 주세요.", headers={"WWW-Authenticate": "Bearer"}) from exc
    except auth.CertificateFetchError as exc:
        raise HTTPException(503, "로그인 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.") from exc
    except exceptions.FirebaseError as exc:
        raise HTTPException(503, "로그인 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.") from exc


async def locked_identity(credential: HTTPAuthorizationCredentials | None = Depends(bearer)):
    identity = await run_in_threadpool(verified_identity, credential)
    async with user_lock(identity["uid"]):
        # 기다리는 동안 탈퇴/계정 정지가 완료됐을 수 있으므로 잠금 후 다시 확인한다.
        identity = await run_in_threadpool(verified_identity, credential)
        yield identity


def active_uid(identity=Depends(locked_identity)):
    uid = identity["uid"]
    require_active(uid)
    return uid
