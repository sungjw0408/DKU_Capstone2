"""원본 파일 보관 + PDF 페이지 렌더링 / 근거 위치(하이라이트 박스) 계산.

원문 근거 화면에서 실제 PDF 페이지 위에 근거 문장을 형광펜처럼 표시하기 위해 쓴다.
- 원본은 로컬 디스크(ORIGINALS_DIR, 기본 backend/data/originals)에 문서 id 이름으로 저장한다.
  Cloud Run 처럼 디스크가 휘발되는 환경에서는 원본이 사라질 수 있고, 그때 프론트는 텍스트 보기로 대체한다.
- 텍스트 레이어가 있는 PDF: pdfium 으로 페이지를 그리고 글자 위치로 박스를 계산한다.
- 사진/이미지: 원본 이미지를 그대로 보여주고, Gemini 받아쓰기에서 받은 줄별 위치로 박스를 계산한다.
- 그 외(스캔 PDF, 텍스트 입력, 위치 정보 없는 이미지)는 텍스트 보기.
"""
from __future__ import annotations

import json
import re
import struct
import threading
import hashlib
from functools import lru_cache
from pathlib import Path

from rapidfuzz import fuzz

from app.config import get_settings
from app.schemas import AnalysisResult, LLMLine

_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")
_SKIP = re.compile(r"[\s\"'“”‘’`·•▶▷■□◆◇○●※]")  # utils.text.normalize 와 같은 문자 집합
_MIN_TEXT_CHARS = 30
_lock = threading.Lock()  # pdfium 은 스레드 안전하지 않다


def user_prefix(uid: str) -> str:
    return "u-" + hashlib.sha256(uid.encode("utf-8")).hexdigest() + "-"


def scoped_id(uid: str | None, doc_id: str) -> str:
    if not _SAFE_ID.fullmatch(doc_id):
        raise ValueError("문서 ID가 올바르지 않습니다.")
    return user_prefix(uid) + doc_id if uid else doc_id


def delete_user_originals(uid: str) -> int:
    # 탈퇴에서는 삭제 실패를 숨기지 않는다. 성공해야 계정 삭제를 완료한다.
    count = 0
    for path in _dir().glob(user_prefix(uid) + "*"):
        path.unlink(missing_ok=True)
        count += 1
    _pdf_layout.cache_clear()
    return count


def _dir() -> Path:
    d = Path(get_settings().originals_dir)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _pdf_path(doc_id: str) -> Path | None:
    if not _SAFE_ID.match(doc_id):
        return None
    return _dir() / f"{doc_id}.pdf"


def save_pdf(doc_id: str, data: bytes) -> None:
    path = _pdf_path(doc_id)
    if path is not None:
        path.write_bytes(data)


def has_pdf(doc_id: str) -> bool:
    path = _pdf_path(doc_id)
    return bool(path and path.exists())


def _open(doc_id: str):
    import pypdfium2 as pdfium

    return pdfium.PdfDocument(str(_pdf_path(doc_id)))


# ─────────────────────────── 페이지 정보 ───────────────────────────
@lru_cache(maxsize=64)
def _pdf_layout(doc_id: str) -> dict | None:
    if not has_pdf(doc_id):
        return None
    try:
        with _lock:
            pdf = _open(doc_id)
            pages, chars = [], 0
            for page in pdf:
                w, h = page.get_size()
                pages.append({"width": w, "height": h})
                chars += page.get_textpage().count_chars()
            pdf.close()
    except Exception:
        return None
    if chars < _MIN_TEXT_CHARS:
        return None
    return {"pages": pages}


def _bitmap_to_png(bitmap) -> bytes:
    """pypdfium2 비트맵 → PNG. Pillow 가 있으면 쓰고, 없으면 표준 라이브러리(zlib)로 직접 만든다."""
    try:
        import io

        buf = io.BytesIO()
        bitmap.to_pil().save(buf, format="PNG", optimize=True)
        return buf.getvalue()
    except ImportError:
        pass
    import struct
    import zlib

    w, h, stride, ch = bitmap.width, bitmap.height, bitmap.stride, bitmap.n_channels
    raw = bytes(bitmap.buffer)
    color = {1: 0, 3: 2, 4: 6}[ch]  # 회색조 / RGB / RGBA
    rows = b"".join(b"\x00" + raw[y * stride : y * stride + w * ch] for y in range(h))

    def chunk(tag: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, color, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(rows, 6))
        + chunk(b"IEND", b"")
    )


