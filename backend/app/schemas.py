"""에이전트 간 데이터 계약.

- LLM* 모델: Gemini structured output의 response_schema로 그대로 넘어간다.
  (Gemini 스키마는 기본값을 지원하지 않으므로 LLM* 모델에는 default를 두지 않는다.)
- Verified* / AnalysisResult: 근거 검증 에이전트가 만든 최종 결과. DB에 저장되고 API로 나간다.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field, PrivateAttr


class DocCategory(str, Enum):
    APPLICATION = "신청형"
    PAYMENT = "납부형"
    CONTRACT = "계약·갱신형"
    OTHER = "기타"


class FieldKey(str, Enum):
    APPLICANT_CRITERIA = "applicant_criteria"  # 신청 대상 / 자격 요건
    APPLICATION_START = "application_start"  # 신청(접수) 시작일
    DEADLINE = "deadline"  # 신청(제출) 마감일
    ANNOUNCEMENT_DATE = "announcement_date"  # 결과 발표일
    EVENT_DATE = "event_date"  # 설명회·행사·교육 일시
    REQUIRED_DOCUMENT = "required_document"  # 제출 서류 / 준비물
    SUBMISSION_METHOD = "submission_method"  # 제출·신청 방법
    TODO = "todo"  # 사용자가 해야 할 행동 (원문에서 유추)
    BENEFIT = "benefit"  # 지원 내용 / 금액
    CONTACT = "contact"  # 문의처


DATE_KEYS = {
    FieldKey.APPLICATION_START,
    FieldKey.DEADLINE,
    FieldKey.ANNOUNCEMENT_DATE,
    FieldKey.EVENT_DATE,
}
# 원문에 거의 그대로 있어야 하는 필드 (값 자체가 원문 표현이어야 함)
LITERAL_KEYS = {FieldKey.REQUIRED_DOCUMENT, FieldKey.SUBMISSION_METHOD, FieldKey.CONTACT, FieldKey.BENEFIT}
# 원문에서 유추한 행동이라 표현이 달라도 되는 필드
INFERRED_KEYS = {FieldKey.TODO}


# ─────────────────────────── LLM 출력 스키마 ───────────────────────────
class LLMField(BaseModel):
    key: FieldKey
    label: str = Field(description="화면에 보여줄 짧은 이름. 예: '신청 마감', '제출 서류'")
    value: str = Field(description="추출한 값. 한 필드에 한 항목만 담는다.")
    normalized_datetime: Optional[str] = Field(
        description="날짜 필드일 때만 ISO 8601 (YYYY-MM-DD 또는 YYYY-MM-DDTHH:MM). 그 외엔 null."
    )
    evidence_quote: str = Field(description="값의 근거가 되는 원문 구절을 한 글자도 바꾸지 말고 그대로 복사")
    page: Optional[int] = Field(description="근거가 있는 페이지 번호 (1부터). 모르면 null.")
    confidence: float = Field(description="0.0~1.0 자기 확신도")


class LLMExtraction(BaseModel):
    title: str
    doc_category: DocCategory
    doc_subtype: str = Field(description="예: '장학금 신청 공지', '공모전 모집 공고'")
    fields: list[LLMField]


# ─────────────────────────── 검증 결과 ───────────────────────────
FieldStatus = Literal["verified", "needs_review", "unverified", "user_confirmed"]


class Evidence(BaseModel):
    quote: str  # LLM이 제시한 근거 문장
    matched_text: Optional[str] = None  # 원문에서 실제로 찾은 문장(들)
    page: Optional[int] = None
    sentence_start: Optional[int] = None  # 페이지 내 문장 번호 (1부터)
    sentence_end: Optional[int] = None
    char_start: Optional[int] = None  # 전체 원문 기준 오프셋 (하이라이트용)
    char_end: Optional[int] = None
    match_score: float = 0.0  # 0~1

    @property
    def location(self) -> Optional[str]:
        if self.page is None or self.sentence_start is None:
            return None
        if self.sentence_end and self.sentence_end != self.sentence_start:
            return f"{self.page}페이지 {self.sentence_start}~{self.sentence_end}번째 문장"
        return f"{self.page}페이지 {self.sentence_start}번째 문장"


class Check(BaseModel):
    name: str  # evidence_found | value_in_evidence | date_role | date_range | ...
    passed: bool
    score: float
    detail: str


class VerifiedField(BaseModel):
    id: str
    key: FieldKey
    label: str
    value: str
    normalized_datetime: Optional[str] = None
    evidence: Evidence
    llm_confidence: float
    checks: list[Check]
    confidence: int  # 최종 신뢰도 0~100
    status: FieldStatus
    location: Optional[str] = None


class AnalysisResult(BaseModel):
    document_id: str
    title: str
    doc_category: DocCategory
    doc_subtype: str
    fields: list[VerifiedField]
    warnings: list[str] = []
    needs_review: bool = False
    llm_provider: str
    created_at: datetime


# ─────────────────────────── 문서 원문 ───────────────────────────
class Sentence(BaseModel):
    page: int
    index: int  # 페이지 내 1부터
    text: str
    char_start: int  # 전체 원문(full_text) 기준
    char_end: int


class LLMLine(BaseModel):
    text: str = Field(description="이 줄의 글자를 원문 그대로")
    box_2d: list[int] = Field(description="이 줄을 감싸는 상자 [ymin, xmin, ymax, xmax], 이미지 기준 0~1000 정규화 좌표")


class LLMTranscription(BaseModel):
    lines: list[LLMLine]

class PageSource(BaseModel):
    kind: Literal["body", "attachment"]
    filename: Optional[str] = None
    original_page: int

class SourceDocument(BaseModel):
    source_kind: Literal["text", "pdf", "image"]
    pages: list[str]
    masked_count: int = 0
    page_sources: list[PageSource] = Field(default_factory=list)
    # 이미지 받아쓰기 때 얻은 줄별 위치 (원문 근거 하이라이트용). DB에는 저장하지 않고 원본 파일 옆에 따로 둔다.
    _image_lines: Optional[list[LLMLine]] = PrivateAttr(default=None)
    _image_lines_by_page: Optional[list[Optional[list[LLMLine]]]] = PrivateAttr(default=None)

    @property
    def full_text(self) -> str:
        return "\n\n".join(self.pages)
