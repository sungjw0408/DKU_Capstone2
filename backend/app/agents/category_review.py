"""v4 분류 모델로 기존 확인됨 항목을 추가 검사한다."""
from functools import lru_cache
import logging
from pathlib import Path
from threading import RLock

from app.schemas import AnalysisResult, Check

log = logging.getLogger(__name__)
_LOCK = RLock()
_BACKEND = Path(__file__).resolve().parents[2]

TARGET_KEYS = {
    "applicant_criteria",
    "required_document",
    "submission_method",
}

LABELS = {
    "applicant_criteria": "신청 대상",
    "applicant_exclusion": "신청 제외 조건",
    "required_document": "제출 서류",
    "submission_method": "제출 방법",
    "selection_criteria": "선발 기준",
    "other": "기타",
}


@lru_cache(maxsize=1)
def load_model(path):
    import joblib
    return joblib.load(path)


def apply_category_review(
    analysis: AnalysisResult, settings
) -> AnalysisResult:
    if not settings.category_model_enabled:
        return analysis

    fields = [
        field for field in analysis.fields
        if field.status == "verified"
        and field.key.value in TARGET_KEYS
    ]
    if not fields:
        return analysis

    try:
        import numpy as np

        path = Path(settings.category_model_path)
        if not path.is_absolute():
            path = _BACKEND / path

        texts = [
            "값: " + field.value + "\n근거: "
            + (field.evidence.matched_text or field.evidence.quote)
            for field in fields
        ]

        with _LOCK:
            model = load_model(str(path.resolve()))
            labels = list(model.classes_)
            scores = np.asarray(
                model.predict_proba(texts), dtype=float
            )

        if (
            not labels
            or any(label not in LABELS for label in labels)
            or scores.shape != (len(fields), len(labels))
            or not np.isfinite(scores).all()
            or (scores < 0).any()
            or (scores > 1).any()
            or not np.allclose(scores.sum(axis=1), 1, atol=1e-4)
        ):
            raise ValueError("분류 모델의 응답 형식이 잘못되었습니다.")

        changes = []
        for field, probabilities in zip(fields, scores):
            best = int(probabilities.argmax())
            predicted = labels[best]
            score = float(probabilities[best])

            if (
                predicted != field.key.value
                and score >= settings.category_model_threshold
            ):
                changes.append((field, predicted, score))

    except Exception:
        log.exception("v4 추가 검증 실패")
        warning = (
            "학습 분류 모델의 추가 검증을 실행하지 못했습니다. "
            "기존 원문·값·날짜 검사 결과만 표시합니다."
        )
        if warning not in analysis.warnings:
            analysis.warnings.append(warning)
        return analysis

    for field, predicted, score in changes:
        field.status = "needs_review"
        field.confidence = min(field.confidence, 60)
        field.checks.append(Check(
            name="trained_category",
            passed=False,
            score=0,
            detail=(
                f"학습 모델은 '{LABELS[predicted]}'로 분류했습니다 "
                f"(모델 점수 {score:.2f}). "
                "현재 항목이 맞는지 확인해 주세요."
            ),
        ))

    analysis.needs_review = any(
        field.status in ("needs_review", "unverified")
        for field in analysis.fields
    )
    return analysis