"""접수 → 추출 → 검증 파이프라인 (AGENT 01~03)."""
from __future__ import annotations

import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

from app.agents import extraction
from app.agents.verification import Verifier
from app.config import get_settings
from app.llm.base import LLMProvider
from app.schemas import AnalysisResult, SourceDocument
from app.utils.text import split_sentences


def analyze(source: SourceDocument, llm: LLMProvider, now: datetime | None = None,
            document_id: str | None = None) -> AnalysisResult:
    settings = get_settings()
    now = now or datetime.now(ZoneInfo(settings.timezone))
    sentences = split_sentences(source)
    extracted = extraction.extract(sentences, llm, today=now.date().isoformat())
    verifier = Verifier(source, sentences, settings.review_threshold, now)
    return verifier.verify(extracted, document_id=document_id or f"doc-{uuid.uuid4().hex[:10]}", provider=llm.name)
