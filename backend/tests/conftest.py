from datetime import datetime
from pathlib import Path

import pytest

from app.agents import intake
from app.agents.verification import Verifier
from app.utils.text import split_sentences

SAMPLE = (Path(__file__).parent.parent / "samples" / "scholarship_notice.txt").read_text(encoding="utf-8")
NOW = datetime(2026, 9, 18, 10, 0)


@pytest.fixture
def source():
    return intake.from_text(SAMPLE)


@pytest.fixture
def verifier(source):
    return Verifier(source, split_sentences(source), threshold=80, now=NOW)


@pytest.fixture(autouse=True)
def account_state_for_tests(monkeypatch):
    from app.services import account_state
    state = account_state.MemoryAccountState()
    monkeypatch.setattr(account_state, "_state_store", lambda: state)
    return state


@pytest.fixture(autouse=True)
def legacy_api_login(request):
    # 문서 동작 회귀 테스트는 인증된 사용자로 실행한다. 인증/격리 검사는 별도 테스트에서 수행한다.
    if request.module.__name__.split(".")[-1] not in {"test_api", "test_persistence", "test_image_source", "test_source_pages"}:
        yield
        return
    from app.main import app
    from app.api.authn import active_uid
    app.dependency_overrides[active_uid] = lambda: "regression-user"
    try:
        yield
    finally:
        app.dependency_overrides.pop(active_uid, None)
