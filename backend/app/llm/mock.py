"""API 키 없이 파이프라인 전체를 돌려보기 위한 규칙 기반 추출기.

실제 서비스 품질을 내는 용도가 아니라, 프론트 연동·테스트·데모 리허설을 위해
Gemini와 같은 형식(LLMExtraction)을 돌려주는 것이 목적이다.
"""
from __future__ import annotations

import re
from datetime import date

from app.schemas import DocCategory, FieldKey, LLMExtraction, LLMField, Sentence
from app.utils.dates import find_ranges, parse_dates

_DOC_NOUN = re.compile(
    r"([가-힣]{0,6}\s?(?:신청서|증명서|사본|확인서|계획서|추천서|동의서|자기소개서|포트폴리오|등본))"
)
_METHOD = re.compile(r"([가-힣A-Za-z]*(?:포털|홈페이지|이메일|메일|방문|우편|온라인))")
_HEADER_NUM = re.compile(r"^\s*(?:\d+[.)]|[가-하][.)])\s*")
_BULLET = re.compile(r"^\s*[-•·▶※○●]\s*")
_PARTICLE = re.compile(r"(을|를|이|가|은|는|와|과|및)$")
_EXCLUSION_HEADING = re.compile(r"^(?:(?:신청|지원|접수)\s*불가(?:\s*대상)?|(?:신청\s*)?제외\s*대상)\s*$")
_EXCLUSION_LINE = re.compile(r"(?:신청|지원|접수)(?:은|는|이|가|을|를)?\s*(?:불가|할\s*수\s*없)|(?:신청|지원)\s*대상에서\s*제외")
_EMAIL = re.compile(
    r"(?<![A-Z0-9._%+'@-])[A-Z0-9_%+'-]+(?:\.[A-Z0-9_%+'-]+)*"
    r"@(?:[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?\.)+[A-Z]{2,}(?![A-Z0-9_@-]|\.[A-Z0-9_@-])",
    re.IGNORECASE,
)


def _after_colon(text: str) -> str | None:
    if ":" in text:
        return text.split(":", 1)[1].strip()
    return None


def _clean(s: str) -> str:
    s = _BULLET.sub("", s).strip()
    return _PARTICLE.sub("", s).strip()


def _f(key, label, value, quote, page, conf, iso=None) -> LLMField:
    return LLMField(
        key=key, label=label, value=value, normalized_datetime=iso,
        evidence_quote=quote, page=page, confidence=conf,
    )


