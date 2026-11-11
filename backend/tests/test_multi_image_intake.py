
from app.agents import intake
from app.schemas import LLMLine
from app.utils.text import split_sentences
import pytest


class FakeOCR:
    """실제 Gemini 대신 테스트용 텍스트를 반환한다."""

    def transcribe_lines(self, data, mime_type):
        return [
            LLMLine(
                text=data.decode("utf-8"),
                box_2d=[100, 100, 200, 800],
            )
        ]


def test_multiple_images_keep_page_order():
    images = [
        ("1페이지 신청 대상".encode(), "image/jpeg"),
        ("2페이지 신청 마감".encode(), "image/png"),
        ("3페이지 제출 서류".encode(), "image/jpeg"),
    ]

    source = intake.from_images(images, FakeOCR())

    assert source.source_kind == "image"
    assert len(source.pages) == 3

    assert source.pages[0] == "1페이지 신청 대상"
    assert source.pages[1] == "2페이지 신청 마감"
    assert source.pages[2] == "3페이지 제출 서류"

    sentences = split_sentences(source)

    assert [s.page for s in sentences] == [1, 2, 3]

    assert len(source._image_lines_by_page) == 3
    assert source._image_lines_by_page[1][0].text == "2페이지 신청 마감"


def test_empty_images_rejected():
    with pytest.raises(intake.IntakeError):
        intake.from_images([], FakeOCR())


def test_invalid_image_type_rejected():
    images = [(b"invalid", "application/pdf")]

    with pytest.raises(intake.IntakeError):
        intake.from_images(images, FakeOCR())
