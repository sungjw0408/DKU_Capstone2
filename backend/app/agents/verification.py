"""AGENT 03 · 근거 검증 에이전트

LLM이 추출한 각 필드를 원문과 대조해 '진짜 원문에 있는 정보인지' 판정하고 최종 신뢰도를 매긴다.
LLM의 자기 확신도는 참고값(20%)일 뿐이고, 신뢰도의 대부분은 아래 결정적(deterministic) 검사에서 나온다.

  1. evidence_found     : LLM이 준 근거 인용문이 원문에 실제로 있는가 (정확 일치 → 퍼지 매칭)
  2. value_in_evidence  : 추출한 값이 그 근거 문장 안에 있는가
  3. date_time          : 시각이 원문과 일치하는가 (원문에 없는 시각을 지어냈는가)
  4. date_role          : 날짜 주변 표현이 필드 의미(마감/발표/행사)와 맞는가  → 날짜 의미 혼동 탐지
  5. date_range         : "A ~ B" 기간에서 시작/끝을 제대로 골랐는가

최종 신뢰도 = 0.65·근거일치 + 0.35·값검사평균 //AI 자기 확신도는 가르지 못해서 뺌
  - 근거를 못 찾으면 unverified (≤40)
  - 치명적 검사 실패가 있으면 ≤60
  - review_threshold 미만이면 needs_review (사용자 확인 필요)
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

from rapidfuzz import fuzz

from app.schemas import (
    DATE_KEYS,
    INFERRED_KEYS,
    AnalysisResult,
    Check,
    Evidence,
    FieldKey,
    LLMExtraction,
    LLMField,
    Sentence,
    SourceDocument,
    VerifiedField,
)
from app.utils.dates import ParsedDate, find_ranges, parse_dates, parse_iso
from app.utils.text import normalize

W_EVIDENCE, W_VALUE, W_LLM = 0.65, 0.35, 0.0
EVIDENCE_MIN = 0.80  # 이 이상이면 근거 일치로 인정
REANCHOR_SCORE = 0.65

_ROLE = {
    FieldKey.DEADLINE: re.compile(r"마감|까지|기한|~|∼|신청\s*기간|접수\s*기간|제출\s*기간"),
    FieldKey.APPLICATION_START: re.compile(r"부터|~|∼|시작|신청\s*기간|접수\s*기간|개시"),
    FieldKey.ANNOUNCEMENT_DATE: re.compile(r"발표|결과|선정|합격|공고일"),
    FieldKey.EVENT_DATE: re.compile(r"설명회|행사|교육|특강|일시|개최|진행|오리엔테이션|면접"),
}
_CONFLICT = {
    FieldKey.DEADLINE: [FieldKey.ANNOUNCEMENT_DATE, FieldKey.EVENT_DATE],
    FieldKey.APPLICATION_START: [FieldKey.ANNOUNCEMENT_DATE, FieldKey.EVENT_DATE],
    FieldKey.ANNOUNCEMENT_DATE: [FieldKey.DEADLINE, FieldKey.EVENT_DATE],
    FieldKey.EVENT_DATE: [FieldKey.ANNOUNCEMENT_DATE],
}
_ROLE_NAME = {
    FieldKey.DEADLINE: "마감일",
    FieldKey.APPLICATION_START: "시작일",
    FieldKey.ANNOUNCEMENT_DATE: "발표일",
    FieldKey.EVENT_DATE: "행사일",
}
_ACTION_WORDS = {"발급", "작성", "제출", "준비", "확인", "신청", "업로드", "출력", "서명", "방문", "등록", "최종", "완료", "하기"}
_PARTICLE_TAIL = re.compile(r"(에서|으로|로|을|를|이|가|은|는|의|에)$")
_EXCLUSION_ROLE = re.compile(r"제외|불가|할\s*수\s*없|자격\s*(?:이\s*)?없")


@dataclass
class _Located:
    evidence: Evidence
    text: str  # 값 검사에 쓸 원문 텍스트 ("" 이면 근거 없음)
    reanchored: bool = False


# ─────────────────────────── 분류 검사 (3회차) ───────────────────────────
# "근거가 있다"와 "맞는 칸에 들어갔다"는 다르다. 원문에 있는 글자라도 엉뚱한 칸에 넣었으면 확인 필요로 보낸다.
# 통과하면 검사를 추가하지 않는다 (다른 항목의 신뢰도가 바뀌지 않게).
_CRIT_SELECTION = re.compile(r"합산|배점|가산점|선발\s*(기준|방법)|심사\s*(기준|방법)|\d+\s*%\s*[+＋]")
_CRIT_EXCLUDE = re.compile(r"(불가|제외)\s*(함|됨|합니다|입니다|\)|$)|선발\s*제외|신청\s*제외|제외\s*(대상|학과)|^제외")
_CRIT_PERSON = re.compile(r"학생|자\b|자$|자\)|생$|재학|졸업|학년|학기|이상|이하|소지|가능|거주|국적|교원|직원|청년|분$|사람")
_CRIT_PROGRAM_NAME = re.compile(r"장학금\s*(,|$)")
_DOC_SELECTED_ONLY = re.compile(r"선발\s*(인원|자|된)|합격자|최종\s*선발|선정\s*후|선발\s*대상")
_DOC_FORMAT_WORDS = re.compile(r"\(.*?\)|hwp|pdf|docx?|한글|양식|파일|형식|병합|사용|작성|으로|로|된|한", re.I)
_URL_ONLY = re.compile(r"(?:https?://)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:/\S*)?", re.I)


def _check_category(key: str, value: str) -> list[Check]:
    v = (value or "").strip()

    def fail(detail: str) -> list[Check]:
        return [Check(name="category_fit", passed=False, score=0.0, detail=detail)]

    if key == "applicant_criteria":
        if _CRIT_SELECTION.search(v):
            return fail("선발 방법·심사 기준으로 보여요. 신청 대상이 맞는지 확인해 주세요")
        if _CRIT_EXCLUDE.search(v) and "가능" not in v:  # "개인만 가능, 팀 불가"처럼 가능 범위를 말하는 문장은 제외
            return fail("신청할 수 없는 사람(제외 대상)으로 보여요")
        if _CRIT_PROGRAM_NAME.search(v) and not _CRIT_PERSON.search(v):
            return fail("장학금·프로그램 이름으로 보여요. 신청 대상이 맞는지 확인해 주세요")
    elif key == "required_document":
        if _DOC_SELECTED_ONLY.search(v):
            return fail("선발된 사람만 나중에 내는 서류로 보여요")
        core = re.sub(r"[^0-9a-z가-힣]", "", _DOC_FORMAT_WORDS.sub("", v).lower())
        if len(core) < 2:
            return fail("서류 이름이 아니라 파일 형식·작성 방법으로 보여요")
    elif key == "submission_method":
        rest = re.sub(r"[^0-9a-z가-힣]", "", _URL_ONLY.sub("", v).lower())
        if _URL_ONLY.search(v) and len(rest) < 2:
            return fail("사이트 주소만 있어요. 어디서 어떻게 신청하는지 확인해 주세요")
    return []


class Verifier:
    def __init__(self, source: SourceDocument, sentences: list[Sentence], threshold: int, now: datetime):
        self.source = source
        self.sentences = sentences
        self.threshold = threshold
        self.now = now
        # 정규화된 전체 원문 + 각 글자가 어느 문장에서 왔는지
        chars, owner = [], []
        for i, s in enumerate(sentences):
            n = normalize(s.text)
            chars.append(n)
            owner.extend([i] * len(n))
        self._norm_full = "".join(chars)
        self._owner = owner
        self._norm_sent = [normalize(s.text) for s in sentences]

    # ───────────────────────── 근거 위치 찾기 ─────────────────────────
    def _evidence_from(self, quote: str, i: int, j: int, score: float) -> Evidence:
        ss = self.sentences[i : j + 1]
        return Evidence(
            quote=quote,
            matched_text=" ".join(s.text for s in ss),
            page=ss[0].page,
            sentence_start=ss[0].index,
            sentence_end=ss[-1].index if ss[-1].page == ss[0].page else None,
            char_start=ss[0].char_start,
            char_end=ss[-1].char_end,
            match_score=round(score, 3),
        )

    def locate(self, quote: str) -> Evidence:
        nq = normalize(quote)
        if not nq:
            return Evidence(quote=quote, match_score=0.0)
        pos = self._norm_full.find(nq)
        if pos >= 0:
            return self._evidence_from(quote, self._owner[pos], self._owner[pos + len(nq) - 1], 1.0)

        best, best_ij = 0.0, None
        n = len(self.sentences)
        for i in range(n):
            window = ""
            for j in range(i, min(i + 3, n)):
                window += self._norm_sent[j]
                if len(window) >= len(nq):
                    s = fuzz.partial_ratio(nq, window) / 100
                else:
                    s = fuzz.ratio(nq, window) / 100
                if s > best:
                    best, best_ij = s, (i, j)
        if best_ij is None:
            return Evidence(quote=quote, match_score=0.0)
        return self._evidence_from(quote, *best_ij, best)

    def _reanchor(self, f: LLMField) -> Evidence | None:
        """인용문이 틀렸지만 값 자체는 원문 어딘가에 있을 때 그 문장을 근거로 다시 붙인다."""
        if f.key in DATE_KEYS:
            target = parse_iso(f.normalized_datetime) or next(iter(parse_dates(f.value)), None)
            if not target:
                return None
            for i, s in enumerate(self.sentences):
                if any(d.same_day(target) for d in parse_dates(s.text)):
                    return self._evidence_from(f.evidence_quote, i, i, REANCHOR_SCORE)
            return None
        if f.key in INFERRED_KEYS:
            return None
        nv = normalize(f.value)
        for i, ns in enumerate(self._norm_sent):
            if len(nv) >= 2 and len(ns) >= len(nv) and fuzz.partial_ratio(nv, ns) >= 92:
                return self._evidence_from(f.evidence_quote, i, i, REANCHOR_SCORE)
        return None

    def _locate_field(self, f: LLMField) -> _Located:
        ev = self.locate(f.evidence_quote)
        if ev.match_score >= EVIDENCE_MIN:
            return _Located(ev, ev.matched_text or "")
        re_ev = self._reanchor(f)
        if re_ev:
            return _Located(re_ev, re_ev.matched_text or "", reanchored=True)
        return _Located(ev, "")

    # ───────────────────────── 값 검사 ─────────────────────────
    def _check_date(self, f: LLMField, text: str) -> list[Check]:
        target: ParsedDate | None = parse_iso(f.normalized_datetime) or next(iter(parse_dates(f.value)), None)
        if target is None:
            return [Check(name="value_in_evidence", passed=False, score=0.0, detail=f"날짜로 해석할 수 없는 값: {f.value}")]
        dates = parse_dates(text)
        hits = [d for d in dates if d.same_day(target)]
        label = f"{target.month}월 {target.day}일"
        if not hits:
            return [Check(name="value_in_evidence", passed=False, score=0.0, detail=f"근거 문장에 {label}이 없습니다")]
        d = hits[0]
        checks = [Check(name="value_in_evidence", passed=True, score=1.0, detail=f"근거 문장에서 '{d.raw}' 확인")]

        # 시각
        if target.has_time and d.has_time and not target.same_time(d):
            checks.append(Check(name="date_time", passed=False, score=0.3,
                                detail=f"시각 불일치: 추출 {target.hour:02d}:{target.minute or 0:02d} / 원문 {d.hour:02d}:{d.minute or 0:02d}"))
        elif target.has_time and not d.has_time:
            checks.append(Check(name="date_time", passed=False, score=0.3, detail="원문에 없는 시각이 추가되었습니다"))
        elif not target.has_time and d.has_time:
            checks.append(Check(name="date_time", passed=True, score=0.85,
                                detail=f"원문에 시각({d.hour:02d}:{d.minute or 0:02d})이 있지만 추출값에서 빠졌습니다"))
        else:
            checks.append(Check(name="date_time", passed=True, score=1.0, detail="시각 일치"))

        # 날짜 의미
        if f.key in _ROLE:
            window = text[max(0, d.start - 25) : d.end + 15]
            own = _ROLE[f.key].search(window)
            conflict = next((k for k in _CONFLICT.get(f.key, []) if _ROLE[k].search(window)), None)
            if own:
                checks.append(Check(name="date_role", passed=True, score=1.0,
                                    detail=f"'{own.group(0)}' 표현으로 {_ROLE_NAME[f.key]}임을 확인"))
            elif conflict:
                checks.append(Check(name="date_role", passed=False, score=0.0,
                                    detail=f"이 날짜는 {_ROLE_NAME[conflict]}로 보입니다. {_ROLE_NAME[f.key]}로 잘못 분류했을 수 있습니다"))
            else:
                checks.append(Check(name="date_role", passed=False, score=0.6,
                                    detail=f"날짜 주변에 {_ROLE_NAME[f.key]}를 뜻하는 표현이 없습니다"))

        # 기간 시작/끝
        if f.key in (FieldKey.DEADLINE, FieldKey.APPLICATION_START):
            for a, b in find_ranges(text, dates):
                if f.key == FieldKey.DEADLINE and d is a:
                    checks.append(Check(name="date_range", passed=False, score=0.0,
                                        detail=f"'{a.raw} ~ {b.raw}' 기간의 시작일을 마감일로 추출했습니다"))
                elif f.key == FieldKey.APPLICATION_START and d is b:
                    checks.append(Check(name="date_range", passed=False, score=0.0,
                                        detail=f"'{a.raw} ~ {b.raw}' 기간의 마감일을 시작일로 추출했습니다"))
                elif d is a or d is b:
                    checks.append(Check(name="date_range", passed=True, score=1.0, detail="기간의 시작/끝 구분 일치"))
        return checks

    def _check_text(self, f: LLMField, text: str) -> list[Check]:
        nv, ne = normalize(f.value), normalize(text)
        if not ne:
            return [Check(name="value_in_evidence", passed=False, score=0.0, detail="근거 문장이 없습니다")]
        if f.key in INFERRED_KEYS:
            words = [_PARTICLE_TAIL.sub("", w) for w in f.value.split()]
            objects = [w for w in words if len(w) >= 2 and w not in _ACTION_WORDS]
            if not objects:
                return [Check(name="value_in_evidence", passed=True, score=0.5, detail="행동만 있고 대상 명사가 없습니다")]
            found = [w for w in objects if fuzz.partial_ratio(normalize(w), ne) >= 85]
            score = len(found) / len(objects)
            return [Check(name="value_in_evidence", passed=score >= 0.5, score=round(score, 2),
                          detail=f"근거 문장에서 대상 확인: {', '.join(found) or '없음'}")]
        s = (fuzz.partial_ratio(nv, ne) if len(nv) <= len(ne) else fuzz.ratio(nv, ne)) / 100
        return [Check(name="value_in_evidence", passed=s >= 0.85, score=round(s, 2),
                      detail="값이 근거 문장에 있습니다" if s >= 0.85 else f"값이 근거 문장과 다릅니다 (일치도 {s:.0%})")]

    # ───────────────────────── 필드 판정 ─────────────────────────
    def verify_field(self, f: LLMField, fid: str) -> VerifiedField:
        loc = self._locate_field(f)
        ev_score = loc.evidence.match_score
        if loc.reanchored:
            ev_check = Check(name="evidence_found", passed=False, score=ev_score,
                             detail="AI가 제시한 인용문은 원문과 다르지만, 값이 있는 문장을 다시 찾았습니다")
        elif ev_score >= EVIDENCE_MIN:
            ev_check = Check(name="evidence_found", passed=True, score=ev_score,
                             detail="원문과 정확히 일치" if ev_score == 1.0 else f"원문과 {ev_score:.0%} 일치")
        else:
            ev_check = Check(name="evidence_found", passed=False, score=ev_score,
                             detail="원문에서 근거를 찾지 못했습니다 (AI가 만들어낸 정보일 수 있음)")

        value_checks = self._check_date(f, loc.text) if f.key in DATE_KEYS else self._check_text(f, loc.text)
        if f.key not in DATE_KEYS:
            value_checks += _check_category(f.key.value, f.value)

        if f.key == FieldKey.APPLICANT_EXCLUSION and not _EXCLUSION_ROLE.search(loc.text):
            value_checks.append(Check(name="exclusion_role", passed=False, score=0.0,
                                      detail="근거 문장에서 신청 불가 또는 제외 조건을 확인하지 못했습니다"))
        val_score = sum(c.score for c in value_checks) / len(value_checks)
        conf = W_EVIDENCE * ev_score + W_VALUE * val_score + W_LLM * f.confidence
        hard_fail = any(not c.passed and c.score <= 0.3 for c in value_checks)

        if not loc.text:
            status, conf = "unverified", min(conf, 0.40)
        else:
            if hard_fail:
                conf = min(conf, 0.60)
            if loc.reanchored:
                conf = min(conf, (self.threshold - 1) / 100)
            status = "verified" if round(conf * 100) >= self.threshold else "needs_review"

        return VerifiedField(
            id=fid,
            key=f.key,
            label=f.label,
            value=f.value,
            normalized_datetime=f.normalized_datetime,
            evidence=loc.evidence,
            llm_confidence=f.confidence,
            checks=[ev_check, *value_checks],
            confidence=round(conf * 100),
            status=status,
            location=loc.evidence.location,
        )

    # ───────────────────────── 문서 단위 ─────────────────────────
    def verify(self, extraction: LLMExtraction, document_id: str, provider: str) -> AnalysisResult:
        counters: dict[str, int] = {}
        fields = []
        for f in extraction.fields:
            counters[f.key.value] = counters.get(f.key.value, 0) + 1
            fields.append(self.verify_field(f, f"{f.key.value}-{counters[f.key.value]}"))

        warnings = []
        deadlines = [f for f in fields if f.key == FieldKey.DEADLINE and f.status != "unverified"]
        distinct = {(parse_iso(f.normalized_datetime) or ParsedDate(None, 0, 0, None, None, 0, 0, "")).iso() for f in deadlines}
        if not deadlines:
            warnings.append("마감일을 찾지 못했습니다. 원문을 직접 확인해 주세요.")
        elif len(distinct) > 1:
            warnings.append(f"마감일 후보가 {len(distinct)}개입니다: " + ", ".join(f.value for f in deadlines))
        for f in deadlines:
            dt = parse_iso(f.normalized_datetime)
            if dt and dt.year:
                due = datetime(dt.year, dt.month, dt.day, dt.hour if dt.has_time else 23, dt.minute or (0 if dt.has_time else 59))
                if due < self.now.replace(tzinfo=None):
                    warnings.append(f"마감일({f.value})이 이미 지났습니다.")
        unverified = [f for f in fields if f.status == "unverified"]
        if unverified:
            warnings.append(f"원문에서 근거를 찾지 못한 항목 {len(unverified)}개가 있습니다: " + ", ".join(f.value for f in unverified))
        if self.source.masked_count:
            warnings.append(f"개인정보 {self.source.masked_count}건을 마스킹한 뒤 분석했습니다.")

        return AnalysisResult(
            document_id=document_id,
            title=extraction.title,
            doc_category=extraction.doc_category,
            doc_subtype=extraction.doc_subtype,
            fields=fields,
            warnings=warnings,
            needs_review=any(f.status in ("needs_review", "unverified") for f in fields),
            llm_provider=provider,
            created_at=self.now,
        )
