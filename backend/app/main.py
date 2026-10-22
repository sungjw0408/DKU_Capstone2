import asyncio
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from google.api_core.exceptions import GoogleAPICallError
from google.auth.exceptions import GoogleAuthError

from app.api.routes import router
from app.api.profiles import router as profiles_router
from app.api.accounts import router as accounts_router
from app.services.account_deletion import cleanup_worker
from app.services.account_state import AccountDeleting
from app.config import get_settings

settings = get_settings()


@asynccontextmanager
async def lifespan(app):
    cleanup = asyncio.create_task(cleanup_worker())
    yield
    cleanup.cancel()
    with suppress(asyncio.CancelledError):
        await cleanup

app = FastAPI(
    title="ActionDoc Agent API",
    description="근거 검증 기반 생활문서 이해 및 행동 실행 AI 에이전트 — 접수·추출·검증 단계",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
app.include_router(profiles_router)
app.include_router(accounts_router)


@app.middleware("http")
async def private_api_responses(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["Vary"] = "Authorization"
    return response


@app.exception_handler(AccountDeleting)
async def account_deleting(request, exc):
    return JSONResponse(status_code=423, content={"detail": {"code": "account-deleting", "message": "회원 탈퇴를 진행하고 있어요. 삭제를 마무리해 주세요."}})


@app.exception_handler(GoogleAPICallError)
@app.exception_handler(GoogleAuthError)
async def storage_error(request, exc):
    return JSONResponse(status_code=503, content={"detail": "문서 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요."})


@app.get("/health")
def health():
    return {"status": "ok", "llm_provider": settings.llm_provider, "storage": settings.storage_backend}