def render_png(doc_id: str, page_no: int, width: int = 1000) -> bytes | None:
    """page_no 는 1부터. width 픽셀 폭으로 렌더링한 PNG. 디스크에 캐시한다."""
    if not has_pdf(doc_id):
        return None
    width = max(100, min(width, 2000))
    cache = _dir() / f"{doc_id}.p{page_no}.w{width}.png"
    if cache.exists():
        return cache.read_bytes()
    with _lock:
        pdf = _open(doc_id)
        try:
            if not 1 <= page_no <= len(pdf):
                return None
            page = pdf[page_no - 1]
            scale = width / page.get_width()
            bitmap = page.render(scale=scale, rev_byteorder=True)
            data = _bitmap_to_png(bitmap)
        finally:
            pdf.close()
    cache.write_bytes(data)
    return data


# ─────────────────────────── 하이라이트 박스 ───────────────────────────
def _page_chars(page):
    """페이지 글자를 (정규화 문자열, 원래 글자 인덱스 목록) 으로. 공백·글머리표는 건너뛴다."""
    import pypdfium2.raw as raw

    tp = page.get_textpage()
    n = tp.count_chars()
    norm, idx = [], []
    for i in range(n):
        code = raw.FPDFText_GetUnicode(tp, i)
        ch = chr(code) if 0 < code < 0x110000 else ""
        if not ch or _SKIP.match(ch):
            continue
        norm.append(ch)
        idx.append(i)
    return tp, "".join(norm), idx


def _find_span(hay: str, needle: str) -> tuple[int, int] | None:
    if not needle or not hay:
        return None
    pos = hay.find(needle)
    if pos >= 0:
        return pos, pos + len(needle)
    if len(needle) < 4:
        return None
    al = fuzz.partial_ratio_alignment(needle, hay, score_cutoff=80)
    if al is None:
        return None
    return al.dest_start, al.dest_end


def _boxes(tp, idx: list[int], start: int, end: int, page_w: float, page_h: float) -> list[list[float]]:
    """글자 박스를 줄 단위로 합쳐서 페이지 비율 좌표 [x, y, w, h] (좌상단 원점, 0~1) 로 돌려준다."""
    lines: list[list[float]] = []  # [left, bottom, right, top]
    for k in range(start, end):
        l, b, r, t = tp.get_charbox(idx[k])
        if r - l <= 0 or t - b <= 0:
            continue
        cur = lines[-1] if lines else None
        # 같은 줄: 세로로 절반 이상 겹치고 왼쪽에서 오른쪽으로 이어질 때
        if cur and min(cur[3], t) - max(cur[1], b) > 0.5 * min(cur[3] - cur[1], t - b) and l >= cur[0] - 2:
            cur[0], cur[1], cur[2], cur[3] = min(cur[0], l), min(cur[1], b), max(cur[2], r), max(cur[3], t)
        else:
            lines.append([l, b, r, t])
    pad = 1.5
    out = []
    for l, b, r, t in lines:
        out.append([
            round(max(0.0, (l - pad) / page_w), 4),
            round(max(0.0, 1 - (t + pad) / page_h), 4),
            round(min(1.0, (r - l + 2 * pad) / page_w), 4),
            round(min(1.0, (t - b + 2 * pad) / page_h), 4),
        ])
    return out


