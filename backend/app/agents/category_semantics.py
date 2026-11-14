"""고정된 사전학습 문장 모델로 값과 근거의 특징을 만든다."""
from pathlib import Path
import re

import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin

_ENCODERS = {}
_VECTORS = {}


class SemanticFeatures(BaseEstimator, TransformerMixin):
    def __init__(
        self,
        model_name=(
            "sentence-transformers/"
            "paraphrase-multilingual-MiniLM-L12-v2"
        ),
        revision="e8f8c211226b894fcb81acc59f3b34ba3efd5f42",
        max_length=256,
    ):
        self.model_name = model_name
        self.revision = revision
        self.max_length = max_length

    def fit(self, X, y=None):
        # 언어 모델 본체는 학습하지 않는다.
        return self

    def transform(self, X):
        import torch
        from sentence_transformers import SentenceTransformer

        torch.set_num_threads(
            min(3, torch.get_num_threads())
        )

        key = (
            self.model_name,
            self.revision,
            self.max_length,
        )

        if key not in _ENCODERS:
            cache_folder = (
                Path(__file__).resolve().parents[2]
                / "eval" / "models" / "pretrained_cache"
            )
            cache_folder.mkdir(parents=True, exist_ok=True)

            encoder = SentenceTransformer(
                self.model_name,
                revision=self.revision,
                device="cpu",
                cache_folder=str(cache_folder),
            )
            encoder.max_seq_length = self.max_length

            _ENCODERS[key] = encoder
            _VECTORS[key] = {}

        encoder = _ENCODERS[key]
        cache = _VECTORS[key]

        values = []
        evidence = []

        for text in X:
            if "\n근거:" not in str(text):
                raise ValueError(
                    "입력에 값과 근거 구분자가 없습니다."
                )

            value, context = str(text).split("\n근거:", 1)

            values.append(
                value.removeprefix("값:").strip()
            )
            evidence.append(context.strip())

        missing = [
            text
            for text in dict.fromkeys(values + evidence)
            if text not in cache
        ]

        if missing:
            embeddings = encoder.encode(
                missing,
                batch_size=16,
                normalize_embeddings=True,
                show_progress_bar=False,
            )
            cache.update(zip(missing, embeddings))

        value_vectors = np.asarray([
            cache[text] for text in values
        ])
        evidence_vectors = np.asarray([
            cache[text] for text in evidence
        ])

        # 값, 근거, 두 표현의 차이와 관계를 함께 제공한다.
        return np.hstack([
            2 * value_vectors,
            evidence_vectors,
            np.abs(value_vectors - evidence_vectors),
            value_vectors * evidence_vectors,
        ])


class HeadingFeatures(BaseEstimator, TransformerMixin):
    def fit(self, X, y=None):
        return self

    def transform(self, X):
        result = []

        for text in X:
            context = str(text).partition(
                "\n근거:"
            )[2].strip()

            match = re.match(
                r"^([^:：\n]{1,45})\s*[:：]",
                context,
            )
            heading = (
                match.group(1) if match else "제목 없음"
            )

            # 목록 번호만 제거하고 제목의 단어는 남긴다.
            heading = re.sub(
                r"^(?:(?:\d+|[가-하])[.)]\s*"
                r"|[-•○■※▶‣]\s*)+",
                "",
                heading.strip(),
            )
            result.append(heading or "제목 없음")

        return result