"""AI 자기 확신도 검토 + 로지스틱 회귀 (교수님 자문: AI 확신도가 타당한지, 가중치를 어떻게 정할지).

features.py 로 만든 표(features_reverify.csv 또는 features.csv)를 읽어서
  ① AI 확신도 분포 (맞은 정보 / 틀린 정보)
  ② 점수별 구분 능력 (AUC: 맞는 정보와 틀린 정보를 하나씩 골랐을 때 맞는 쪽 점수가 더 높을 확률)
  ③ 로지스틱 회귀 3가지 비교 (공지 단위로 나눠서 시험)
를 계산한다. Gemini는 부르지 않는다.

    python -m eval.logistic 20261014_110253
    python -m eval.logistic 20261014_110253 20261021_165534 20261021_194556   # 여러 폴더 합쳐서

먼저 각 폴더에서 표를 만들어 둔다:  python -m eval.features <폴더> --reverify
필요한 패키지: pip install scikit-learn
"""
from __future__ import annotations

import argparse
import csv
import sys
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent

MODELS = {
    "① AI 확신도만": ["AI확신도"],
    "② 값 검사만": ["값검사", "심각한실패"],
    "③ 값 검사 + AI 확신도": ["값검사", "심각한실패", "AI확신도"],
}


def load(folders: list[str]) -> list[dict]:
    rows = []
    for name in folders:
        src = Path(name) if Path(name).exists() else HERE / "results" / name
        table = next((src / f for f in ("features_reverify.csv", "features.csv") if (src / f).exists()), None)
        if table is None:
            raise SystemExit(f"{src} 에 표가 없어요. 먼저: python -m eval.features {name} --reverify")
        with open(table, encoding="utf-8-sig") as fp:
            for r in csv.DictReader(fp):
                r["폴더"] = src.name
                for k in ("맞음", "심각한실패", "근거못찾음"):
                    r[k] = int(r[k])
                for k in ("근거일치도", "값검사", "AI확신도"):
                    r[k] = float(r[k])
                r["최종신뢰도"] = float(r["최종신뢰도"]) / 100
                rows.append(r)
    return rows


def main() -> int:
    try:
        import numpy as np
        from sklearn.linear_model import LogisticRegression
        from sklearn.metrics import roc_auc_score
        from sklearn.model_selection import GroupKFold
    except ImportError:
        print("scikit-learn 이 필요해요:  pip install scikit-learn")
        return 1

    p = argparse.ArgumentParser(description="AI 자기 확신도 검토 + 로지스틱 회귀")
    p.add_argument("folders", nargs="+", help="results 안의 결과 폴더 이름 (여러 개면 합쳐서 분석)")
    args = p.parse_args()

    rows = load(args.folders)
    y = np.array([r["맞음"] for r in rows])
    groups = np.array([r["공지ID"] for r in rows])  # 같은 공지는 학습·시험에 섞이지 않게
    ok, ng = [r for r in rows if r["맞음"] == 1], [r for r in rows if r["맞음"] == 0]
    out = [f"AI 자기 확신도 검토 · {datetime.now():%Y-%m-%d %H:%M}",
           f"폴더: {', '.join(args.folders)}",
           f"정보 {len(rows)}개 (맞음 {len(ok)} · 틀림 {len(ng)}) · 공지 {len(set(groups))}개", ""]
    if len(ng) < 10:
        out.append("⚠️ 틀린 정보가 10개 미만이라 결과를 믿기 어려워요. 폴더를 더 합쳐 보세요.\n")

    # ① AI 확신도 분포
    one_ok = sum(r["AI확신도"] == 1.0 for r in ok)
    one_ng = sum(r["AI확신도"] == 1.0 for r in ng)
    out += ["[① AI 자기 확신도 분포]",
            f"  맞은 정보 중 확신도 1.0   {one_ok}/{len(ok)} ({one_ok / max(len(ok), 1):.1%})",
            f"  틀린 정보 중 확신도 1.0   {one_ng}/{len(ng)} ({one_ng / max(len(ng), 1):.1%})",
            f"  가장 낮은 확신도          {min(r['AI확신도'] for r in rows)}",
            f"  확신도 0.8 미만인 틀린 정보 {sum(r['AI확신도'] < 0.8 for r in ng)}/{len(ng)}  (= AI 확신도만 쓸 때 오류 탐지)", ""]

    # ② 점수별 구분 능력
    out.append("[② 점수별 구분 능력 (AUC · 0.5 = 동전 던지기, 1.0 = 완벽)]")
    for label, col in [("AI 자기 확신도", "AI확신도"), ("근거 일치도", "근거일치도"),
                       ("값 검사", "값검사"), ("최종 신뢰도 (지금 공식)", "최종신뢰도")]:
        vals = np.array([r[col] for r in rows])
        auc = roc_auc_score(y, vals) if len(set(vals)) > 1 else 0.5
        note = "  (모든 값이 같아서 구분 불가)" if len(set(vals)) == 1 else ""
        out.append(f"  {label:<22}{auc:.2f}{note}")
    out.append("")

    # ③ 로지스틱 회귀: 공지 단위로 나눠서 학습·시험
    cur = np.array([r["최종신뢰도"] for r in rows])
    k = int((cur < 0.8).sum())  # 지금 공식이 '확인 필요'로 보낸 개수와 똑같이 맞춰서 비교
    n_splits = min(5, len(set(groups)))
    out.append(f"[③ 로지스틱 회귀 · 공지 단위 {n_splits}겹 교차검증]")
    out.append(f"  비교 방법: 지금 공식처럼 {k}개를 '확인 필요'로 보낼 때 틀린 정보 {len(ng)}개 중 몇 개를 잡나")
    for name, cols in MODELS.items():
        X = np.array([[r[c] for c in cols] for r in rows])
        prob = np.zeros(len(y))
        for tr, te in GroupKFold(n_splits=n_splits).split(X, y, groups):
            m = LogisticRegression(C=1.0, max_iter=1000).fit(X[tr], y[tr])
            prob[te] = m.predict_proba(X[te])[:, 1]
        flag = prob <= np.sort(prob)[k - 1] if k else np.zeros(len(y), bool)
        full = LogisticRegression(C=1.0, max_iter=1000).fit(X, y)
        coef = ", ".join(f"{c} {w:+.2f}" for c, w in zip(cols, full.coef_[0]))
        out.append(f"  {name:<18} 잡은 오류 {int((flag & (y == 0)).sum()):>3}/{len(ng)} · "
                   f"맞는 정보 의심 {int((flag & (y == 1)).sum()):>3}/{len(ok)} · AUC {roc_auc_score(y, prob):.2f} · 계수: {coef}")
    out.append(f"  {'지금 공식':<18} 잡은 오류 {int(((cur < 0.8) & (y == 0)).sum()):>3}/{len(ng)} · "
               f"맞는 정보 의심 {int(((cur < 0.8) & (y == 1)).sum()):>3}/{len(ok)}")
    out += ["", "읽는 법: ③이 ②보다 많이 잡지 못하면 AI 확신도는 더해도 도움이 안 된다는 뜻.",
            "        계수가 클수록 그 점수가 맞고 틀림을 가르는 데 중요하다는 뜻 (심각한실패는 음수 = 실패하면 틀릴 가능성↑)."]

    text = "\n".join(out)
    print(text)
    dest = (Path(args.folders[0]) if Path(args.folders[0]).exists() else HERE / "results" / args.folders[0])
    (dest / "logistic_report.txt").write_text(text, encoding="utf-8")
    print(f"\n저장: {dest / 'logistic_report.txt'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
