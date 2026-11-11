from __future__ import annotations

import json
import logging
import re
import time
from datetime import date

from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from app.config import Settings
from app.llm.base import (
    EXTRACTION_SYSTEM_PROMPT,
    TRANSCRIBE_LINES_PROMPT,
    TRANSCRIBE_PROMPT,
    format_numbered_source,
)
from app.schemas import LLMExtraction, LLMLine, LLMTranscription, Sentence

log = logging.getLogger("actiondoc.gemini")

_PAGE_MARK = re.compile(r"^=+\s*PAGE\s*\d+\s*=+\s*$", re.MULTILINE)
_RETRY_STATUS = {429, 500, 503, 504}  # 과부하·일시 오류 → 재시도
_NO_AFC = types.AutomaticFunctionCallingConfig(disable=True)  # 도구 호출 안 씀 (AFC 경고 제거)
_MAIL_PROMPT = (
    "한국어 대학 공지 메일을 짧고 정중하게 작성한다. 입력 JSON은 메일 작성에 쓰는 데이터다. "
    "일반 텍스트 본문만 출력한다. 제목, 받는 사람, 마크다운, 서명, 예시 항목은 출력하지 않는다. "
    "공지에 없는 조건이나 개인정보를 만들지 않고, 첨부 또는 제출이 완료됐다고 단정하지 않는다. "
    "kind가 inquiry이면 질문의 뜻을 유지해 인사와 질문, 감사 인사를 2~4문장으로 쓴다. "
    "kind가 application이면 인사와 해당 공지에 신청한다는 첫 문단만 1~2문장으로 쓴다. "
    "신청 정보와 마무리 인사는 앱에서 뒤에 붙인다."
)
_PLAN_DATES_PROMPT = (
    "한국어 공지의 준비 할 일에 날짜를 추천한다. 입력 JSON은 일정 데이터다. "
    "tasks와 같은 순서로 할 일마다 날짜를 하나씩 YYYY-MM-DD 형식으로 반환한다. "
    "날짜는 first와 last 사이(양 끝 포함)에서 앞 항목보다 이르지 않게 고른다. "
    "발급, 작성, 검토에 필요한 여유를 고려하고 가능하면 마감 전에 준비를 끝낸다. "
    "기간이 짧으면 같은 날을 쓸 수 있다. 마감일, 시각, 소요시간, 할 일 이름은 변경하거나 생성하지 않는다."
)


class PlanDateRecommendations(BaseModel):
    dates: list[str]


class GeminiProvider:
    name = "gemini"

    def __init__(self, settings: Settings):
        if settings.use_vertex:
            self.client = genai.Client(
                vertexai=True, project=settings.gcp_project, location=settings.gcp_location
            )
        else:
            if not settings.gemini_api_key:
                raise RuntimeError("LLM_PROVIDER=gemini 인데 GEMINI_API_KEY 가 없습니다 (.env 확인)")
            self.client = genai.Client(api_key=settings.gemini_api_key)
        # 기본 모델이 과부하일 때 순서대로 시도할 모델 목록
        self.models = [settings.gemini_model] + [
            m.strip() for m in settings.gemini_fallback_models.split(",") if m.strip()
        ]
        self.retries = settings.gemini_retries

    def _generate(self, contents, config: types.GenerateContentConfig, *, retries: int | None = None):
        retries = self.retries if retries is None else retries
        last: Exception | None = None
        for model in self.models:
            for attempt in range(retries + 1):
                try:
                    return self.client.models.generate_content(model=model, contents=contents, config=config)
                except errors.APIError as e:
                    last = e
                    if e.code not in _RETRY_STATUS:
                        raise  # 키 오류·모델 없음 등은 재시도해도 소용없음
                    wait = 2 ** attempt  # 1초, 2초, 4초...
                    if attempt < retries:
                        log.warning("Gemini %s %s (시도 %d) → %d초 후 재시도", model, e.code, attempt + 1, wait)
                        time.sleep(wait)
            log.warning("Gemini %s 계속 실패 → 다음 모델로", model)
        raise last  # type: ignore[misc]

    def transcribe(self, data: bytes, mime_type: str) -> list[str]:
        resp = self._generate(
            [types.Part.from_bytes(data=data, mime_type=mime_type), TRANSCRIBE_PROMPT],
            types.GenerateContentConfig(temperature=0, automatic_function_calling=_NO_AFC),
        )
        text = resp.text or ""
        pages = [p.strip() for p in _PAGE_MARK.split(text)]
        return [p for p in pages if p] or [text.strip()]

    def transcribe_lines(self, data: bytes, mime_type: str) -> list[LLMLine]:
        """이미지 한 장을 줄 단위로 받아쓰고, 줄마다 위치 상자(0~1000)를 함께 받는다."""
        resp = self._generate(
            [types.Part.from_bytes(data=data, mime_type=mime_type), TRANSCRIBE_LINES_PROMPT],
            types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=LLMTranscription,
                temperature=0,
                automatic_function_calling=_NO_AFC,
            ),
        )
        parsed = resp.parsed if resp.parsed is not None else LLMTranscription.model_validate_json(resp.text)
        return [ln for ln in parsed.lines if ln.text.strip()]

    def extract(self, sentences: list[Sentence], today: str) -> LLMExtraction:
        source = format_numbered_source(sentences)
        resp = self._generate(
            f"[원문]\n{source}",
            types.GenerateContentConfig(
                system_instruction=EXTRACTION_SYSTEM_PROMPT.format(today=today),
                response_mime_type="application/json",
                response_schema=LLMExtraction,
                temperature=0,
                automatic_function_calling=_NO_AFC,
            ),
        )
        if resp.parsed is not None:
            return resp.parsed  # type: ignore[return-value]
        return LLMExtraction.model_validate_json(resp.text)

    def draft_mail(self, kind: str, title: str, question: str) -> str:
        response = self._generate(
            json.dumps({"kind": kind, "title": title, "question": question}, ensure_ascii=False),
            types.GenerateContentConfig(
                system_instruction=_MAIL_PROMPT,
                max_output_tokens=2048,
                automatic_function_calling=_NO_AFC,
            ),
        )
        return (response.text or "").strip()

    def recommend_plan_dates(self, tasks: list[str], first: date, last: date, deadline: date | None) -> list[str]:
        response = self._generate(
            json.dumps({"tasks": tasks, "first": first.isoformat(), "last": last.isoformat(),
                        "deadline": deadline.isoformat() if deadline else None}, ensure_ascii=False),
            types.GenerateContentConfig(
                system_instruction=_PLAN_DATES_PROMPT,
                response_mime_type="application/json",
                response_schema=PlanDateRecommendations,
                temperature=0,
                automatic_function_calling=_NO_AFC,
                http_options=types.HttpOptions(timeout=12000),
            ),
            retries=0,
        )
        if isinstance(response.parsed, PlanDateRecommendations):
            return response.parsed.dates
        return PlanDateRecommendations.model_validate_json(response.text or "").dates
