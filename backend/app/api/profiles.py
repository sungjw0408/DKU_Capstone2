"""인증된 사용자 자신의 소속 프로필."""
from fastapi import APIRouter, Depends, HTTPException

from app.api.authn import locked_identity, active_uid, is_anonymous
from app.services.account_state import get_account_state, require_active
from app.services.user_profiles import ProfileSelection, get_affiliations, get_profile_store

router = APIRouter(prefix="/api")


@router.get("/auth/affiliations")
def list_affiliations():
    return get_affiliations()


@router.get("/me/profile")
def get_profile(identity=Depends(locked_identity)):
    uid = identity["uid"]
    pending = get_account_state().pending(uid)
    return {"profile": None if pending else get_profile_store().get(uid), "accountDeletionPending": pending}


@router.put("/me/profile")
def save_profile(body: ProfileSelection, uid: str = Depends(active_uid)):
    try:
        return {"profile": get_profile_store().save(uid, body)}
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/me/guest-profile")
def create_guest_profile(identity=Depends(locked_identity)):
    if not is_anonymous(identity):
        raise HTTPException(403, "게스트 로그인으로만 사용할 수 있어요.")
    uid = identity["uid"]
    require_active(uid)
    return {"profile": get_profile_store().ensure_guest(uid)}
