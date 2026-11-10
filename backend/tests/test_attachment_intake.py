
import io

import pytest
from reportlab.pdfgen import canvas

from app.agents import intake
from app.llm.mock import MockProvider
from app.schemas import LLMLine

from PIL import Image

from app.config import get_settings
from app.services import originals
from types import SimpleNamespace


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


def test_body_and_pdf_attachment_keep_sources():
    body = (
        "Scholarship application notice\n"
        "Application deadline: November 30, 2026"
    )

    source = intake.from_body_and_attachments(
        body,
        [
            (
                make_pdf(),
                "application/pdf",
                "application-guide.pdf",
            )
        ],
        MockProvider(),
    )

    assert source.source_kind == "text"
    assert len(source.pages) == 2
    assert len(source.page_sources) == 2

    assert "Application deadline" in source.pages[0]
    assert "Required documents" in source.pages[1]

    assert source.page_sources[0].kind == "body"
    assert source.page_sources[0].original_page == 1

    assert source.page_sources[1].kind == "attachment"
    assert source.page_sources[1].filename == "application-guide.pdf"
    assert source.page_sources[1].original_page == 1


def test_hwp_is_not_accepted_without_parser():
    with pytest.raises(intake.IntakeError):
        intake.from_body_and_attachments(
            "Scholarship notice",
            [(b"sample", "application/x-hwp", "guide.hwp")],
            MockProvider(),
        )



def test_analysis_result_contains_attachment_source():
    from app.schemas import PageSource
    from app.services import pipeline
    from app.services.frontend_view import to_analysis_detail
    from tests.conftest import SAMPLE, NOW

    source = intake.from_text(
        "장학금 신청 안내입니다.\f" + SAMPLE
    )

    source.page_sources = [
        PageSource(
            kind="body",
            original_page=1,
        ),
        PageSource(
            kind="attachment",
            filename="scholarship-guide.pdf",
            original_page=1,
        ),
    ]

    analysis = pipeline.analyze(
        source,
        MockProvider(),
        now=NOW,
    )

    view = to_analysis_detail(analysis, source)

    attachment_fields = [
        field
        for field in analysis.fields
        if (
            field.evidence.page == 2
            and field.status != "unverified"
            and field.evidence.match_score >= 0.8
        )
    ]

    assert attachment_fields

    for field in attachment_fields:
        origin = view["fieldSources"][field.id]

        assert origin["kind"] == "attachment"
        assert origin["filename"] == "scholarship-guide.pdf"
        assert origin["originalPage"] == 1


class FakeAttachmentOCR(MockProvider):
    def transcribe_lines(self, data, mime_type):
        return [
            LLMLine(
                text="신청 마감: 2026년 11월 30일",
                box_2d=[100, 100, 180, 900],
            )
        ]


def test_mixed_pdf_and_image_attachments():
    source = intake.from_body_and_attachments(
        "장학금 신청 안내",
        [
            (
                make_pdf(),
                "application/pdf",
                "application-guide.pdf",
            ),
            (
                b"mock-image",
                "image/png",
                "deadline.png",
            ),
        ],
        FakeAttachmentOCR(),
    )

    assert len(source.pages) == 3
    assert len(source.page_sources) == 3

    assert source.page_sources[0].kind == "body"

    assert source.page_sources[1].filename == "application-guide.pdf"
    assert source.page_sources[1].attachment_index == 0

    assert source.page_sources[2].filename == "deadline.png"
    assert source.page_sources[2].attachment_index == 1

    assert "Required documents" in source.pages[1]
    assert "신청 마감" in source.pages[2]

    assert source._image_lines_by_page[0] is None
    assert source._image_lines_by_page[1] is None
    assert source._image_lines_by_page[2][0].box_2d == [
        100, 100, 180, 900
    ]


def test_mixed_attachment_original_pages(monkeypatch, tmp_path):
    monkeypatch.setattr(
        get_settings(),
        "originals_dir",
        str(tmp_path),
    )

    image_buffer = io.BytesIO()
    Image.new("RGB", (200, 300), "white").save(
        image_buffer,
        format="PNG",
    )
    image_data = image_buffer.getvalue()

    attachments = [
        (
            make_pdf(),
            "application/pdf",
            "guide.pdf",
        ),
        (
            image_data,
            "image/png",
            "notice.png",
        ),
    ]

    source = intake.from_body_and_attachments(
        "장학금 신청 안내",
        attachments,
        FakeAttachmentOCR(),
    )

    doc_id = "mixed-attachment-test"

    originals.save_mixed_attachments(
        doc_id,
        attachments,
        source,
    )

    layout = originals.page_layout(doc_id)

    assert layout is not None
    assert len(layout["pages"]) == 3

    assert layout["pages"][0] is None
    assert layout["pages"][1]["width"] > 0
    assert layout["pages"][1]["height"] > 0

    assert layout["pages"][2] == {
        "width": 200,
        "height": 300,
    }

    assert originals.page_image(doc_id, 1) is None

    pdf_page = originals.page_image(doc_id, 2)
    assert pdf_page is not None
    assert pdf_page[1] == "image/png"
    assert pdf_page[0].startswith(b"\x89PNG")

    photo_page = originals.page_image(doc_id, 3)
    assert photo_page is not None
    assert photo_page[0] == image_data
    assert photo_page[1] == "image/png"

    assert originals.page_image(doc_id, 4) is None

    originals.delete_originals(doc_id)

    assert not list(tmp_path.glob(f"{doc_id}*"))


def test_mixed_attachment_highlights(monkeypatch, tmp_path):
    monkeypatch.setattr(
        get_settings(),
        "originals_dir",
        str(tmp_path),
    )

    image_buffer = io.BytesIO()
    Image.new("RGB", (200, 300), "white").save(
        image_buffer,
        format="PNG",
    )
    image_data = image_buffer.getvalue()

    pdf_text = "Required documents: application form and transcript"
    image_text = "신청 마감: 2026년 11월 30일"

    attachments = [
        (make_pdf(), "application/pdf", "guide.pdf"),
        (image_data, "image/png", "deadline.png"),
    ]

    source = intake.from_body_and_attachments(
        "장학금 신청 안내",
        attachments,
        FakeAttachmentOCR(),
    )

    doc_id = "mixed-highlight-test"

    originals.save_mixed_attachments(
        doc_id,
        attachments,
        source,
    )

    def field(field_id, page, text):
        return SimpleNamespace(
            id=field_id,
            evidence=SimpleNamespace(
                page=page,
                matched_text=text,
                quote=text,
            ),
        )

    analysis = SimpleNamespace(
        fields=[
            field("body-field", 1, "장학금 신청 안내"),
            field("pdf-field", 2, pdf_text),
            field("image-field", 3, image_text),
        ]
    )

    highlights = originals.highlights(doc_id, analysis)

    assert "body-field" not in highlights

    assert highlights["pdf-field"]["page"] == 2
    assert highlights["pdf-field"]["rects"]

    assert highlights["image-field"]["page"] == 3
    assert highlights["image-field"]["rects"]

    for item in highlights.values():
        for x, y, width, height in item["rects"]:
            assert 0 <= x <= 1
            assert 0 <= y <= 1
            assert 0 < width <= 1
            assert 0 < height <= 1
