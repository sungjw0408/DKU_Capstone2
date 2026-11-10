
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
