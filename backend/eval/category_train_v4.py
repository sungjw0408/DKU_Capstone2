"""v3에 작성한 대조 학습 자료와 근거 문장 선택을 추가한다."""
import json
import sys
from pathlib import Path

from openpyxl import Workbook
from sklearn.pipeline import Pipeline

from app.agents.category_contrasts import (
    ContrastClassifier,
    FocusContext,
    examples,
)
from eval import category_train as base
from eval.category_train_v3 import make_model as make_v3


def make_model():
    return ContrastClassifier(
        Pipeline([
            ("focus", FocusContext()),
            ("model", make_v3()),
        ]),
        use_authored=True,
    )


_original_train = base.train


def train(args):
    import joblib

    _original_train(args)

    output = Path(args.output)
    model = joblib.load(output / "model.joblib")
    path = output / "report.json"
    report = json.loads(path.read_text(encoding="utf-8"))

    report["reviewed_rows"] = model.reviewed_rows_
    report["authored_rows"] = model.authored_rows_
    report["authored_sha256"] = model.authored_sha256_
    report["authored_note"] = (
        "작성 예시는 학습에만 사용. 사용자 검수 정답 아님. "
        "기존 짝수 오류 분석 후 설계한 개발 자료."
    )

    path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(
        "검수 자료:", model.reviewed_rows_,
        "/ 작성 보강 예시:", model.authored_rows_,
    )


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "examples":
        path = Path("eval/category_contrasts.xlsx")
        if path.exists():
            raise SystemExit("category_contrasts.xlsx가 이미 있습니다.")

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "작성예시"
        columns = ["family", "text", "evidence", "label", "origin"]
        sheet.append(columns)

        rows = examples()
        for row in rows:
            sheet.append([row[key] for key in columns])

        for row in sheet:
            for cell in row:
                cell.data_type = "s"
                cell.number_format = "@"

        path.parent.mkdir(parents=True, exist_ok=True)
        workbook.save(path)

        print("작성한 학습 예시:", len(rows), "→", path)
        return

    if len(sys.argv) >= 2 and sys.argv[1] == "train":
        if "--with-authored" not in sys.argv:
            raise SystemExit(
                "작성 예시 포함 시험 학습에는 "
                "--with-authored를 명시하세요."
            )
        sys.argv.remove("--with-authored")

    base.make_model = make_model
    base.train = train
    base.main()


if __name__ == "__main__":
    main()