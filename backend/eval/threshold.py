"""확인 필요 기준선 조정 (5회차): 기준선을 바꿔가며 오류를 몇 개 잡고 맞는 정보를 몇 개 의심하는지 본다.

features.py 로 만든 표의 '최종신뢰도'(지금 검증 코드로 계산한 점수)를 쓴다. Gemini는 부르지 않는다.

    python -m eval.features 20261014_110253 --reverify     # 먼저 지금 코드로 표를 다시 만들기
    python -m eval.threshold 20261014_110253
    python -m eval.threshold 20261014_110253 20261021_165534 20261021_194556   # 여러 폴더 합쳐서
"""
from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
THRESHOLDS = [61, 65, 70, 75, 80, 85, 90, 95, 98, 100]
BUCKETS = [("60점 이하", 0, 60), ("61~79점", 61, 79), ("80~89점", 80, 89), ("90~99점", 90, 99), ("100점", 100, 100)]


def load(folders: list[str]) -> list[tuple[int, int]]:
    out = []
    for name in folders:
        src = Path(name) if Path(name).exists() else HERE / "results" / name
        table = next((src / f for f in ("features_reverify.csv", "features.csv") if (src / f).exists()), None)
        if table is None:
            raise SystemExit(f"{src} 에 표가 없어요. 먼저: python -m eval.features {name} --reverify")
        with open(table, encoding="utf-8-sig") as fp:
            out += [(int(round(float(r["최종신뢰도"]))), int(r["맞음"])) for r in csv.DictReader(fp)]
    return out


def main() -> int:
    p = argparse.ArgumentParser(description="확인 필요 기준선 조정")
    p.add_argument("folders", nargs="+")
    args = p.parse_args()
    rows = load(args.folders)
    ok = [s for s, y in rows if y == 1]
    ng = [s for s, y in rows if y == 0]

    def bucket(scores):
        c = Counter(next(n for n, lo, hi in BUCKETS if lo <= s <= hi) for s in scores)
        return " · ".join(f"{n} {c.get(n, 0)}개" for n, _, _ in BUCKETS)

    out = [f"확인 필요 기준선 조정 · {datetime.now():%Y-%m-%d %H:%M}",
           f"폴더: {', '.join(args.folders)}",
           f"정보 {len(rows)}개 (맞음 {len(ok)} · 틀림 {len(ng)})", "",
           "[신뢰도 점수 분포]",
           f"  전체       {bucket([s for s, _ in rows])}",
           f"  틀린 정보  {bucket(ng)}", "",
           "[기준선별] 이 점수 미만이면 '확인 필요'",
           "  기준선 · 잡은 오류 · 괜히 의심한 맞는 정보 · '확인됨' 중 실제 정답 · '확인 필요' 개수"]
    for th in THRESHOLDS:
        caught = sum(s < th for s in ng)
        false_alarm = sum(s < th for s in ok)
        verified = [y for s, y in rows if s >= th]
        prec = f"{sum(verified) / len(verified):.1%}" if verified else "-"
        mark = "  ← 지금" if th == 80 else ""
        out.append(f"  {th:>4}   {caught:>3}/{len(ng)}   {false_alarm:>4}/{len(ok)}   {prec:>7}   {caught + false_alarm:>4}개{mark}")
    out += ["", "읽는 법: 기준선을 올리면 오류를 더 잡지만 맞는 정보도 더 의심한다.",
            "        잡은 오류는 그대로인데 의심만 늘어나는 구간이면 기준선을 올릴 이유가 없다."]
    text = "\n".join(out)
    print(text)
    dest = Path(args.folders[0]) if Path(args.folders[0]).exists() else HERE / "results" / args.folders[0]
    name = "threshold_report.txt" if len(args.folders) == 1 else "threshold_report_합침.txt"
    (dest / name).write_text(text, encoding="utf-8")
    print(f"\n저장: {dest / name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
