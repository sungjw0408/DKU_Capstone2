"""AGENT 01 · 문서 접수 에이전트

다양한 입력(텍스트, PDF, 이미지)을 페이지별 원문 텍스트로 바꾸고 개인정보를 마스킹한다.
- 텍스트 PDF: pypdf로 직접 추출 (LLM 비용 0, 원문 그대로라 근거 검증에 유리)
- 스캔 PDF / 이미지: Gemini 멀티모달로 받아쓰기
"""
from __future__ import annotations

import io

from pypdf import PdfReader

from app.llm.base import LLMProvider
from app.schemas import SourceDocument
from app.utils.text import mask_pii

SUPPORTED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"}
_MIN_PDF_TEXT_CHARS = 30  # 이보다 적으면 스캔 PDF로 보고 OCR


class IntakeError(ValueError):
    pass


def _finalize(kind: str, pages: list[str]) -> SourceDocument:
    masked_pages, total = [], 0
    for p in pages:
        text, n = mask_pii(p.replace("\r\n", "\n").strip())
        masked_pages.append(text)
        total += n
    if not any(p.strip() for p in masked_pages):
        raise IntakeError("문서에서 텍스트를 찾지 못했습니다.")
    return SourceDocument(source_kind=kind, pages=masked_pages, masked_count=total)


def from_text(text: str) -> SourceDocument:
    pages = [p for p in text.split("\f")]  # 폼피드로 페이지를 나눌 수 있게
    return _finalize("text", pages)


def from_pdf(data: bytes, llm: LLMProvider) -> SourceDocument:
    try:
        reader = PdfReader(io.BytesIO(data))
        pages = [(page.extract_text() or "") for page in reader.pages]
    except Exception as e:  # 손상된 PDF
        raise IntakeError(f"PDF를 읽을 수 없습니다: {e}") from e
    if sum(len(p.strip()) for p in pages) >= _MIN_PDF_TEXT_CHARS:
        return _finalize("pdf", pages)
    return _finalize("pdf", llm.transcribe(data, "application/pdf"))


def from_image(data: bytes, mime_type: str, llm: LLMProvider) -> SourceDocument:
    if mime_type == "image/jpg":
        mime_type = "image/jpeg"
    if mime_type not in SUPPORTED_IMAGE_TYPES:
        raise IntakeError(f"지원하지 않는 이미지 형식: {mime_type}")
    # 줄별 위치까지 받을 수 있으면(Gemini) 그걸 쓰고, 안 되면 일반 받아쓰기
    transcribe_lines = getattr(llm, "transcribe_lines", None)
    if transcribe_lines is not None:
        try:
            lines = transcribe_lines(data, mime_type)
        except Exception:  # 구조화 응답 실패 등 → 일반 받아쓰기로
            lines = []
        if lines:
            doc = _finalize("image", ["\n".join(ln.text for ln in lines)])
            doc._image_lines = lines
            return doc
    return _finalize("image", llm.transcribe(data, mime_type))


def from_images(
    images: list[tuple[bytes, str]],
    llm: LLMProvider,
) -> SourceDocument:
    """여러 장의 이미지를 페이지 순서대로 하나의 문서로 통합한다."""

    if not images:
        raise IntakeError("분석할 사진이 없습니다.")

    pages = []
    image_lines_by_page = []
    masked_count = 0

    for data, mime_type in images:
        # 기존 사진 한 장 분석 함수 재사용
        photo_source = from_image(data, mime_type, llm)

        # 사진 한 장을 문서의 한 페이지로 처리
        pages.append("\n".join(photo_source.pages))

        # 사진별 텍스트 위치 정보 보관
        image_lines_by_page.append(photo_source._image_lines)

        # 개인정보 마스킹 횟수 합산
        masked_count += photo_source.masked_count

    # 여러 사진을 하나의 문서 객체로 생성
    source = SourceDocument(
        source_kind="image",
        pages=pages,
        masked_count=masked_count,
    )

    source._image_lines_by_page = image_lines_by_page

    return source

def from_upload(data: bytes, mime_type: str, filename: str, llm: LLMProvider) -> SourceDocument:
    name = filename.lower()
    if mime_type == "application/pdf" or name.endswith(".pdf"):
        return from_pdf(data, llm)
    if mime_type.startswith("image/"):
        return from_image(data, mime_type, llm)
    if name.endswith((".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif")):  # 웹에서 type 이 비어 올 때
        ext = name.rsplit(".", 1)[-1]
        return from_image(data, "image/jpeg" if ext in ("jpg", "jpeg") else f"image/{ext}", llm)
    if mime_type.startswith("text/") or name.endswith((".txt", ".md")):
        return from_text(data.decode("utf-8", errors="replace"))
    raise IntakeError(f"지원하지 않는 파일 형식: {mime_type or filename}")
