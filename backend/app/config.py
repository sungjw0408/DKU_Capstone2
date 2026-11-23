from functools import lru_cache
from pydantic import Field

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    llm_provider: str = "mock"  # "gemini" | "mock"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.8-flash"
    gemini_fallback_models: str = ""  # 쉼표로 구분, 예: "모델A,모델B"
    gemini_retries: int = 2
    use_vertex: bool = False
    gcp_project: str | None = None
    gcp_location: str = "us-central1"

    storage_backend: str = "memory"  # "memory" | "firestore"
    google_application_credentials: str | None = None
    originals_dir: str = "data/originals"  # 원문 근거 화면용 원본 PDF 보관 위치

    review_threshold: int = 80
    timezone: str = "Asia/Seoul"
    cors_origins: list[str] = ["*"]

    category_model_enabled: bool = False
    category_model_path: str = "eval/models/category_v4/model.joblib"
    category_model_threshold: float = Field(
        default=0.5, ge=0, le=1
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
