from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import SAMPLE

client = TestClient(app)

PROSE = (
    "본교 재학생을 대상으로 2026학년도 SW인재 장학금 신청을 아래와 같이 안내합니다. "
    "신청 대상은 2026학년도 재학생이며 직전 학기 평균 평점 3.5 이상인 자에 한합니다. "
    "신청서, 성적증명서, 통장 사본을 구비하여 학생포털을 통해 제출하시기 바랍니다. "
    "접수 마감은 2026년 9월 25일 17시까지입니다."
)


def test_health():
    assert client.get("/health").json()["status"] == "ok"


def test_analyze_text_returns_frontend_shape():
    r = client.post("/api/documents/analyze", data={"text": SAMPLE})
    assert r.status_code == 200
    view = r.json()["view"]
    assert view["docType"] == "장학금 신청 공지"
    assert view["deadline"]["datetime"] == "2026-09-25T17:00"
    assert view["requiredDocs"] == ["신청서", "성적증명서", "통장 사본"]
    assert [c["text"] for c in view["applicantCriteria"]] == ["2026학년도 재학생", "직전 학기 평균 평점 3.5 이상인 자"]
    assert view["evidence"]["sourceExcerpt"]


def test_analyze_prose_notice():
    view = client.post("/api/documents/analyze", data={"text": PROSE}).json()["view"]
    assert view["deadline"]["datetime"] == "2026-09-25T17:00"
    assert set(view["requiredDocs"]) == {"신청서", "성적증명서", "통장 사본"}
    assert len(view["applicantCriteria"]) == 2


def test_notice_keeps_applicant_exclusions_and_contact_email():
    text = """장학금 신청 안내
1. 신청 대상: SW융합대학 재학생
2. 신청 불가 대상
- 편입생
- 컴퓨터공학과
3. 문의처
scholarship+sw@example.edu
"""
    r = client.post("/api/documents/analyze", data={"text": text})
    assert r.status_code == 200
    result = r.json()
    sections = {s["key"]: s["items"] for s in result["view"]["sections"]}
    assert [item["text"] for item in sections["criteria"]] == ["SW융합대학 재학생"]
    assert [item["text"] for item in sections["exclusions"]] == ["편입생", "컴퓨터공학과"]
    assert [item["text"] for item in sections["contact"]] == ["scholarship+sw@example.edu"]
    assert all(item["status"] == "verified" for item in sections["exclusions"] + sections["contact"])
    stored = client.get(f"/api/documents/{result['documentId']}").json()
    assert stored["view"]["sections"] == result["view"]["sections"]


def test_analyze_txt_upload_and_fetch_and_confirm():
    r = client.post("/api/documents/analyze",
                    files={"file": ("notice.txt", SAMPLE.encode(), "text/plain")})
    doc_id = r.json()["documentId"]
    assert client.get(f"/api/documents/{doc_id}").status_code == 200
    assert any(d["id"] == doc_id for d in client.get("/api/documents").json())

    src = client.get(f"/api/documents/{doc_id}/source").json()
    assert src["sentences"][0]["text"].startswith("2026학년도")

    fid = r.json()["analysis"]["fields"][0]["id"]
    after = client.post(f"/api/documents/{doc_id}/fields/{fid}/confirm", json={"value": "수정값"}).json()
    f = next(f for f in after["analysis"]["fields"] if f["id"] == fid)
    assert f["status"] == "user_confirmed" and f["value"] == "수정값"


def test_empty_request_rejected():
    assert client.post("/api/documents/analyze", data={}).status_code == 400


def test_image_in_mock_mode_is_501():
    r = client.post("/api/documents/analyze", files={"file": ("a.png", b"\x89PNG", "image/png")})
    assert r.status_code == 501
