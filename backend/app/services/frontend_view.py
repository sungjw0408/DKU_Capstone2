"""AnalysisResult → 프론트 mockData.analysisDetail 과 같은 모양으로 변환.

프론트 화면(AIAnalysisScreen, EvidenceCheckScreen)은 import 만 API 응답으로 바꾸면 그대로 동작한다.
"""
from __future__ import annotations

from datetime import date

from app.schemas import AnalysisResult, FieldKey, VerifiedField
from app.utils.dates import parse_iso


def _usable(fields: list[VerifiedField], key: FieldKey) -> list[VerifiedField]:
    return [f for f in fields if f.key == key and f.status != "unverified"]


def fmt_date(iso: str | None, fallback: str = "", show_year: bool = True) -> str:
    d = parse_iso(iso)
    if not d:
        return fallback
    if show_year and d.year:
        text = f"{d.year}년 {d.month}월 {d.day}일"
    else:
        text = f"{d.month}월 {d.day}일"
    if d.has_time:
        text += f" {d.hour:02d}:{d.minute or 0:02d}"
    return text

def make_item(f: VerifiedField, text: str | None = None) -> dict:
    return {
        "fieldId": f.id,
        "text": text or f.value,
        "confidence": f.confidence,
        "status": f.status,
    }


def make_section(key: str, title: str, items: list[dict]) -> dict | None:
    if not items:
        return None
    return {
        "key": key,
        "title": title,
        "items": items,
        "confidence": min(i["confidence"] for i in items),
        "needsReview": any(i["status"] in ("needs_review", "unverified") for i in items),
    }

def build_sections(a: AnalysisResult) -> list[dict]:
    """AI 분석 결과 화면의 섹션 목록 (시안 순서)"""
    fs = a.fields

    def date_item(f: VerifiedField) -> dict:
        return make_item(f, fmt_date(f.normalized_datetime, fallback=f.value))

    start = next(iter(_usable(fs, FieldKey.APPLICATION_START)), None)
    deadline = next(iter(_usable(fs, FieldKey.DEADLINE)), None)
    period_title, period_items = "신청 기간", []
    if start and deadline:
        s = parse_iso(start.normalized_datetime)
        e = parse_iso(deadline.normalized_datetime)
        same_year = bool(s and e and s.year == e.year)
        text = (
            fmt_date(start.normalized_datetime, fallback=start.value)
            + " ~ "
            + fmt_date(deadline.normalized_datetime, fallback=deadline.value, show_year=not same_year)
        )
        weaker = start if start.confidence <= deadline.confidence else deadline
        period_items = [make_item(weaker, text)]
    elif deadline:
        period_title = "신청 마감"
        period_items = [date_item(deadline)]

    sections = [
        make_section("criteria", "신청 대상", [make_item(f) for f in _usable(fs, FieldKey.APPLICANT_CRITERIA)]),
        make_section("period", period_title, period_items),
        make_section("documents", "필요 서류", [make_item(f) for f in _usable(fs, FieldKey.REQUIRED_DOCUMENT)]),
        make_section("method", "제출 방법", [make_item(f) for f in _usable(fs, FieldKey.SUBMISSION_METHOD)]),
        make_section("announcement", "결과 발표일", [date_item(f) for f in _usable(fs, FieldKey.ANNOUNCEMENT_DATE)]),
        make_section("event", "행사 일정", [date_item(f) for f in _usable(fs, FieldKey.EVENT_DATE)]),
        make_section("benefit", "지원 내용", [make_item(f) for f in _usable(fs, FieldKey.BENEFIT)]),
        make_section("contact", "문의처", [make_item(f) for f in _usable(fs, FieldKey.CONTACT)]),
    ]
    return [sec for sec in sections if sec is not None]

def particle_ro(word: str) -> str:
    if not word:
        return "로"
    code = ord(word[-1]) - 0xAC00   # '가'로부터 몇 번째 글자인지
    if not 0 <= code < 11172:        # 한글이 아니면 (영어·숫자 등)
        return "로"
    jong = code % 28                 # 받침 번호 (0 = 받침 없음, 8 = ㄹ)
    if jong == 0 or jong == 8:
        return "로"
    return "으로"


def build_summary(a: AnalysisResult) -> str:
    return f"{a.doc_subtype}{particle_ro(a.doc_subtype)} 판단했어요."


def build_tags(a: AnalysisResult) -> list[str]:
    """['장학금', '신청형 문서'] — 세부 유형의 첫 단어 + 대분류"""
    words = a.doc_subtype.split()
    tags = []
    if len(words) > 1:
        tags.append(words[0])
    tags.append(f"{a.doc_category.value} 문서")
    return tags

def to_analysis_detail(a: AnalysisResult) -> dict:
    criteria = _usable(a.fields, FieldKey.APPLICANT_CRITERIA)
    todos = _usable(a.fields, FieldKey.TODO)
    deadline = next(iter(_usable(a.fields, FieldKey.DEADLINE)), None)
    docs = _usable(a.fields, FieldKey.REQUIRED_DOCUMENT)
    method = next(iter(_usable(a.fields, FieldKey.SUBMISSION_METHOD)), None)

    # 근거 화면: 핵심 필드의 원문 문장을 원문 순서대로 모은다
    key_fields = [*criteria, *([deadline] if deadline else []), *([method] if method else [])]
    spans = sorted({(f.evidence.char_start, f.evidence.matched_text) for f in key_fields if f.evidence.matched_text},
                   key=lambda x: x[0] or 0)
    ev_fields = []
    if criteria:
        ev_fields.append({"label": "신청 대상", "value": " / ".join(c.value for c in criteria),
                          "confidence": min(c.confidence for c in criteria)})
    if deadline:
        ev_fields.append({"label": "마감일", "value": deadline.value, "confidence": deadline.confidence})
    if method:
        ev_fields.append({"label": "제출 방법", "value": method.value, "confidence": method.confidence})

    return {
        "id": a.document_id,
        "title": a.title,
        "docType": a.doc_subtype,
        "docCategory": a.doc_category.value,
        "applicantCriteria": [{"text": c.value, "confidence": c.confidence} for c in criteria],
        "todos": [{"id": t.id, "text": t.value, "confidence": t.confidence} for t in todos],
        "deadline": {"text": deadline.value, "confidence": deadline.confidence,
                     "datetime": deadline.normalized_datetime} if deadline else None,
        "requiredDocs": [d.value for d in docs],
        "evidence": {
            "location": (deadline or (key_fields[0] if key_fields else None)).location if key_fields else None,
            "sourceExcerpt": " ".join(t for _, t in spans),
            "fields": ev_fields,
        },
        "needsReview": a.needs_review,
        "warnings": a.warnings,
        
        "summary": build_summary(a),
        "tags": build_tags(a),
        "sections": build_sections(a),
    }


def dday(a: AnalysisResult, today: date) -> int | None:
    """문서의 마감일까지 남은 일수를 프론트용 D-day 값으로 계산한다."""
    deadline = next(
        iter(_usable(a.fields, FieldKey.DEADLINE)),
        None,
    )

    if not deadline or not deadline.normalized_datetime:
        return None

    parsed = parse_iso(deadline.normalized_datetime)
    if not parsed or not parsed.year:
        return None

    due_date = date(parsed.year, parsed.month, parsed.day)

    return (today - due_date).days


def to_list_item(a: AnalysisResult, today: date) -> dict:
    """프론트 mockData.documents 모양"""
    return {
        "id": a.document_id,
        "title": a.title,
        "type": f"{a.doc_category.value} 문서",
        "dday": dday(a, today),
        "status": "needs_review" if a.needs_review else "in_progress",
    }
