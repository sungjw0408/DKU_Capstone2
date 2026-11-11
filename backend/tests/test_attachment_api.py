
import io

import pytest
from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas

from app.api.authn import active_uid
from app.config import get_settings
from app.main import app
from tests.conftest import SAMPLE

from PIL import Image
from app.api import routes
from app.llm.mock import MockProvider
from app.schemas import LLMLine


def make_pdf():
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer)

    pdf.drawString(
        50,
        800,
        "Required documents: application form and transcript",
    )
    pdf.save()

    return buffer.getvalue()


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(
        get_settings(),
        "originals_dir",
        str(tmp_path),
    )

    app.dependency_overrides[active_uid] = (
        lambda: "attachment-test-user"
    )

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(active_uid, None)


def test_analyze_body_with_pdf_attachment(client):
    response = client.post(
        "/api/documents/analyze-with-attachments",
        data={"text": SAMPLE},
        files=[
            (
                "files",
                (
                    "application-guide.pdf",
                    make_pdf(),
                    "application/pdf",
                ),
            )
        ],
    )

    assert response.status_code == 200, response.text

    result = response.json()
    assert "fieldSources" in result["view"]
    doc_id = result["documentId"]

    saved = client.get(f"/api/documents/{doc_id}")

    assert saved.status_code == 200
    assert saved.json()["view"]["fieldSources"] == result["view"]["fieldSources"]

    assert doc_id
    assert result["analysis"]["fields"]

    source_response = client.get(
        f"/api/documents/{doc_id}/source"
    )


    assert source_response.status_code == 200

    source = source_response.json()

    assert len(source["pages"]) == 2

    assert "2026학년도" in source["pages"][0]
    assert "Required documents" in source["pages"][1]

    page_sources = source["pageSources"]

    assert page_sources[0]["kind"] == "body"
    assert page_sources[1]["kind"] == "attachment"
    assert page_sources[1]["filename"] == "application-guide.pdf"
    assert page_sources[1]["original_page"] == 1


def test_reject_hwp_without_parser(client):
    response = client.post(
        "/api/documents/analyze-with-attachments",
        data={"text": SAMPLE},
        files=[
            (
                "files",
                (
                    "guide.hwp",
                    b"sample",
                    "application/x-hwp",
                ),
            )
        ],
    )

    assert response.status_code == 422


def test_reject_empty_body(client):
    response = client.post(
        "/api/documents/analyze-with-attachments",
        data={"text": "   "},
        files=[
            (
                "files",
                (
                    "guide.pdf",
                    make_pdf(),
                    "application/pdf",
                ),
            )
        ],
    )

    assert response.status_code == 422


class FakeMixedOCR(MockProvider):
    def transcribe_lines(self, data, mime_type):
        return [
            LLMLine(
                text="신청 마감: 2026년 11월 30일",
                box_2d=[100, 100, 180, 900],
            )
        ]


def test_mixed_attachments_api_and_original_pages(
    client, monkeypatch
):
    monkeypatch.setattr(
        routes,
        "get_llm",
        lambda: FakeMixedOCR(),
    )

    buffer = io.BytesIO()

    Image.new("RGB", (200, 300), "white").save(
        buffer,
        format="PNG",
    )

    image_data = buffer.getvalue()

    response = client.post(
        "/api/documents/analyze-with-attachments",
        data={"text": SAMPLE},
        files=[
            (
                "files",
                (
                    "guide.pdf",
                    make_pdf(),
                    "application/pdf",
                ),
            ),
            (
                "files",
                (
                    "deadline.png",
                    image_data,
                    "image/png",
                ),
            ),
        ],
    )

    assert response.status_code == 200, response.text

    doc_id = response.json()["documentId"]

    source_response = client.get(
        f"/api/documents/{doc_id}/source"
    )

    assert source_response.status_code == 200

    source = source_response.json()

    assert len(source["pages"]) == 3
    assert len(source["pageImages"]) == 3

    assert source["pageImages"][0] is None
    assert source["pageImages"][1] is not None
    assert source["pageImages"][2] == {
        "width": 200,
        "height": 300,
    }

    body_page = client.get(
        f"/api/documents/{doc_id}/pages/1/image"
    )
    assert body_page.status_code == 404

    pdf_page = client.get(
        f"/api/documents/{doc_id}/pages/2/image"
    )
    assert pdf_page.status_code == 200
    assert pdf_page.content.startswith(b"\x89PNG")

    image_page = client.get(
        f"/api/documents/{doc_id}/pages/3/image"
    )
    assert image_page.status_code == 200
    assert image_page.content == image_data
