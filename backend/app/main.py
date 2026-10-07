from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError

from app.api.routes import router
from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title="ActionDoc Agent API",
    description="근거 검증 기반 생활문서 이해 및 행동 실행 AI 에이전트 — 접수·추출·검증 단계",
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.exception_handler(GoogleAPICallError)
@app.exception_handler(GoogleAuthError)
async def storage_error(request, exc):
    return JSONResponse(status_code=503, content={"detail": "문서 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."})


@app.get("/health")
def health():
    return {"status": "ok", "llm_provider": settings.llm_provider, "storage": settings.storage_backend}
