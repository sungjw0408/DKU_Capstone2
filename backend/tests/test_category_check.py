"""3회차 분류 검사: 원문에 있는 글자라도 엉뚱한 칸에 넣었으면 확인 필요로 보낸다."""
import pytest

from app.agents.verification import _check_category

CAUGHT = [
    ("applicant_criteria", "DKU Startrack 장학금, SW인재(논문) 장학금"),      # 장학금 이름
    ("applicant_criteria", "직전학기 성적, TOPCIT 성적을 합산하여 선발"),     # 선발 기준
    ("applicant_criteria", "휴학생 지원 불가"),                              # 제외 대상
    ("applicant_criteria", "(편입생, 휴학생, 초과학기생 제외)"),
    ("applicant_criteria", "제외학과: 의과대학, 치과대학"),
    ("required_document", "영어성적 증빙서류 (선발인원 대상)"),              # 선발자만 내는 서류
    ("required_document", "한글 양식 사용 (hwp)"),                           # 파일 형식
    ("submission_method", "https://m.site.naver.com/1MpR1"),                # 주소만
]
PASSED = [
    ("applicant_criteria", "2026학년도 재학생"),
    ("applicant_criteria", "학사경고를 제외한 학칙에 의한 징계 사실이 없는 자"),  # "제외한"은 제외 대상이 아님
    ("applicant_criteria", "개인 단위 응모만 가능, 팀 응모 불가"),              # 가능 범위 설명
    ("applicant_criteria", "성적장학금 수혜자"),                               # 사람 조건
    ("applicant_criteria", "신규학기에 타 기관 장학금 수혜 대상이 아닌 학생"),
    ("required_document", "첨부된 한글 양식으로 작성한 에세이(hwp)"),
    ("required_document", "신청서(PDF)"),
    ("required_document", "장애인증명서 (해당하는 경우)"),
    ("submission_method", "과총 국제협력포털사이트(www.ultari.org)를 통해 온라인 신청"),
    ("submission_method", "이메일 제출 (hhggk123@dankook.ac.kr)"),
]


@pytest.mark.parametrize("key,value", CAUGHT)
def test_엉뚱한_칸이면_확인_필요(key, value):
    checks = _check_category(key, value)
    assert checks and checks[0].name == "category_fit" and not checks[0].passed


@pytest.mark.parametrize("key,value", PASSED)
def test_맞는_칸이면_검사를_추가하지_않음(key, value):
    assert _check_category(key, value) == []