class MockProvider:
    name = "mock"

    def recommend_plan_dates(self, tasks: list[str], first: date, last: date, deadline: date | None) -> list[str]:
        return []  # 모의 실행에서는 서버의 기본 날짜를 사용한다.

    def draft_mail(self, kind: str, title: str, question: str) -> str:
        if kind == "inquiry":
            return f"안녕하세요. {title} 관련해 문의드립니다.\n\n{question}\n\n감사합니다."
        return f"안녕하세요. {title}에 신청합니다."

    def transcribe(self, data: bytes, mime_type: str) -> list[str]:
        raise RuntimeError(
            "mock 모드에서는 이미지/스캔 PDF를 읽을 수 없습니다. 텍스트 PDF나 text 입력을 쓰거나 LLM_PROVIDER=gemini 로 바꾸세요."
        )

    def extract(self, sentences: list[Sentence], today: str) -> LLMExtraction:
        full = "\n".join(s.text for s in sentences)
        title = next((s.text for s in sentences), "제목 없음")[:60]
        fields: list[LLMField] = []
        default_year = int(today[:4])

        # 1) 문서 분류
        if re.search(r"납부|고지서|청구|관리비|공과금", full):
            cat, sub = DocCategory.PAYMENT, "납부 고지서"
        elif re.search(r"계약|갱신|해지", full) and not re.search(r"모집|신청", full):
            cat, sub = DocCategory.CONTRACT, "계약·갱신 안내"
        elif re.search(r"신청|모집|접수|공모", full):
            cat = DocCategory.APPLICATION
            sub = next(
                (f"{k} 신청 공지" for k in ["장학금", "기숙사", "공모전", "비교과", "교육"] if k in full),
                "신청 공지",
            )
        else:
            cat, sub = DocCategory.OTHER, "일반 문서"

        # 2) 문장 단위 규칙
        collecting_criteria = None
        exclusion_quote = ""
        contact_section = False
        emails_seen: set[str] = set()
        docs_seen: set[str] = set()
        method_value: str | None = None
        for s in sentences:
            t = s.text

            heading = _HEADER_NUM.sub("", _BULLET.sub("", t)).split(":", 1)[0].strip()
            if _EXCLUSION_HEADING.fullmatch(heading):
                exclusion_quote = t
                if value := _after_colon(t):
                    fields.append(_f(FieldKey.APPLICANT_EXCLUSION, "신청 불가 대상", value, t, s.page, 0.9))
                    collecting_criteria = None
                else:
                    collecting_criteria = FieldKey.APPLICANT_EXCLUSION
                continue
            if _EXCLUSION_LINE.search(t) and not re.search(r"마감|기한|(?:신청|접수)\s*기간", t):
                fields.append(_f(FieldKey.APPLICANT_EXCLUSION, "신청 불가 대상", _BULLET.sub("", t), t, s.page, 0.9))
                continue

            # 신청 대상 (헤더 아래 글머리표 목록 or "대상: ..." 인라인)
            if "대상" in t and len(t) < 20 and not _after_colon(t):
                collecting_criteria = FieldKey.APPLICANT_CRITERIA
                continue
            if collecting_criteria:
                if _BULLET.match(t):
                    label = "신청 불가 대상" if collecting_criteria == FieldKey.APPLICANT_EXCLUSION else "신청 대상"
                    if collecting_criteria == FieldKey.APPLICANT_EXCLUSION:
                        exclusion_quote += "\n" + t
                    quote = exclusion_quote if collecting_criteria == FieldKey.APPLICANT_EXCLUSION else t
                    fields.append(_f(collecting_criteria, label, _BULLET.sub("", t).strip(), quote, s.page, 0.9))
                    continue
                collecting_criteria = None
            if "대상" in t and (v := _after_colon(t)):
                fields.append(_f(FieldKey.APPLICANT_CRITERIA, "신청 대상", v, t, s.page, 0.85))
            elif m := re.search(r"대상은\s*(.+?)(?:인\s*자에\s*한합니다|입니다|이다)", t):
                for part in re.split(r"이며|,", m.group(1)):
                    if part.strip():
                        fields.append(_f(FieldKey.APPLICANT_CRITERIA, "신청 대상", part.strip(), t, s.page, 0.8))

            # 날짜
            dates = parse_dates(t, default_year)
            if dates:
                ranges = find_ranges(t, dates)
                in_range = {id(d) for r in ranges for d in r}
                for a, b in ranges:
                    fields.append(_f(FieldKey.APPLICATION_START, "신청 시작", a.raw, t, s.page, 0.9, a.iso()))
                    fields.append(_f(FieldKey.DEADLINE, "신청 마감", b.raw, t, s.page, 0.92, b.iso()))
                for d in dates:
                    if id(d) in in_range:
                        continue
                    if re.search(r"발표|결과|선정|합격", t):
                        fields.append(_f(FieldKey.ANNOUNCEMENT_DATE, "결과 발표", d.raw, t, s.page, 0.88, d.iso()))
                    elif re.search(r"설명회|행사|교육|특강|일시", t):
                        fields.append(_f(FieldKey.EVENT_DATE, "행사 일시", d.raw, t, s.page, 0.85, d.iso()))
                    elif re.search(r"마감|까지|기한", t):
                        fields.append(_f(FieldKey.DEADLINE, "신청 마감", d.raw, t, s.page, 0.9, d.iso()))

            # 제출 서류
            if re.search(r"서류|준비물|구비", t):
                src = _after_colon(t) if re.search(r"제출\s*서류|구비\s*서류|준비물", t) else t
                parts = re.split(r",|및", src) if src and _after_colon(t) else _DOC_NOUN.findall(t)
                for p in parts:
                    name = _clean(p)
                    if name and name not in docs_seen and _DOC_NOUN.search(name):
                        docs_seen.add(name)
                        fields.append(_f(FieldKey.REQUIRED_DOCUMENT, "제출 서류", name, t, s.page, 0.9))

            # 제출 방법
            if method_value is None and re.search(r"제출|신청|접수", t) and (m := _METHOD.search(t)):
                method_value = m.group(1)
                fields.append(_f(FieldKey.SUBMISSION_METHOD, "제출 방법", method_value, t, s.page, 0.75))

            # 문의처 제목 다음 줄에 이메일을 따로 적는 공지도 지원한다.
            is_contact = bool(re.match(r"^문의(?:처|\s*사항|\s*연락처)?\s*$", heading)) or "문의" in t
            if is_contact and re.search(r"\d{2,4}-\d{3,4}-\d{4}", t):
                fields.append(_f(FieldKey.CONTACT, "문의처", _after_colon(t) or t, t, s.page, 0.9))
            if is_contact or contact_section:
                for address in _EMAIL.findall(t):
                    if address.lower() not in emails_seen:
                        emails_seen.add(address.lower())
                        fields.append(_f(FieldKey.CONTACT, "문의처 이메일", address, t, s.page, 0.95))
            contact_section = is_contact and _after_colon(t) is None

        # 3) 해야 할 일: 서류 → 행동 동사로 변환, 마지막에 제출
        def _quote_for(key):
            return next(((f.evidence_quote, f.page) for f in fields if f.key == key), (None, None))

        dq, dp = _quote_for(FieldKey.REQUIRED_DOCUMENT)
        for f in [f for f in fields if f.key == FieldKey.REQUIRED_DOCUMENT]:
            if "증명서" in f.value or "등본" in f.value or "확인서" in f.value:
                action = f"{f.value} 발급"
            elif "사본" in f.value:
                action = f"{f.value} 준비"
            else:
                action = f"{f.value} 작성"
            fields.append(_f(FieldKey.TODO, "해야 할 일", action, dq, dp, 0.8))
        if method_value:
            mq, mp = _quote_for(FieldKey.SUBMISSION_METHOD)
            fields.append(_f(FieldKey.TODO, "해야 할 일", f"{method_value}에서 서류 제출", mq, mp, 0.75))

        return LLMExtraction(title=title, doc_category=cat, doc_subtype=sub, fields=fields)
