import time
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from firebase_admin import auth, exceptions
from app.api.authn import locked_identity, is_anonymous
from app.services.account_deletion import finish_deletion
from app.services.firebase_admin_client import get_firebase_app

router = APIRouter(prefix="/api/me")


class DeleteConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    confirmed: Literal[True]


def guest_without_credentials(identity):
    if not is_anonymous(identity):
        return False
    # 이전 익명 토큰으로, 이후 이메일 등이 연결된 계정의 재인증을 우회하지 못하게 한다.
    try:
        user = auth.get_user(identity["uid"], app=get_firebase_app())
    except auth.UserNotFoundError as exc:
        raise HTTPException(401, "로그인이 만료됐어요. 다시 로그인해 주세요.") from exc
    except exceptions.FirebaseError as exc:
        raise HTTPException(503, "계정 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.") from exc
    return not user.provider_data and not user.email and not user.phone_number


@router.delete("/account")
def delete_account(body: DeleteConfirmation, identity=Depends(locked_identity)):
    auth_time = identity.get("auth_time")
    if not guest_without_credentials(identity) and (
        not isinstance(auth_time, (int, float)) or not 0 <= time.time() - auth_time <= 300
    ):
        raise HTTPException(401, {"code": "recent-login-required", "message": "회원 탈퇴 전에 로그인한 방식으로 본인 확인을 다시 해 주세요."})
    try:
        finish_deletion(identity["uid"])
    except Exception as exc:
        raise HTTPException(503, {"code": "account-deleting", "message": "삭제를 아직 마치지 못했어요. 서버에서 재시도 중이며, 잠시 후 다시 확인해 주세요."}) from exc
    return {"deleted": True}
