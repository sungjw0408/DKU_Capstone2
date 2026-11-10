"""정답지 기반 채점 스크립트 — 앱(추출 + 근거 검증)이 얼마나 맞히는지 잰다.

AI를 학습시키지 않는다. 사람이 만든 정답지와 앱 결과를 비교해 점수만 계산한다.

사용법 (backend 폴더에서, .venv 켠 상태)
    python -m eval.evaluate --check                    # 정답지 형식만 점검 (AI 호출 없음)
    python -m eval.evaluate --provider mock --runs 1   # API 키 없이 흐름 연습
    python -m eval.evaluate                            # .env 설정(Gemini)으로 공지마다 3번씩 채점
    python -m eval.evaluate --regrade 20261013_161048  # 예전 결과의 앱 답으로 다시 채점 (Gemini 안 부름)

옵션
    --runs 3            같은 공지를 몇 번 돌릴지 (AI 답이 매번 다를 수 있어서 여러 번)
    --types txt,png     채점할 입력 형식 (폴더에 있는 것만)
    --only 공지01,공지02 일부 공지만
    --sleep 2           호출 사이 쉬는 초 (Gemini 사용량 제한 대비)

결과는 eval/results/<날짜_시각>/ 에 저장된다.
    summary.txt  지표 요약 (보고서에 쓰는 숫자)
    items.csv    항목별 채점 내역 (Excel로 열어서 틀린 이유 확인)
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time as dtime
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent

# 정답지 '항목' 이름 → 앱 필드 key. 채점은 이 6가지만 한다.
LABELS = {
    "신청 대상": "applicant_criteria",
    "신청 시작": "application_start",
    "마감일": "deadline",
    "결과 발표": "announcement_date",
    "제출 서류": "required_document",
    "제출 방법": "submission_method",
}
KEY_TO_LABEL = {v: k for k, v in LABELS.items()}
DATE_KEYS = {"application_start", "deadline", "announcement_date"}
MIME = {
    ".txt": "text/plain", ".md": "text/plain", ".pdf": "application/pdf",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
}
FLAGGED = {"needs_review", "unverified"}


# ─────────────────────────── 정답지 읽기 ───────────────────────────
@dataclass
class Answer:
    notice: str
    key: str
    value: str
    time: str | None
    row: int
    allowed: bool = False  # 허용 답: 앱이 뽑으면 정답, 안 뽑아도 감점 없음
    group: str = ""        # 묶음: 같은 이름의 허용 답은 "다 뽑거나 다 안 뽑거나" (일부만 뽑으면 감점)


def _cell_text(v) -> str:
    """Excel 칸 값을 글자로. 날짜·시각으로 자동 변환된 칸도 처리."""
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d") if (v.hour, v.minute) == (0, 0) else v.strftime("%Y-%m-%d %H:%M")
    if isinstance(v, date):
        return v.strftime("%Y-%m-%d")
    if isinstance(v, dtime):
        return v.strftime("%H:%M")
    return str(v).strip()


def load_answers(path: Path) -> tuple[dict[str, list[Answer]], list[str]]:
    from openpyxl import load_workbook

    wb = load_workbook(path, data_only=True)
    ws = wb["정답지"]
    head = [_cell_text(c.value) for c in ws[1]]
    col = {name: head.index(name) for name in ("공지ID", "항목", "정답", "시각", "허용", "묶음") if name in head}
    answers: dict[str, list[Answer]] = defaultdict(list)
    problems: list[str] = []
    for r, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        nid, label, value = (_cell_text(row[col[k]]) for k in ("공지ID", "항목", "정답"))
        tm = _cell_text(row[col["시각"]]) if "시각" in col else ""
        if not (nid or label or value):
            continue
        if not nid or not label or not value:
            problems.append(f"정답지 {r}행: 공지ID·항목·정답 중 빈 칸이 있어요")
            continue
        if label not in LABELS:
            problems.append(f"정답지 {r}행: 항목 '{label}'은(는) 채점 항목이 아니에요 ({', '.join(LABELS)})")
            continue
        key = LABELS[label]
        if " " in value and key in DATE_KEYS and not tm:  # '2026-09-25 17:00'처럼 한 칸에 적은 경우
            value, tm = value.split(" ", 1)
        if key in DATE_KEYS and not _parse_answer_date(value):
            problems.append(f"정답지 {r}행: 날짜 '{value}'을(를) 읽을 수 없어요 (2026-09-25 형식)")
            continue
        if tm and not _parse_hm(tm):
            problems.append(f"정답지 {r}행: 시각 '{tm}'을(를) 읽을 수 없어요 (17:00 형식)")
            continue
        mark = _cell_text(row[col["허용"]]) if "허용" in col and col["허용"] < len(row) else ""
        if mark and mark.upper() not in ("O", "Y", "허용", "V", "○"):
            problems.append(f"정답지 {r}행: 허용 칸에는 O만 적어요 (지금: '{mark}')")
            continue
        grp = _cell_text(row[col["묶음"]]) if "묶음" in col and col["묶음"] < len(row) else ""
        if grp and not mark:
            problems.append(f"정답지 {r}행: 묶음은 허용 답(허용 칸 O)에만 써요")
            continue
        answers[nid].append(Answer(nid, key, value, tm or None, r, allowed=bool(mark), group=grp))
    return answers, problems


def _parse_answer_date(s: str) -> date | None:
    for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(s.strip().rstrip("."), fmt).date()
        except ValueError:
            pass
    return None


def _parse_hm(s: str) -> tuple[int, int] | None:
    try:
        h, m = s.strip().split(":")[:2]
        return int(h), int(m)
    except ValueError:
        return None


# ─────────────────────────── 맞았는지 판단 ───────────────────────────
# [서식2], [붙임1. 지원서], [첨부. 참가 신청서] 같은 머리표: 머리표 글자만 지우고 대괄호 안의 서류 이름은 남긴다
_TAG = re.compile(r"\[\s*(?:서식|붙임|첨부|양식)\s*\d*\s*[.:]?\s*([^\]]*)\]")


# 앱이 프롬프트 규칙에 따라 붙이는 표시: 내용이 아니라 표시라서 비교에서 뺀다
_NOTE = re.compile(r"\(\s*(?:선택|해당하는\s*경우|해당자만?|다음\s*중\s*하나|택\s*1)\s*\)")


def _untag(s: str) -> str:
    s = _NOTE.sub(" ", s or "")
    return _TAG.sub(lambda m: " " + m.group(1) + " ", s)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_URL = re.compile(r"(?:https?://)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?:/\S*)?", re.I)  # 끝이 .com처럼 영문이어야 주소 (3.5 같은 숫자 제외)
_NUM = re.compile(r"\d+(?:\.\d+)?")
_MAIL = re.compile(r"메일")


def _clean(s: str) -> str:
    """비교용 글자: 머리표·기호·띄어쓰기를 지우고 한글·영문·숫자만 남긴다 (영문은 소문자)"""
    s = _untag(s).lower()
    return re.sub(r"[^0-9a-z가-힣]", "", s)


def _numbers(s: str) -> set[str]:
    """이메일·주소를 뺀 나머지에 나오는 숫자 (평점 3.5, 12학점 등)"""
    s = _URL.sub(" ", _EMAIL.sub(" ", _untag(s)))
    out: set[str] = set()
    for tok in re.findall(r"\d+(?:\.\d+)*", s):
        parts = tok.split(".")
        # 평점 3.5, 4.0 같은 소수는 그대로, 2026.05.16 같은 날짜는 2026 / 05 / 16 으로 나눈다
        if len(parts) == 2 and len(parts[0]) <= 2 and len(parts[1]) <= 2:
            out.add(tok)
        else:
            out.update(x.lstrip("0") or "0" for x in parts)
    return out


def _bigram_cover(short: str, long_: str) -> float:
    """짧은 쪽의 두 글자 묶음이 긴 쪽에 얼마나 들어 있나 (0~1)"""
    grams = [short[i:i + 2] for i in range(len(short) - 1)]
    return sum(g in long_ for g in grams) / len(grams) if grams else 0.0


def is_match(ans: Answer, f) -> bool:
    from rapidfuzz import fuzz

    from app.utils.dates import parse_dates, parse_iso

    if ans.key in DATE_KEYS:
        want = _parse_answer_date(ans.value)
        got = parse_iso(f.normalized_datetime) or next(iter(parse_dates(f.value)), None)
        if not want or not got:
            return False
        g_date = (got.month, got.day)
        g_time = (got.hour, got.minute or 0) if got.has_time else None
        if g_time == (24, 0):            # "24시"는 그날 23:59와 같은 뜻
            g_time = (23, 59)
        if g_date != (want.month, want.day):
            from datetime import date as _d, timedelta as _td
            try:  # "7월 2일 자정까지"를 7월 3일 0시로 적은 경우 = 7월 2일 23:59
                prev = _d(got.year or want.year, got.month, got.day) - _td(days=1)
            except (TypeError, ValueError):
                return False
            if g_time == (0, 0) and (prev.month, prev.day) == (want.month, want.day):
                g_date, g_time = (prev.month, prev.day), (23, 59)
                got = type("G", (), {"year": prev.year})()
            else:
                return False
        if got.year and got.year != want.year:
            return False                 # 연도가 다르면 앱의 진짜 실수 (채점에서 봐주지 않음)
        if ans.time:                     # 정답에 시각이 있으면 시각까지 같아야 정답
            want_t = _parse_hm(ans.time)
            want_t = (23, 59) if want_t == (24, 0) else want_t
            return g_time == want_t
        return True

    raw_a, raw_b = ans.value, f.value
    # 같은 이메일 주소나 같은 사이트 주소가 양쪽에 있으면 같은 뜻
    ea, eb = set(_EMAIL.findall(raw_a.lower())), set(_EMAIL.findall(raw_b.lower()))
    da = {d.lower() for d in _URL.findall(_EMAIL.sub(" ", raw_a))}
    db = {d.lower() for d in _URL.findall(_EMAIL.sub(" ", raw_b))}
    if (ea & eb) or (da & db):
        return True
    # 글자 비교는 주소를 뺀 나머지로 (주소는 위에서 따로 비교)
    a = _clean(_URL.sub(" ", _EMAIL.sub(" ", raw_a)))
    b = _clean(_URL.sub(" ", _EMAIL.sub(" ", raw_b)))
    if not a or not b:
        return False

    # 안전장치: 짧은 쪽에 나온 숫자는 긴 쪽에도 있어야 한다 (평점 3.5 ≠ 2.5)
    (short, short_raw), (long_, long_raw) = sorted([(a, raw_a), (b, raw_b)], key=lambda x: len(x[0]))
    if not _numbers(short_raw) <= _numbers(long_raw):
        return False

    # 1) 거의 같거나, 한쪽이 다른 쪽을 그대로 포함
    if a == b or fuzz.ratio(a, b) >= 85 or (len(short) >= 2 and short in long_):
        return True

    # 2) 제출 방법
    if ans.key == "submission_method":
        # "이메일" ↔ 이메일 주소
        # (주의: "온라인·홈페이지" ↔ 아무 사이트 주소는 같은 뜻으로 보지 않는다. 엉뚱한 사이트일 수 있음)
        if (_MAIL.search(raw_a) and eb) or (_MAIL.search(raw_b) and ea):
            return True
        # 같은 사이트·시스템 이름(영문 4글자 이상)이 양쪽 글자에 있음: "Solid KPI 홈페이지" ↔ "Solid KPI 시스템"
        la = {w for w in re.findall(r"[a-z]{4,}", a) if w not in ("https", "http", "www")}
        lb = {w for w in re.findall(r"[a-z]{4,}", b) if w not in ("https", "http", "www")}
        if any(x in b for x in la) or any(x in a for x in lb):
            return True

    # 3) 짧은 쪽 내용의 70% 이상이 긴 쪽에 들어 있음 (말을 조금 덧붙이거나 바꾼 경우)
    return len(short) >= 4 and _bigram_cover(short, long_) >= 0.7


# ─────────────────────────── 채점 ───────────────────────────
@dataclass
class Row:
    input_type: str
    notice: str
    run: int
    label: str
    answer: str
    app_value: str
    confidence: int | None
    status: str
    grade: str  # 정답 | 오답 | 누락 | 실패
    evidence: str = ""
    note: str = ""
    is_app: bool = True     # 앱이 낸 항목인가 (정확도 계산에 씀)
    is_answer: bool = True  # 정답지의 정답인가 (재현율 계산에 씀)
    fid: str = ""           # 앱 항목 id (features.py 가 근거 점수와 잇는 데 씀)


def grade_one(input_type: str, notice: str, run: int, answers: list[Answer], analysis) -> list[Row]:
    rows: list[Row] = []
    app = [f for f in analysis.fields if f.key.value in KEY_TO_LABEL]
    used: set[str] = set()
    hit_of: dict[int, object] = {}

    # 1차: 정답 하나 ↔ 앱 항목 하나 짝짓기 (필수 정답 먼저, 허용 답은 그다음)
    order = [i for i, a in enumerate(answers) if not a.allowed] + [i for i, a in enumerate(answers) if a.allowed]
    for i in order:
        ans = answers[i]
        hit = next((f for f in app if f.id not in used and f.key.value == ans.key and is_match(ans, f)), None)
        if hit:
            used.add(hit.id)
            hit_of[i] = hit

    # 묶음별로 몇 개를 찾았나: 0개 = 안 뽑음, 전부 = 모두, 그 사이 = 일부
    group_state: dict[tuple[str, str], str] = {}
    groups: dict[tuple[str, str], list[int]] = defaultdict(list)
    for i, a in enumerate(answers):
        if a.allowed and a.group:
            groups[(a.key, a.group)].append(i)
    for gk, idx in groups.items():
        found = sum(1 for i in idx if i in hit_of or any(
            f.id in used and f.key.value == answers[i].key and is_match(answers[i], f) for f in app))
        group_state[gk] = "없음" if found == 0 else "모두" if found == len(idx) else "일부"

    for i, ans in enumerate(answers):
        label = KEY_TO_LABEL[ans.key]
        shown = f"{ans.value} {ans.time}" if ans.time else ans.value
        h = hit_of.get(i)
        if ans.allowed:
            if not h and ans.group:  # 묶음은 앱이 한 항목에 묶어 써도 찾은 것으로
                h = next((f for f in app if f.id in used and f.key.value == ans.key and is_match(ans, f)), None)
            g = group_state.get((ans.key, ans.group)) if ans.group else None
            if g == "일부":  # 묶음을 일부만 뽑음 → 묶음 전체를 필수로 보고 채점 (빠진 것은 누락)
                if h:
                    rows.append(Row(input_type, notice, run, label, shown, h.value, h.confidence, h.status, "정답",
                                    h.evidence.matched_text or "", note=f"묶음 '{ans.group}' 일부만 뽑음",
                                    is_app=hit_of.get(i) is not None, fid=h.id))
                else:
                    rows.append(Row(input_type, notice, run, label, shown, "", None, "", "누락",
                                    note=f"묶음 '{ans.group}' 일부만 뽑음", is_app=False))
            elif h:  # 허용 답을 앱이 뽑음 → 앱 항목은 정답, 재현율 계산에는 안 넣음
                rows.append(Row(input_type, notice, run, label, shown, h.value, h.confidence, h.status, "정답",
                                h.evidence.matched_text or "",
                                note=f"묶음 '{ans.group}' 모두 뽑음" if ans.group else "허용 답",
                                is_app=hit_of.get(i) is not None, is_answer=False, fid=h.id))
            else:  # 허용 답을 앱이 안 뽑음 → 감점 없음
                rows.append(Row(input_type, notice, run, label, shown, "", None, "", "허용",
                                note="허용 답 (앱이 안 뽑음, 감점 없음)", is_app=False, is_answer=False))
            continue
        if h:
            rows.append(Row(input_type, notice, run, label, shown, h.value, h.confidence, h.status, "정답",
                            h.evidence.matched_text or "", fid=h.id))
            continue
        # 2차: 앱이 여러 정답을 한 항목에 묶어 쓴 경우 → 이미 짝지은 항목에 이 정답도 들어 있으면 찾은 것으로
        h = next((f for f in app if f.id in used and f.key.value == ans.key and is_match(ans, f)), None)
        if h:
            rows.append(Row(input_type, notice, run, label, shown, h.value, h.confidence, h.status, "정답",
                            h.evidence.matched_text or "", note="앱이 여러 정답을 한 항목에 묶음", is_app=False))
        else:
            rows.append(Row(input_type, notice, run, label, shown, "", None, "", "누락", is_app=False))

    # 3차: 짝이 안 맞은 앱 항목
    for f in app:
        if f.id in used:
            continue
        label = KEY_TO_LABEL[f.key.value]
        ans = next((a for a in answers if a.key == f.key.value and is_match(a, f)), None)
        if ans:  # 정답 하나를 앱이 여러 항목으로 나눠 뽑은 경우 → 틀린 게 아님
            rows.append(Row(input_type, notice, run, label, ans.value, f.value, f.confidence, f.status, "정답",
                            f.evidence.matched_text or "",
                            note="허용 답" if ans.allowed else "앱이 한 정답을 나눠 뽑음", is_answer=False, fid=f.id))
        else:    # 틀린 값이거나 지어낸 항목
            rows.append(Row(input_type, notice, run, label, "", f.value, f.confidence, f.status, "오답",
                            f.evidence.matched_text or f.evidence.quote, is_answer=False, fid=f.id))
    return rows


def signature(rows: list[Row]) -> tuple:
    """일관성 비교용: 이 회차에 앱이 낸 (항목, 값) 목록"""
    from app.utils.text import normalize

    return tuple(sorted((r.label, normalize(r.app_value)) for r in rows if r.is_app and r.grade in ("정답", "오답")))


# ─────────────────────────── 지표 ───────────────────────────
def pct(n: int, d: int) -> str:
    return f"{n / d * 100:5.1f}%  ({n}/{d})" if d else "   -    (0/0)"


def summarize(rows: list[Row], sigs: dict[str, list[tuple]], runs: int, failures: list[str]) -> str:
    app_items = [r for r in rows if r.is_app and r.grade in ("정답", "오답")]
    correct = [r for r in app_items if r.grade == "정답"]
    wrong = [r for r in app_items if r.grade == "오답"]
    verified = [r for r in app_items if r.status == "verified"]
    answers = [r for r in rows if r.is_answer and r.grade in ("정답", "누락")]

    out = []
    out.append(f"공지 {len(sigs)}건 × {runs}회 · 정답 항목 {len(answers) // max(runs, 1)}개(회차당)")
    # 허용 답 줄 수 (묶음 포함): 앱이 뽑은 것 / 안 뽑은 것 / 묶음 일부만 뽑은 것
    hit = [r for r in rows if r.is_answer is False and r.grade == "정답" and (r.note == "허용 답" or "모두 뽑음" in r.note)]
    miss = [r for r in rows if r.grade == "허용"]
    part = [r for r in rows if "일부만 뽑음" in r.note]
    allowed_all = len(hit) + len(miss) + len(part)
    if allowed_all:
        out.append(f"허용 답 {allowed_all // max(runs, 1)}개(회차당) · 앱이 뽑은 것 {len(hit)}건"
                   + (f" · 묶음 일부만 뽑음 {len(part)}건(감점)" if part else "")
                   + " (허용 답은 정확도에만 반영, 재현율에는 안 넣음)")
    if failures:
        out.append(f"분석 실패 {len(failures)}건: " + ", ".join(failures))
    out.append("")
    out.append("[핵심 지표]")
    out.append(f"  추출 정확도   앱이 낸 항목 중 정답        {pct(len(correct), len(app_items))}")
    out.append(f"  재현율        정답 중 앱이 찾아낸 것       {pct(len([r for r in answers if r.grade == '정답']), len(answers))}")
    out.append(f"  확인됨 정밀도 '확인됨' 중 실제 정답        {pct(len([r for r in verified if r.grade == '정답']), len(verified))}")
    out.append(f"  오류 탐지율   틀린 항목 중 검증이 잡은 것  {pct(len([r for r in wrong if r.status in FLAGGED]), len(wrong))}")
    before = len(wrong) / max(runs, 1)
    after = len([r for r in wrong if r.status == "verified"]) / max(runs, 1)
    out.append(f"  검증 전후 오류 (회차 평균)  검증 없이 보이는 틀린 항목 {before:.1f}개 → 검증 후 '확인됨'으로 믿게 되는 틀린 항목 {after:.1f}개")
    out.append("")
    out.append("[신뢰도 보정] 점수 구간별 실제 정답률")
    for name, lo, hi in (("90 이상", 90, 101), ("80~89", 80, 90), ("80 미만", 0, 80)):
        b = [r for r in app_items if r.confidence is not None and lo <= r.confidence < hi]
        out.append(f"  {name:8} {pct(len([r for r in b if r.grade == '정답']), len(b))}")
    out.append("")
    out.append("[항목별]  정확도 / 재현율")
    for label in LABELS:
        ai = [r for r in app_items if r.label == label]
        an = [r for r in answers if r.label == label]
        out.append(f"  {label:6}  {pct(len([r for r in ai if r.grade == '정답']), len(ai))}  /  "
                   f"{pct(len([r for r in an if r.grade == '정답']), len(an))}")
    if runs > 1:
        out.append("")
        out += consistency(rows, sigs, runs)
    return "\n".join(out)


def consistency(rows: list[Row], sigs: dict, runs: int) -> list[str]:
    """일관성: 같은 공지를 여러 번 돌렸을 때 같은 '정보'를 내는가 (표현이 아니라 찾은 정답 기준)"""
    from collections import Counter

    # 회차마다: 찾은 정답 목록 + 항목별 오답 개수
    per_run: dict[str, dict[int, tuple]] = defaultdict(dict)
    outcome: dict[tuple, dict[int, str]] = defaultdict(dict)
    for (notice, run) in {(r.notice, r.run) for r in rows}:
        part = [r for r in rows if r.notice == notice and r.run == run]
        found = tuple(sorted((r.label, r.answer) for r in part if r.is_answer and r.grade == "정답"))
        wrong = tuple(sorted(Counter(r.label for r in part if r.is_app and r.grade == "오답").items()))
        per_run[notice][run] = (found, wrong)
        for r in part:
            if r.is_answer and r.grade in ("정답", "누락"):
                outcome[(notice, r.label, r.answer)][run] = r.grade

    same_info = [n for n, by in per_run.items() if len(by) == runs and len(set(by.values())) == 1]
    stable = [k for k, by in outcome.items() if len(by) == runs and len(set(by.values())) == 1]
    same_text = [n for n, sg in sigs.items() if len(sg) == runs and len(set(sg)) == 1]
    lines = [f"[일관성] 같은 공지를 {runs}번 돌렸을 때",
             f"  공지 일관성   {runs}회 모두 같은 정답을 찾고 같은 항목에서 틀린 공지   {pct(len(same_info), len(per_run))}",
             f"  정답 일관성   정답이 {runs}회 모두 똑같이 찾았거나 똑같이 못 찾은 비율    {pct(len(stable), len(outcome))}",
             f"  (참고) 앱이 낸 글자까지 {runs}회 모두 같은 공지                      {pct(len(same_text), len(sigs))}"]
    diff = sorted(n for n in per_run if n not in same_info)
    if diff:
        lines.append("  정보가 달라진 공지: " + ", ".join(diff))
    return lines


# ─────────────────────────── 실행 ───────────────────────────
def main() -> int:
    p = argparse.ArgumentParser(description="정답지 기반 채점")
    p.add_argument("--key", default=str(HERE / "answer_key.xlsx"))
    p.add_argument("--notices", default=str(HERE / "notices"))
    p.add_argument("--runs", type=int, default=3)
    p.add_argument("--types", default="txt,png,jpg,jpeg,pdf")
    p.add_argument("--only", default="")
    p.add_argument("--sleep", type=float, default=2.0)
    p.add_argument("--provider", choices=["gemini", "mock"], help="생략하면 .env 설정")
    p.add_argument("--check", action="store_true", help="정답지 형식만 점검")
    p.add_argument("--regrade", default="", help="예전 결과 폴더의 앱 답(raw)으로 다시 채점 (Gemini 안 부름)")
    p.add_argument("--reverify", action="store_true",
                   help="--regrade 와 함께: AI 답은 그대로 두고 근거 검증만 지금 코드로 다시 실행 (검증 코드를 고쳤을 때)")
    args = p.parse_args()

    os.chdir(BACKEND)  # .env 를 backend 폴더에서 읽도록
    sys.path.insert(0, str(BACKEND))
    os.environ["STORAGE_BACKEND"] = "memory"  # 채점 결과로 DB를 더럽히지 않음
    if args.provider:
        os.environ["LLM_PROVIDER"] = args.provider

    answers, problems = load_answers(Path(args.key))
    notice_dir = Path(args.notices)
    types = {"." + t.strip().lower() for t in args.types.split(",") if t.strip()}
    files = sorted(f for f in notice_dir.glob("*") if f.suffix.lower() in types)
    only = {s.strip() for s in args.only.split(",") if s.strip()}
    if only:
        files = [f for f in files if f.stem in only]

    stems = {f.stem for f in files}
    for nid in sorted(answers):
        if not only or nid in only:
            if nid not in stems:
                problems.append(f"{nid}: 정답은 있는데 notices 폴더에 파일이 없어요")
    for f in files:
        if f.stem not in answers:
            problems.append(f"{f.name}: 파일은 있는데 정답지에 이 공지ID가 없어요 (채점에서 제외)")

    print(f"정답지: 공지 {len(answers)}건, 정답 {sum(len(v) for v in answers.values())}줄 · 공지 파일 {len(files)}개")
    for msg in problems:
        print("  [!]", msg)
    if args.check:
        print("형식 점검 끝." if not problems else "위 문제를 고친 뒤 다시 점검하세요.")
        return 1 if problems else 0
    all_rows: list[Row] = []
    by_type: dict[str, dict[str, list[tuple]]] = defaultdict(lambda: defaultdict(list))
    failures: dict[str, list[str]] = defaultdict(list)
    out_dir = HERE / "results" / datetime.now().strftime("%Y%m%d_%H%M%S")
    (out_dir / "raw").mkdir(parents=True, exist_ok=True)

    if args.regrade:
        from app.schemas import AnalysisResult

        src = Path(args.regrade)
        if not src.is_absolute() and not src.exists():
            src = HERE / "results" / args.regrade
        raws = sorted((src / "raw").glob("*.json"))
        if not raws:
            print(f"{src / 'raw'} 에 앱 답(raw) 파일이 없어요. 이 기능이 생긴 뒤에 채점한 결과만 다시 채점할 수 있어요.")
            return 1
        runs_seen: dict[str, set[int]] = defaultdict(set)
        for rp in raws:
            stem, itype, run = rp.stem.rsplit("__", 2)
            if stem not in answers or (only and stem not in only):
                continue
            analysis = AnalysisResult.model_validate_json(rp.read_text(encoding="utf-8"))
            if args.reverify:
                analysis = _reverify(analysis, notice_dir / f"{stem}.{itype}")
            rows = grade_one(itype, stem, int(run), answers[stem], analysis)
            all_rows += rows
            by_type[itype][stem].append(signature(rows))
            runs_seen[itype].add(int(run))
            (out_dir / "raw" / rp.name).write_text(rp.read_text(encoding="utf-8"), encoding="utf-8")
        engine = (f"재검증 ({src.name}의 AI 답 + 지금 검증 코드)" if args.reverify
                  else f"재채점 ({src.name}의 앱 답 사용)")
        runs = max((max(v) for v in runs_seen.values()), default=1)
        print(f"{engine}: 앱 답 {len(raws)}개\n")
        return _report(out_dir, all_rows, by_type, failures, runs, engine)

    files = [f for f in files if f.stem in answers]
    if not files:
        print("채점할 공지가 없어요.")
        return 1

    from app.agents import intake
    from app.llm import get_llm
    from app.services import pipeline

    llm = get_llm()
    print(f"분석 엔진: {llm.name} · {args.runs}회씩\n")

    total = len(files) * args.runs
    done = 0
    for f in files:
        itype = f.suffix.lower().lstrip(".")
        for run in range(1, args.runs + 1):
            done += 1
            print(f"[{done}/{total}] {f.name} {run}회차 … ", end="", flush=True)
            try:
                if itype in ("txt", "md"):
                    source = intake.from_text(f.read_bytes().decode("utf-8-sig"))
                else:
                    source = intake.from_upload(f.read_bytes(), MIME[f.suffix.lower()], f.name, llm)
                analysis = pipeline.analyze(source, llm)
                (out_dir / "raw" / f"{f.stem}__{itype}__{run}.json").write_text(
                    analysis.model_dump_json(), encoding="utf-8")   # 나중에 Gemini 없이 다시 채점할 때 씀
                rows = grade_one(itype, f.stem, run, answers[f.stem], analysis)
                all_rows += rows
                by_type[itype][f.stem].append(signature(rows))
                print(f"정답 {sum(r.grade == '정답' for r in rows)} · 오답 {sum(r.grade == '오답' for r in rows)} · "
                      f"누락 {sum(r.grade == '누락' for r in rows)}")
            except Exception as e:  # 한 건 실패해도 나머지는 계속
                failures[itype].append(f"{f.stem}#{run}")
                all_rows.append(Row(itype, f.stem, run, "-", "", "", None, "", "실패", str(e)[:200]))
                print(f"실패: {e}")
            if args.sleep and llm.name != "mock" and done < total:
                time.sleep(args.sleep)

    return _report(out_dir, all_rows, by_type, failures, args.runs, llm.name)


def _reverify(analysis, notice_path: Path):
    """저장된 AI 답(값·근거 문장·AI 확신도)은 그대로 두고, 근거 검증만 지금 코드로 다시 돌린다.
    검증 코드(agents/verification.py)를 고친 효과를 Gemini 없이 정확히 비교할 때 쓴다."""
    from zoneinfo import ZoneInfo

    from app.agents import intake
    from app.agents.verification import Verifier
    from app.config import get_settings
    from app.schemas import LLMExtraction, LLMField
    from app.utils.text import split_sentences

    if notice_path.suffix.lower() != ".txt":
        raise SystemExit("--reverify 는 txt 공지만 지원해요 (사진·PDF는 글자 읽기에 Gemini가 필요)")
    settings = get_settings()
    source = intake.from_text(notice_path.read_bytes().decode("utf-8-sig"))
    sentences = split_sentences(source)
    extraction = LLMExtraction(
        title=analysis.title, doc_category=analysis.doc_category, doc_subtype=analysis.doc_subtype,
        fields=[LLMField(key=f.key, label=f.label, value=f.value, normalized_datetime=f.normalized_datetime,
                         evidence_quote=f.evidence.quote, page=f.evidence.page, confidence=f.llm_confidence)
                for f in analysis.fields])
    verifier = Verifier(source, sentences, settings.review_threshold, datetime.now(ZoneInfo(settings.timezone)))
    return verifier.verify(extraction, document_id=analysis.document_id, provider=analysis.llm_provider)


# 문서 종류 (교수님 자문: 자주 쓰는 학교 공지 몇 종으로 범위 제한). 공지 번호 구간 = 담당자별 수집 범위
DOC_TYPES = [("국제·학사", 1, 15), ("장학", 16, 30), ("SW중심대학사업단", 31, 45), ("소프트웨어학과", 46, 60)]


def doc_type(notice: str) -> str:
    try:
        n = int("".join(ch for ch in notice if ch.isdigit()))
    except ValueError:
        return "기타"
    return next((name for name, lo, hi in DOC_TYPES if lo <= n <= hi), "기타")


def by_doc_type(rows: list[Row]) -> str:
    """문서 종류별 정확도·재현율·오류 탐지율"""
    out = ["[문서 종류별]  공지 수 · 정확도 · 재현율 · 오류 탐지율"]
    for name, _, _ in DOC_TYPES + [("기타", 0, 0)]:
        part = [r for r in rows if doc_type(r.notice) == name]
        if not part:
            continue
        app = [r for r in part if r.is_app and r.grade in ("정답", "오답")]
        ans = [r for r in part if r.is_answer and r.grade in ("정답", "누락")]
        wrong = [r for r in app if r.grade == "오답"]
        caught = [r for r in wrong if r.status != "verified"]
        notices = len({r.notice for r in part})
        out.append(f"  {name:<12} {notices:>2}건 · {pct(sum(r.grade == '정답' for r in app), len(app))}"
                   f" · {pct(sum(r.grade == '정답' for r in ans), len(ans))} · {pct(len(caught), len(wrong))}")
    return "\n".join(out)


def _report(out_dir: Path, all_rows: list[Row], by_type, failures, runs: int, engine: str) -> int:
    with open(out_dir / "items.csv", "w", newline="", encoding="utf-8-sig") as fp:
        w = csv.writer(fp)
        w.writerow(["입력형식", "공지ID", "회차", "항목", "정답", "앱 값", "신뢰도", "앱 판정", "채점", "비고", "근거 문장"])
        for r in all_rows:
            w.writerow([r.input_type, r.notice, r.run, r.label, r.answer, r.app_value,
                        "" if r.confidence is None else r.confidence, r.status, r.grade, r.note, r.evidence])

    report = [f"ActionDoc 채점 결과 · {datetime.now():%Y-%m-%d %H:%M} · 엔진 {engine}", ""]
    for itype in sorted(by_type):
        rows = [r for r in all_rows if r.input_type == itype and r.grade != "실패"]
        report.append(f"===== 입력 형식: {itype} =====")
        report.append(summarize(rows, by_type[itype], runs, failures.get(itype, [])))
        report.append("")
        report.append(by_doc_type(rows))
        report.append("")
    text = "\n".join(report)
    (out_dir / "summary.txt").write_text(text, encoding="utf-8")
    print("\n" + text)
    print(f"저장: {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