def _pdf_highlights(doc_id: str, analysis: AnalysisResult) -> dict[str, dict]:
    if _pdf_layout(doc_id) is None:
        return {}
    result: dict[str, dict] = {}
    with _lock:
        pdf = _open(doc_id)
        try:
            cache: dict[int, tuple] = {}

            def chars(p: int):
                if p not in cache:
                    page = pdf[p - 1]
                    cache[p] = (page, *_page_chars(page))
                return cache[p]

            for f in analysis.fields:
                text = f.evidence.matched_text or f.evidence.quote
                needle = _SKIP.sub("", text or "")
                if not needle:
                    continue
                # 근거 페이지부터 찾고, 없으면 나머지 페이지
                order = list(range(1, len(pdf) + 1))
                if f.evidence.page and 1 <= f.evidence.page <= len(pdf):
                    order.remove(f.evidence.page)
                    order.insert(0, f.evidence.page)
                for p in order:
                    page, tp, hay, idx = chars(p)
                    span = _find_span(hay, needle)
                    if span:
                        w, h = page.get_size()
                        rects = _boxes(tp, idx, span[0], span[1], w, h)
                        if rects:
                            result[f.id] = {"page": p, "rects": rects}
                        break
        finally:
            pdf.close()
    return result


# ─────────────────────────── 사진 / 이미지 ───────────────────────────
_IMG_EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif"}


def _img_meta_path(doc_id: str) -> Path | None:
    if not _SAFE_ID.match(doc_id):
        return None
    return _dir() / f"{doc_id}.image.json"


def _image_size(data: bytes) -> tuple[int, int] | None:
    """PNG / JPEG / WebP 헤더에서 (가로, 세로)를 읽는다. Pillow 없이 동작."""
    try:
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            return struct.unpack(">II", data[16:24])
        if data[:2] == b"\xff\xd8":
            i = 2
            while i < len(data) - 9:
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                    i += 2
                    continue
                seg = struct.unpack(">H", data[i + 2 : i + 4])[0]
                if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                    h, w = struct.unpack(">HH", data[i + 5 : i + 9])
                    return w, h
                i += 2 + seg
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            kind = data[12:16]
            if kind == b"VP8X":
                w = int.from_bytes(data[24:27], "little") + 1
                h = int.from_bytes(data[27:30], "little") + 1
                return w, h
            if kind == b"VP8 ":
                w, h = struct.unpack("<HH", data[26:30])
                return w & 0x3FFF, h & 0x3FFF
            if kind == b"VP8L":
                b = data[21:25]
                w = 1 + (((b[1] & 0x3F) << 8) | b[0])
                h = 1 + (((b[3] & 0x0F) << 10) | (b[2] << 2) | ((b[1] & 0xC0) >> 6))
                return w, h
    except (struct.error, IndexError):
        return None
    return None


def _exif_orientation(data: bytes) -> int:
    """JPEG EXIF 회전값(1~8). 없으면 1."""
    i = data.find(b"Exif\x00\x00")
    if i < 0 or i > 65536:
        return 1
    t = i + 6
    try:
        endian = "<" if data[t : t + 2] == b"II" else ">"
        ifd = t + struct.unpack(endian + "I", data[t + 4 : t + 8])[0]
        n = struct.unpack(endian + "H", data[ifd : ifd + 2])[0]
        for k in range(n):
            e = ifd + 2 + 12 * k
            if struct.unpack(endian + "H", data[e : e + 2])[0] == 0x0112:
                return struct.unpack(endian + "H", data[e + 8 : e + 10])[0]
    except struct.error:
        pass
    return 1


