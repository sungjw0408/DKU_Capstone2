
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.api import routes
from app.api.authn import active_uid
from app.llm.mock import MockProvider
from app.main import app
from app.schemas import LLMLine
from tests.conftest import SAMPLE


class FakeImages(MockProvider):
    """실제 Gemini 호출 없이 이미지별 텍스트 반환."""

    def transcribe_lines(self, data, mime_type):
        if mime_type == "image/png":
            text = SAMPLE
        else:
            text = "추가 안내: 제출 서류를 확인하세요."

        return [
            LLMLine(
                text=line,
                box_2d=[100, 100, 200, 900],
            )
            for line in text.splitlines()
            if line.strip()
        ]


def make_image(fmt):
    buffer = io.BytesIO()
    Image.new("RGB", (100, 100), "white").save(
        buffer, format=fmt
    )
    return buffer.getvalue()


@pytest.fixture
def client(monkeypatch):
    # 테스트 사용자 인증을 대체
    app.dependency_overrides[active_uid] = (
        lambda: "multi-image-test-user"
    )

    monkeypatch.setattr(
        routes, "get_llm", lambda: FakeImages()
    )

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(active_uid, None)


def test_multiple_images_analysis(client):
    files = [
        ("files", (
            "page1.png",
            make_image("PNG"),
            "image/png",
        )),
        ("files", (
            "page2.jpg",
            make_image("JPEG"),
            "image/jpeg",
        )),
    ]

    response = client.post(
        "/api/documents/analyze-images",
        files=files,
    )

    assert response.status_code == 200, response.text

    result = response.json()

    assert result["sourceKind"] == "image"
    assert result["documentId"]

    # 두 장이 하나의 문서로 저장되었는지 확인
    doc_id = result["documentId"]

    source_response = client.get(
        f"/api/documents/{doc_id}/source"
    )

    assert source_response.status_code == 200

    source = source_response.json()

    assert len(source["pages"]) == 2
    assert "2026학년도" in source["pages"][0]
    assert "추가 안내" in source["pages"][1]


def test_reject_too_many_images(client):
    image = make_image("PNG")

    files = [
        ("files", (
            f"page{i}.png",
            image,
            "image/png",
        ))
        for i in range(6)
    ]

    response = client.post(
        "/api/documents/analyze-images",
        files=files,
    )

    assert response.status_code == 422


def test_reject_non_image(client):
    files = [
        ("files", (
            "page1.png",
            make_image("PNG"),
            "image/png",
        )),
        ("files", (
            "notice.pdf",
            b"not-a-photo",
            "application/pdf",
        )),
    ]

    response = client.post(
        "/api/documents/analyze-images",
        files=files,
    )

    assert response.status_code == 422
