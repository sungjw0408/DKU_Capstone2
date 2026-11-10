"""신뢰도 분석용 표 만들기: 앱이 낸 정보 하나당 한 줄.

저장된 앱 답(results/<폴더>/raw)과 정답지로, 정보마다
  맞음(1)/틀림(0), 근거 일치도, 값 검사 점수, AI 자기 확신도, 최종 신뢰도
를 한 표(features.csv)로 뽑는다. Gemini는 부르지 않는다.

    python -m eval.features 20261014_110253              # 저장된 검증 결과 그대로
    python -m eval.features 20261014_110253 --reverify   # 지금 검증 코드로 다시 검증해서
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)
os.environ["STORAGE_BACKEND"] = "memory"

from eval.evaluate import _reverify, grade_one, load_answers  # noqa: E402

COLUMNS = ["공지ID", "회차", "항목", "앱 값", "맞음", "근거일치도", "값검사", "AI확신도",
           "심각한실패", "근거못찾음", "최종신뢰도", "앱 판정", "비고"]


def features_of(field) -> dict:
    """앱 항목 하나에서 신뢰도 재료를 꺼낸다."""
    value_checks = [c for c in field.checks if c.name != "evidence_found"]
    val = sum(c.score for c in value_checks) / len(value_checks) if value_checks else 0.0
    return {
        "근거일치도": round(field.evidence.match_score, 4),
        "값검사": round(val, 4),
        "AI확신도": round(field.llm_confidence, 4),
        "심각한실패": int(any(not c.passed and c.score <= 0.3 for c in value_checks)),
        "근거못찾음": int(field.status == "unverified"),
        "최종신뢰도": field.confidence,
        "앱 판정": field.status,
    }


def main() -> int:
    from app.schemas import AnalysisResult

    p = argparse.ArgumentParser(description="신뢰도 분석용 표 만들기")
    p.add_argument("folder", help="results 안의 결과 폴더 이름 (raw 폴더가 있어야 함)")
    p.add_argument("--reverify", action="store_true", help="지금 검증 코드로 다시 검증")
    p.add_argument("--key", default=str(HERE / "answer_key.xlsx"))
    p.add_argument("--notices", default=str(HERE / "notices"))
    args = p.parse_args()

    src = Path(args.folder)
    if not src.exists():
        src = HERE / "results" / args.folder
    raws = sorted((src / "raw").glob("*.json"))
    if not raws:
        print(f"{src / 'raw'} 에 앱 답이 없어요.")
        return 1
    answers, problems = load_answers(Path(args.key))
    for pr in problems:
        print("  [!]", pr)

    out_rows = []
    for rp in raws:
        stem, itype, run = rp.stem.rsplit("__", 2)
        if stem not in answers:
            continue
        analysis = AnalysisResult.model_validate_json(rp.read_text(encoding="utf-8"))
        if args.reverify:
            analysis = _reverify(analysis, Path(args.notices) / f"{stem}.{itype}")
        by_id = {f.id: f for f in analysis.fields}
        for r in grade_one(itype, stem, int(run), answers[stem], analysis):
            if not r.is_app or r.grade not in ("정답", "오답") or r.fid not in by_id:
                continue
            row = {"공지ID": stem, "회차": run, "항목": r.label, "앱 값": r.app_value,
                   "맞음": int(r.grade == "정답"), "비고": r.note}
            row.update(features_of(by_id[r.fid]))
            out_rows.append(row)

    name = "features_reverify.csv" if args.reverify else "features.csv"
    out = src / name
    with open(out, "w", newline="", encoding="utf-8-sig") as fp:
        w = csv.DictWriter(fp, fieldnames=COLUMNS)
        w.writeheader()
        w.writerows(out_rows)
    n = len(out_rows)
    wrong = sum(1 for r in out_rows if r["맞음"] == 0)
    print(f"정보 {n}개 (맞음 {n - wrong} · 틀림 {wrong}) → {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
