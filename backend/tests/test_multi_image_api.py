
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
from app.config import get_settings


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
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(
        get_settings(),
        "originals_dir",
        str(tmp_path),
    )

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


def test_multiple_images_have_original_pages(client):
    image1 = make_image("PNG")
    image2 = make_image("JPEG")

    files = [
        ("files", ("page1.png", image1, "image/png")),
        ("files", ("page2.jpg", image2, "image/jpeg")),
    ]

    response = client.post(
        "/api/documents/analyze-images",
        files=files,
    )

    assert response.status_code == 200, response.text

    doc_id = response.json()["documentId"]

    # 페이지 크기 정보 확인
    source_response = client.get(
        f"/api/documents/{doc_id}/source"
    )

    assert source_response.status_code == 200

    source = source_response.json()

    assert source["pageImages"] == [
        {"width": 100, "height": 100},
        {"width": 100, "height": 100},
    ]

    # 첫 번째 사진 원본 확인
    page1 = client.get(
        f"/api/documents/{doc_id}/pages/1/image"
    )

    assert page1.status_code == 200
    assert page1.content == image1
    assert page1.headers["content-type"] == "image/png"

    # 두 번째 사진 원본 확인
    page2 = client.get(
        f"/api/documents/{doc_id}/pages/2/image"
    )

    assert page2.status_code == 200
    assert page2.content == image2
    assert page2.headers["content-type"] == "image/jpeg"

    # 세 번째 페이지는 존재하지 않음
    page3 = client.get(
        f"/api/documents/{doc_id}/pages/3/image"
    )

    assert page3.status_code == 404


def test_highlight_points_to_second_image(client, monkeypatch):
    class PageOCR(MockProvider):
        def transcribe_lines(self, data, mime_type):
            if mime_type == "image/png":
                lines = [
                    "장학금 신청 안내",
                    "신청 대상: 재학생",
                ]
            else:
                lines = [
                    "제출 및 일정 안내",
                    "신청 마감: 2026년 11월 30일",
                    "제출 서류: 신청서",
                ]

            return [
                LLMLine(
                    text=text,
                    box_2d=[
                        100 + index * 120,
                        100,
                        180 + index * 120,
                        900,
                    ],
                )
                for index, text in enumerate(lines)
            ]

    monkeypatch.setattr(
        routes,
        "get_llm",
        lambda: PageOCR(),
    )

    files = [
        (
            "files",
            ("page1.png", make_image("PNG"), "image/png"),
        ),
        (
            "files",
            ("page2.jpg", make_image("JPEG"), "image/jpeg"),
        ),
    ]

    response = client.post(
        "/api/documents/analyze-images",
        files=files,
    )

    assert response.status_code == 200, response.text

    result = response.json()
    doc_id = result["documentId"]

    deadline = next(
        field
        for field in result["analysis"]["fields"]
        if field["key"] == "deadline"
    )

    source_response = client.get(
        f"/api/documents/{doc_id}/source"
    )

    assert source_response.status_code == 200

    source = source_response.json()

    assert len(source["pageImages"]) == 2

    highlight = source["highlights"].get(deadline["id"])

    assert highlight is not None
    assert highlight["page"] == 2
    assert highlight["rects"]

    for x, y, width, height in highlight["rects"]:
        assert 0 <= x < 1
        assert 0 <= y < 1
        assert 0 < width <= 1
        assert 0 < height <= 1
