from app.agents.intake import from_text
from app.config import get_settings
from app.llm.mock import MockProvider
from app.schemas import (
    DocCategory,
    FieldKey,
    LLMExtraction,
    LLMField,
)
from app.services.pipeline import analyze


class TestProvider(MockProvider):
    def extract(self, sentences, today):
        # Gemini가 항목을 잘못 분류한 상황을 의도적으로 만든다.
        return LLMExtraction(
            title="학습 모델 연결 테스트",
            doc_category=DocCategory.APPLICATION,
            doc_subtype="테스트",
            fields=[
                LLMField(
                    key=FieldKey.APPLICANT_CRITERIA,
                    label="신청 대상",
                    value="성적증명서",
                    normalized_datetime=None,
                    evidence_quote="제출 서류: 성적증명서",
                    page=1,
                    confidence=0.99,
                ),
            ],
        )


def main():
    settings = get_settings()
    assert settings.category_model_enabled, (
        "backend/.env에서 CATEGORY_MODEL_ENABLED=true로 설정하세요."
    )

    result = analyze(
        from_text("제출 서류: 성적증명서"),
        TestProvider(),
    )

    field = result.fields[0]
    checks = [
        check for check in field.checks
        if check.name == "trained_category"
    ]

    print("추출한 값:", field.value)
    print("기존 항목:", field.key.value)
    print("최종 상태:", field.status)

    for warning in result.warnings:
        print("문서 안내:", warning)

    assert checks, (
        "학습 모델의 경고 기록이 없습니다. "
        "pipeline.py 연결과 모델 설정을 확인하세요."
    )
    assert field.status == "needs_review"
    assert field.value == "성적증명서"
    assert field.key == FieldKey.APPLICANT_CRITERIA

    print("분류 검사:", checks[0].detail)
    print("성공: 앱 분석 과정에서 v4가 실행되었습니다.")


if __name__ == "__main__":
    main()