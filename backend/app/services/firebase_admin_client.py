"""기존 문서 저장소와 인증 API가 공유하는 Firebase Admin 초기화."""
from threading import RLock

import firebase_admin
from firebase_admin import credentials

from app.config import get_settings

_lock = RLock()


def get_firebase_app():
    with _lock:
        try:
            return firebase_admin.get_app()
        except ValueError:
            settings = get_settings()
            credential = credentials.Certificate(settings.google_application_credentials) if settings.google_application_credentials else None
            options = {"projectId": settings.gcp_project} if settings.gcp_project else None
            return firebase_admin.initialize_app(credential, options)
