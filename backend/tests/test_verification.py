"""근거 검증 에이전트가 LLM의 전형적인 실수를 잡아내는지 확인한다."""
from app.schemas import FieldKey, LLMExtraction, LLMField, DocCategory


def F(key, value, quote, iso=None, conf=0.95):
    return LLMField(key=key, label=key.value, value=value, normalized_datetime=iso,
                    evidence_quote=quote, page=1, confidence=conf)


def check(vf, name):
    return next(c for c in vf.checks if c.name == name)


def test_correct_deadline_is_verified(verifier):
    vf = verifier.verify_field(F(FieldKey.DEADLINE, "9월 25일 17:00",
        "신청 기간: 2026년 9월 15일(화) ~ 9월 25일(금) 17:00까지", "2026-09-25T17:00"), "d")
    assert vf.status == "verified" and vf.confidence >= 95
    assert vf.location == "1페이지 6번째 문장"


def test_positive_evidence_cannot_verify_an_exclusion(verifier):
    field = verifier.verify_field(F(FieldKey.APPLICANT_EXCLUSION, "2026학년도 재학생",
        "- 2026학년도 재학생"), "exclusion")
    assert field.status == "needs_review"
    assert not check(field, "exclusion_role").passed


def test_quote_with_whitespace_noise_still_matches(verifier):
    vf = verifier.verify_field(F(FieldKey.REQUIRED_DOCUMENT, "통장 사본",
        "제출서류 :  신청서,성적증명서, 통장사본"), "r")
    assert check(vf, "evidence_found").score >= 0.8
    assert vf.status == "verified"


def test_hallucinated_field_is_unverified(verifier):
    """원문에 없는 서류를 만들어낸 경우"""
    vf = verifier.verify_field(F(FieldKey.REQUIRED_DOCUMENT, "지도교수 추천서",
        "지도교수 추천서 1부를 함께 제출해야 합니다."), "h")
    assert vf.status == "unverified"
    assert vf.confidence <= 40


def test_announcement_date_mistaken_as_deadline(verifier):
    """발표일을 마감일로 착각한 경우 → 날짜 의미 혼동"""
    vf = verifier.verify_field(F(FieldKey.DEADLINE, "10월 2일",
        "5. 선발 결과 발표: 2026년 10월 2일(금) 학생포털 공지", "2026-10-02"), "x")
    assert not check(vf, "date_role").passed
    assert "발표일" in check(vf, "date_role").detail
    assert vf.status == "needs_review"


def test_range_start_mistaken_as_deadline(verifier):
    """'9/15 ~ 9/25' 에서 시작일을 마감일로 뽑은 경우"""
    vf = verifier.verify_field(F(FieldKey.DEADLINE, "9월 15일",
        "신청 기간: 2026년 9월 15일(화) ~ 9월 25일(금) 17:00까지", "2026-09-15"), "x")
    assert not check(vf, "date_range").passed
    assert vf.status == "needs_review"


def test_invented_time_is_flagged(verifier):
    """원문엔 시각이 없는데 LLM이 18:00을 붙인 경우"""
    vf = verifier.verify_field(F(FieldKey.ANNOUNCEMENT_DATE, "10월 2일 18:00",
        "5. 선발 결과 발표: 2026년 10월 2일(금) 학생포털 공지", "2026-10-02T18:00"), "x")
    assert not check(vf, "date_time").passed
    assert vf.status == "needs_review"


def test_wrong_time_is_flagged(verifier):
    vf = verifier.verify_field(F(FieldKey.DEADLINE, "9월 25일 18:00",
        "신청 기간: 2026년 9월 15일(화) ~ 9월 25일(금) 17:00까지", "2026-09-25T18:00"), "x")
    assert "시각 불일치" in check(vf, "date_time").detail
    assert vf.status == "needs_review"


def test_right_value_wrong_quote_is_reanchored(verifier):
    """값은 맞는데 인용문을 의역한 경우 → 근거 재탐색 후 사용자 확인"""
    vf = verifier.verify_field(F(FieldKey.EVENT_DATE, "9월 17일 14시",
        "설명회는 9월 17일 오후 2시에 열립니다", "2026-09-17T14:00"), "x")
    assert vf.status == "needs_review"
    assert vf.evidence.matched_text.startswith("6. 장학금 설명회")


def test_document_level_warnings(verifier):
    ext = LLMExtraction(title="t", doc_category=DocCategory.APPLICATION, doc_subtype="s", fields=[
        F(FieldKey.DEADLINE, "9월 25일", "2026년 9월 15일(화) ~ 9월 25일(금) 17:00까지", "2026-09-25"),
        F(FieldKey.REQUIRED_DOCUMENT, "여권 사본", "여권 사본을 준비하세요"),
    ])
    r = verifier.verify(ext, "doc-x", "test")
    assert r.needs_review
    assert any("근거를 찾지 못한 항목 1개" in w for w in r.warnings)


def test_past_deadline_warning(source):
    from datetime import datetime
    from app.agents.verification import Verifier
    from app.utils.text import split_sentences
    v = Verifier(source, split_sentences(source), 80, datetime(2026, 9, 30))
    ext = LLMExtraction(title="t", doc_category=DocCategory.APPLICATION, doc_subtype="s", fields=[
        F(FieldKey.DEADLINE, "9월 25일 17:00", "9월 25일(금) 17:00까지", "2026-09-25T17:00")])
    assert any("이미 지났습니다" in w for w in v.verify(ext, "d", "t").warnings)