def save_image(doc_id: str, data: bytes, mime_type: str, lines: list[LLMLine] | None) -> None:
    """원본 이미지 + 줄별 위치를 저장한다. 크기를 못 읽거나 위치 정보가 없으면 저장하지 않는다(텍스트 보기)."""
    meta_path = _img_meta_path(doc_id)
    size = _image_size(data)
    if meta_path is None or not size or not lines:
        return
    w, h = size
    if _exif_orientation(data) in (5, 6, 7, 8):  # 90도 회전된 사진: 화면에 보이는 가로세로로
        w, h = h, w
    ext = _IMG_EXT.get(mime_type, "img")
    (_dir() / f"{doc_id}.{ext}").write_bytes(data)
    meta_path.write_text(
        json.dumps(
            {"mime": mime_type, "file": f"{doc_id}.{ext}", "width": w, "height": h,
             "lines": [ln.model_dump() for ln in lines]},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )


def _img_meta(doc_id: str) -> dict | None:
    path = _img_meta_path(doc_id)
    if not path or not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _image_highlights(meta: dict, analysis: AnalysisResult) -> dict[str, dict]:
    """줄별 상자를 이어 붙인 문자열에서 근거 문장을 찾아, 걸친 줄마다 글자 비율만큼 박스를 만든다."""
    hay, owner, pos_in_line, line_len = [], [], [], []
    for li, ln in enumerate(meta["lines"]):
        norm = _SKIP.sub("", ln["text"])
        line_len.append(len(norm))
        for k, ch in enumerate(norm):
            hay.append(ch)
            owner.append(li)
            pos_in_line.append(k)
    hay_s = "".join(hay)
    result: dict[str, dict] = {}
    for f in analysis.fields:
        needle = _SKIP.sub("", f.evidence.matched_text or f.evidence.quote or "")
        span = _find_span(hay_s, needle)
        if not span or span[1] <= span[0]:
            continue
        per_line: dict[int, list[int]] = {}
        for k in range(span[0], span[1]):
            li = owner[k]
            lo, hi = per_line.get(li, [pos_in_line[k], pos_in_line[k]])
            per_line[li] = [min(lo, pos_in_line[k]), max(hi, pos_in_line[k])]
        rects = []
        for li, (lo, hi) in sorted(per_line.items()):
            box = meta["lines"][li]["box_2d"]
            if len(box) != 4:
                continue
            ymin, xmin, ymax, xmax = (max(0, min(1000, v)) / 1000 for v in box)
            if xmax <= xmin or ymax <= ymin:
                continue
            n = max(line_len[li], 1)
            x0 = xmin + (xmax - xmin) * lo / n
            x1 = xmin + (xmax - xmin) * (hi + 1) / n
            pad = 0.004
            rects.append([round(max(0, x0 - pad), 4), round(max(0, ymin - pad), 4),
                          round(min(1, x1 - x0 + 2 * pad), 4), round(min(1, ymax - ymin + 2 * pad), 4)])
        if rects:
            result[f.id] = {"page": 1, "rects": rects}
    return result


# ─────────────────────────── 공개 함수 (PDF / 이미지 공통) ───────────────────────────
def page_layout(doc_id: str) -> dict | None:
    """{pages: [{width, height}]} — 원본 이미지로 보여줄 수 없으면 None (프론트는 텍스트 보기)"""
    meta = _img_meta(doc_id)
    if meta:
        return {"pages": [{"width": meta["width"], "height": meta["height"]}]}
    return _pdf_layout(doc_id)


def highlights(doc_id: str, analysis: AnalysisResult) -> dict[str, dict]:
    """{fieldId: {page, rects: [[x, y, w, h], ...]}} — 원본 위에서 근거 문장 위치 (페이지 비율 좌표)"""
    meta = _img_meta(doc_id)
    if meta:
        return _image_highlights(meta, analysis)
    return _pdf_highlights(doc_id, analysis)


def page_image(doc_id: str, page_no: int, width: int = 1000) -> tuple[bytes, str] | None:
    """(이미지 바이트, MIME). 사진은 원본 그대로, PDF 는 PNG 로 렌더링."""
    meta = _img_meta(doc_id)
    if meta:
        if page_no != 1:
            return None
        return (_dir() / meta["file"]).read_bytes(), meta["mime"]
    png = render_png(doc_id, page_no, width)
    return (png, "image/png") if png else None


def delete_originals(doc_id: str) -> int:
    """문서와 관련된 로컬 원본 및 렌더링 캐시 파일을 삭제한다."""
    if not _SAFE_ID.match(doc_id):
        return 0

    deleted = 0

    for path in _dir().glob(f"{doc_id}.*"):
        try:
            path.unlink()
            deleted += 1
        except OSError:
            # 로컬 원본은 보조 데이터이므로
            # 일부 파일 삭제 실패가 전체 문서 삭제를 막지는 않는다.
            continue

    # 삭제 전 계산해 둔 PDF 페이지 정보가 남지 않도록 캐시도 비운다.
    _pdf_layout.cache_clear()

    return deleted
