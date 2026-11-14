"""글자·문장 의미·구역 제목 특징을 결합한 분류기."""
from sklearn.pipeline import Pipeline, FeatureUnion
from sklearn.linear_model import LogisticRegression
from sklearn.feature_extraction.text import TfidfVectorizer

from app.agents.category_semantics import (
    SemanticFeatures,
    HeadingFeatures,
)
from eval import category_train as base

_lexical_factory = base.make_model


def make_model():
    # 기존 v2의 글자 특징 추출 부분을 재사용한다.
    lexical = Pipeline(
        _lexical_factory().steps[:-1]
    )

    return Pipeline([
        (
            "features",
            FeatureUnion(
                [
                    ("lexical", lexical),
                    ("semantic", SemanticFeatures()),
                    (
                        "heading",
                        Pipeline([
                            ("extract", HeadingFeatures()),
                            (
                                "tfidf",
                                TfidfVectorizer(
                                    analyzer="char",
                                    ngram_range=(2, 5),
                                ),
                            ),
                        ]),
                    ),
                ],
                transformer_weights={
                    "lexical": 1.0,
                    "semantic": 1.0,
                    "heading": 0.75,
                },
            ),
        ),
        (
            "classifier",
            LogisticRegression(
                C=4.0,
                class_weight="balanced",
                max_iter=2000,
                random_state=42,
            ),
        ),
    ])


def main():
    base.make_model = make_model
    base.main()


if __name__ == "__main__":
    main()