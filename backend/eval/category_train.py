"""공지 분류기: 후보 생성 → 검수 → 학습 → 비교. Gemini 호출 없음."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent

LABELS = (
    "applicant_criteria",
    "applicant_exclusion",
    "required_document",
    "submission_method",
    "selection_criteria",
    "other",
)

COLUMNS = [
    "id", "notice", "text", "evidence",
    "label", "reviewed", "origin",
]

FIELD_LABELS = {
    "applicant_criteria",
    "required_document",
    "submission_method",
}


def norm(text):
    return re.sub(r"\s+", "", text).lower()


def features(row):
    # 정답 label이나 기존 항목 key는 모델 입력에 넣지 않는다.
    return "값: " + row["text"] + "\n근거: " + row["evidence"]


def read_csv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path, rows, columns=COLUMNS):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def raw_folder(name):
    path = Path(name)
    return path if path.exists() else HERE / "results" / name


def prepare(args):
    from app.schemas import AnalysisResult
    from eval.evaluate import load_answers, grade_one

    answers, problems = load_answers(Path(args.key))
    if problems:
        raise SystemExit("\n".join(problems))

    rows, seen = [], set()

    def add(notice, text, evidence, label, origin):
        if not text.strip() or len(text.strip()) < 2:
            return

        sig = (notice, norm(text), norm(evidence), label)
        if sig in seen:
            return

        seen.add(sig)
        digest = hashlib.sha256(
            json.dumps(sig, ensure_ascii=False).encode()
        ).hexdigest()[:16]

        rows.append(dict(
            id=digest,
            notice=notice,
            text=text,
            evidence=evidence,
            label=label,
            reviewed="0",
            origin=origin,
        ))

    # 사람이 작성한 정답지와 매칭되는 추출값에서 후보 생성.
    for folder in args.folders:
        paths = sorted(
            (raw_folder(folder) / "raw").glob("*__txt__*.json")
        )
        if not paths:
            raise SystemExit(f"{folder}: raw 파일이 없습니다")

        for path in paths:
            nid, kind, run = path.stem.rsplit("__", 2)

            if int(re.search(r"\d+", nid)[0]) % 2 == 0:
                continue

            analysis = AnalysisResult.model_validate_json(
                path.read_text(encoding="utf-8-sig")
            )
            fields = {f.id: f for f in analysis.fields}

            for row in grade_one(
                kind, nid, int(run), answers[nid], analysis
            ):
                if (
                    not row.is_app
                    or row.grade != "정답"
                    or row.fid not in fields
                ):
                    continue

                field = fields[row.fid]
                if field.key.value in FIELD_LABELS:
                    add(
                        nid,
                        field.value,
                        field.evidence.matched_text
                        or field.evidence.quote,
                        field.key.value,
                        "정답지 자동 매칭 후보",
                    )

    # 혼동하기 쉬운 제외 대상·선발 기준·기타 후보 생성.
    # 자동으로 붙인 라벨이므로 검수 전에는 확정 정답이 아니다.
    for path in sorted(Path(args.notices).glob("*.txt")):
        if int(re.search(r"\d+", path.stem)[0]) % 2 == 0:
            continue

        for line in path.read_text(
            encoding="utf-8-sig"
        ).splitlines():
            line = line.strip()
            if len(line) < 8:
                continue

            label = None

            if re.search(
                r"(?:선발|심사)\s*기준\s*[:：]"
                r"|합산하여\s*선발|동점자.*우선",
                line,
            ):
                label = "selection_criteria"

            elif (
                re.search(r"불가|제외", line)
                and re.search(
                    r"휴학생|졸업생|편입생|선발제외대상|대상자",
                    line,
                )
                and not re.search(
                    r"가능|(?:모집|참여|지원)\s*대상"
                    r"|지원자격|공모자격|교과목",
                    line,
                )
            ):
                label = "applicant_exclusion"

            elif re.search(
                r"줄간격|포인트.*양식"
                r"|참신한 아이디어와 열정"
                r"|지급\s*금액|장학금\s*지급"
                r"|할인\s*혜택|문의\s*:",
                line,
            ):
                label = "other"

            if label:
                if label == "other" and re.search(
                    r"신청.*가능|지원.*가능|응시.*가능",
                    line,
                ):
                    continue

                add(
                    path.stem, line, line, label,
                    "규칙으로 만든 후보: 분류 검수 필요",
                )

            # 긍정 자격 문장 안의 괄호형 제외 조건을 별도로 수집.
            for match in re.finditer(
                r"\(([^()]+(?:지원\s*불가|참여\s*불가|제외))\)",
                line,
            ):
                phrase = match.group(1)
                if re.search(r"학생|휴학생|졸업|편입", phrase):
                    add(
                        path.stem,
                        phrase,
                        line,
                        "applicant_exclusion",
                        "괄호의 제외 조건 후보: 분류 검수 필요",
                    )

    labels_of = defaultdict(set)
    for row in rows:
        labels_of[
            (row["notice"], norm(features(row)))
        ].add(row["label"])

    rows = [
        r for r in rows
        if len(labels_of[
            (r["notice"], norm(features(r)))
        ]) == 1
    ]

    write_csv(args.output, rows)

    print("후보 수:", len(rows))
    print("분류별:", dict(Counter(r["label"] for r in rows)))
    print("파일:", args.output)
    print("label을 검수하고 reviewed를 1로 바꾸세요.")
    print("자동 후보는 사람이 확정한 정답이 아닙니다.")


def make_model():
    import numpy as np

    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import FunctionTransformer
    from sklearn.compose import ColumnTransformer
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression

    return Pipeline([
        (
            "split",
            FunctionTransformer(
                np.char.partition,
                kw_args={"sep": "\n근거:"},
            ),
        ),
        (
            "features",
            ColumnTransformer(
                [
                    (
                        "value",
                        TfidfVectorizer(
                            analyzer="char",
                            ngram_range=(2, 5),
                            sublinear_tf=True,
                        ),
                        0,
                    ),
                    (
                        "evidence",
                        TfidfVectorizer(
                            analyzer="char",
                            ngram_range=(2, 5),
                            sublinear_tf=True,
                        ),
                        2,
                    ),
                ],
                transformer_weights={
                    "value": 2.0,
                    "evidence": 1.0,
                },
            ),
        ),
        (
            "classifier",
            LogisticRegression(
                C=2.0,
                class_weight="balanced",
                max_iter=2000,
                random_state=42,
            ),
        ),
    ])


def train(args):
    import joblib
    import numpy as np
    from sklearn.metrics import (
        classification_report,
        confusion_matrix,
    )
    from sklearn.model_selection import GroupKFold

    rows = read_csv(args.data)
    rows = [
        r for r in rows
        if args.draft or r["reviewed"].strip() == "1"
    ]

    if not rows:
        raise SystemExit(
            "검수된 자료가 없습니다. reviewed=1로 검수하거나 "
            "--draft로 후보 시험 학습하세요."
        )

    if any(
        int(re.search(r"\d+", r["notice"])[0]) % 2 == 0
        for r in rows
    ):
        raise SystemExit("짝수 자료가 포함되어 학습을 중단합니다.")

    if any(r["label"] not in LABELS for r in rows):
        raise SystemExit("알 수 없는 label이 있습니다.")

    labels_of = defaultdict(set)
    for row in rows:
        labels_of[
            (row["notice"], norm(features(row)))
        ].add(row["label"])

    if any(len(v) > 1 for v in labels_of.values()):
        raise SystemExit(
            "같은 입력의 라벨이 서로 다릅니다. "
            "충돌 라벨부터 검수하세요."
        )

    rows = list({
        (r["notice"], norm(features(r))): r
        for r in rows
    }.values())

    x = np.array([features(r) for r in rows])
    y = np.array([r["label"] for r in rows])
    groups = np.array([r["notice"] for r in rows])

    if len(set(y)) < 2 or len(set(groups)) < 3:
        raise SystemExit(
            "적어도 2개 분류와 3개 공지의 자료가 필요합니다."
        )

    splits = list(
        GroupKFold(
            n_splits=min(5, len(set(groups)))
        ).split(x, y, groups)
    )

    if any(set(y[tr]) != set(y) for tr, te in splits):
        raise SystemExit(
            "일부 분류가 특정 공지에만 있어 교차검증할 수 없습니다. "
            "해당 분류의 공지를 더 모으세요."
        )

    pred = np.empty(len(y), dtype=object)

    for tr, te in splits:
        model = make_model()
        # 어휘 사전도 해당 학습 공지만으로 구성한다.
        model.fit(x[tr], y[tr])
        pred[te] = model.predict(x[te])

    report = classification_report(
        y, pred,
        labels=list(LABELS),
        zero_division=0,
        output_dict=True,
    )

    model = make_model()
    model.fit(x, y)

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=False)
    joblib.dump(model, out / "model.joblib")

    metadata = dict(
        draft=args.draft,
        samples=len(rows),
        notices=len(set(groups)),
        class_counts=dict(Counter(y)),
        labels=LABELS,
        source_sha256=hashlib.sha256(
            Path(args.data).read_bytes()
        ).hexdigest(),
        classification_report=report,
        confusion_matrix=confusion_matrix(
            y, pred, labels=list(LABELS)
        ).tolist(),
    )

    (out / "report.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    write_csv(
        out / "validation.csv",
        [
            dict(r, prediction=p, correct=int(a == p))
            for r, a, p in zip(rows, y, pred)
        ],
        COLUMNS + ["prediction", "correct"],
    )

    print("모델:", out / "model.joblib")
    print(
        "공지 단위 교차검증:",
        "정확도", round(report["accuracy"], 3),
        "macro-F1", round(report["macro avg"]["f1-score"], 3),
    )
    print(
        "문장 분류 성능이며 앱의 오류 탐지율과는 다른 지표입니다."
    )

    if args.draft:
        print(
            "자동 후보를 이용한 시험 결과입니다. "
            "사람이 검수한 최종 성능으로 보고하지 마세요."
        )


def compare(args):
    import joblib
    from app.schemas import AnalysisResult, Check
    from eval.evaluate import (
        load_answers, grade_one, signature, _report,
    )

    if not 0 <= args.threshold <= 1:
        raise SystemExit("threshold는 0과 1 사이여야 합니다.")

    model = joblib.load(Path(args.model) / "model.joblib")

    answers, problems = load_answers(Path(args.key))
    if problems:
        raise SystemExit("\n".join(problems))

    paths = sorted(
        (raw_folder(args.folder) / "raw").glob("*__txt__*.json")
    )
    if not paths:
        raise SystemExit("raw 파일이 없습니다")

    metadata = json.loads(
        (Path(args.model) / "report.json").read_text(
            encoding="utf-8"
        )
    )

    if metadata["draft"] and not args.allow_draft:
        raise SystemExit(
            "시험 모델입니다. 검수 후 재학습하거나 "
            "--allow-draft로 탐색 비교하세요."
        )

    if any(
        int(re.search(
            r"\d+", p.stem.rsplit("__", 2)[0]
        )[0]) % 2 == 1
        for p in paths
    ):
        print(
            "홀수 자료는 학습과 겹칩니다. "
            "아래 앱 지표를 독립적인 최종 평가로 보고하지 마세요."
        )

    if any(
        p.stem.rsplit("__", 2)[0] not in answers
        for p in paths
    ):
        raise SystemExit("일부 공지의 정답지가 없습니다.")

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=False)

    allrows = {"baseline": [], "trained": []}
    sigs = {
        k: defaultdict(lambda: defaultdict(list))
        for k in allrows
    }
    decisions, runs = [], 1

    for name in allrows:
        (out / name / "raw").mkdir(parents=True)

    for path in paths:
        nid, kind, run = path.stem.rsplit("__", 2)
        run = int(run)
        runs = max(runs, run)

        original = AnalysisResult.model_validate_json(
            path.read_text(encoding="utf-8-sig")
        )
        changed = original.model_copy(deep=True)

        for field in changed.fields:
            if (
                field.status != "verified"
                or field.key.value not in FIELD_LABELS
            ):
                continue

            text = features(dict(
                text=field.value,
                evidence=(
                    field.evidence.matched_text
                    or field.evidence.quote
                ),
            ))

            probabilities = model.predict_proba([text])[0]
            best = int(probabilities.argmax())
            predicted = model.classes_[best]
            score = float(probabilities[best])

            flag = (
                predicted != field.key.value
                and score >= args.threshold
            )

            decisions.append(dict(
                notice=nid,
                run=run,
                field_id=field.id,
                value=field.value,
                original_key=field.key.value,
                predicted=predicted,
                model_score=round(score, 4),
                flagged=int(flag),
            ))

            if flag:
                field.status = "needs_review"
                field.confidence = min(field.confidence, 60)
                field.checks.append(Check(
                    name="trained_category",
                    passed=False,
                    score=0,
                    detail=(
                        f"학습 분류기는 {predicted}로 분류했습니다. "
                        "기존 항목을 확인해 주세요."
                    ),
                ))

        changed.needs_review = any(
            f.status in ("needs_review", "unverified")
            for f in changed.fields
        )

        for name, analysis in [
            ("baseline", original),
            ("trained", changed),
        ]:
            rows = grade_one(
                kind, nid, run, answers[nid], analysis
            )
            allrows[name].extend(rows)
            sigs[name][kind][nid].append(signature(rows))

            (out / name / "raw" / path.name).write_text(
                analysis.model_dump_json(indent=2),
                encoding="utf-8",
            )

    for name in allrows:
        _report(
            out / name,
            allrows[name],
            sigs[name],
            {},
            runs,
            name,
        )

    (out / "experiment.json").write_text(
        json.dumps(
            dict(
                model=str(Path(args.model).resolve()),
                model_source_sha256=metadata["source_sha256"],
                threshold=args.threshold,
                draft=metadata["draft"],
                input_folder=str(
                    raw_folder(args.folder).resolve()
                ),
            ),
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    if decisions:
        write_csv(
            out / "decisions.csv",
            decisions,
            list(decisions[0]),
        )

    print("비교 결과:", out)
    print("모델 점수는 보정된 정답 확률이 아닙니다.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("prepare")
    p.add_argument("folders", nargs="+")
    p.add_argument(
        "--key", default=str(HERE / "answer_key.xlsx")
    )
    p.add_argument("--notices", default=str(HERE / "notices"))
    p.add_argument(
        "--output", default=str(HERE / "category_candidates.csv")
    )
    p.set_defaults(func=prepare)

    p = sub.add_parser("train")
    p.add_argument(
        "--data", default=str(HERE / "category_candidates.csv")
    )
    p.add_argument("--draft", action="store_true")
    p.add_argument(
        "--output",
        default=str(
            HERE / "models"
            / datetime.now().strftime(
                "category_%Y%m%d_%H%M%S_%f"
            )
        ),
    )
    p.set_defaults(func=train)

    p = sub.add_parser("compare")
    p.add_argument("folder")
    p.add_argument("--model", required=True)
    p.add_argument(
        "--key", default=str(HERE / "answer_key.xlsx")
    )
    p.add_argument("--threshold", type=float, default=0.8)
    p.add_argument("--allow-draft", action="store_true")
    p.add_argument(
        "--output",
        default=str(
            HERE / "results"
            / datetime.now().strftime(
                "trained_%Y%m%d_%H%M%S_%f"
            )
        ),
    )
    p.set_defaults(func=compare)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()