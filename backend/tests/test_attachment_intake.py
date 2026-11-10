
import io

import pytest
from reportlab.pdfgen import canvas

from app.agents import intake
from app.llm.mock import MockProvider


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
