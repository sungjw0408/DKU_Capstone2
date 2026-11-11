from fastapi.testclient import TestClient
import pytest

from app.api import authn, routes
from app.llm.mock import MockProvider
from app.main import app
from app.services import store


NOTICE = """대학생 연구 장학금 신청 안내
제출 서류: 신청서, 재학증명서
접수 방법: 이메일 제출
apply+student@example.edu
메일 제목: [장학금] 성명_학번
메일 본문에 성명, 학번, 소속 학과를 기재해 주세요.
문의처: help@example.edu
"""


@pytest.fixture
def mail_client(monkeypatch):
    monkeypatch.setattr(store, "_user_memory_stores", {})
    monkeypatch.setattr(authn, "verify_token", lambda token: {
        "uid": token, "firebase": {"sign_in_provider": "password" if token == "password-user" else "google.com"},
    })
    calls = []

    class RecordingProvider(MockProvider):
        def draft_mail(self, kind, title, question):
            calls.append((kind, title, question))
            return super().draft_mail(kind, title, question)

    monkeypatch.setattr(routes, "get_llm", RecordingProvider)
    return TestClient(app, headers={"Authorization": "Bearer owner"}), calls


def _analyze(client, text):
    response = client.post("/api/documents/analyze", data={"text": text})
    assert response.status_code == 200, response.text
    return response.json()["documentId"]


def _register(client, doc_id):
    response = client.post(f"/api/documents/{doc_id}/plan/register", json={
        "steps": [
            {"id": "prepare", "label": "신청서 작성", "date": "2070-09-24"},
            {"id": "deadline", "label": "최종 마감", "date": "2070-09-25", "isDeadline": True},
        ],
        "revision": 0,
    })
    assert response.status_code == 200, response.text


def test_registered_notice_keeps_contact_and_submission_separate(mail_client):
    client, calls = mail_client
    doc_id = _analyze(client, NOTICE)
    options_path = f"/api/documents/{doc_id}/mail-options"
    draft_path = f"/api/mail-drafts/{doc_id}"
    inquiry = {"kind": "inquiry", "recipient": "help@example.edu", "question": "재학증명서 발급일 기준이 있나요?"}

    assert TestClient(app).get(options_path).status_code == 401
    assert TestClient(app).post(draft_path, json=inquiry).status_code == 401
    assert client.get(options_path).status_code == 409
    assert client.post(draft_path, json=inquiry).status_code == 409
    _register(client, doc_id)
    options = client.get(options_path).json()
    assert options["inquiry"]["recipients"] == ["help@example.edu"]
    assert options["application"] == {
        "recipients": ["apply+student@example.edu"],
        "subjectFormats": ["[장학금] 성명_학번"],
        "bodyInstructions": ["성명, 학번, 소속 학과를 기재해 주세요."],
        "requiredFields": ["성명", "학번", "소속 학과"],
        "attachments": ["신청서", "재학증명서"],
    }
    assert client.post(draft_path, json={**inquiry, "recipient": "apply+student@example.edu"}).status_code == 422
    assert client.post(draft_path, json=inquiry, headers={"Authorization": "Bearer other"}).status_code == 404
    assert client.post(draft_path, json=inquiry, headers={"Authorization": "Bearer password-user"}).status_code == 403
    assert not calls

    draft = client.post(draft_path, json=inquiry).json()
    assert draft["recipient"] == "help@example.edu"
    assert draft["subject"] == options["title"]
    assert inquiry["question"] in draft["body"]
    assert calls.pop() == ("inquiry", options["title"], inquiry["question"])

    application = {
        "kind": "application", "recipient": "apply+student@example.edu", "subject": "[장학금] 테스트_20261111",
        "answers": {"성명": "테스트", "학번": "20261111", "소속 학과": "컴퓨터공학과"},
    }
    assert client.post(draft_path, json={**application, "subject": ""}).status_code == 422
    assert client.post(draft_path, json={**application, "answers": {}}).status_code == 422
    assert client.post(draft_path, json={**application, "recipient": "help@example.edu"}).status_code == 422
    assert not calls

    draft = client.post(draft_path, json=application).json()
    assert draft["subject"] == application["subject"]
    assert draft["recipient"] == application["recipient"]
    assert "성명: 테스트\n학번: 20261111\n소속 학과: 컴퓨터공학과" in draft["body"]
    assert calls == [("application", options["title"], "")]


@pytest.mark.parametrize("method", [
    "접수 방법: 학생포털에서 온라인 신청\nhelp@example.edu",
    "접수 방법: 학생포털에서 온라인 신청\n문의처: help@example.edu",
    "이메일 접수 불가\n제출처: help@example.edu",
    "이메일 접수 불가 (help@example.edu)",
    "신청 마감: 11월 30일\n이메일: help@example.edu",
    "기타 문의\nhelp@example.edu로 보내 주세요.",
])
def test_contact_or_prohibited_email_does_not_enable_application(mail_client, method):
    client, calls = mail_client
    doc_id = _analyze(client, f"장학금 신청 안내\n{method}\n문의처: help@example.edu")
    _register(client, doc_id)
    options = client.get(f"/api/documents/{doc_id}/mail-options").json()
    assert options["inquiry"] == {"recipients": ["help@example.edu"]}
    assert options["application"] is None
    response = client.post(f"/api/mail-drafts/{doc_id}", json={
        "kind": "application", "recipient": "help@example.edu", "details": "신청합니다.",
    })
    assert response.status_code == 422
    assert not calls


def test_shared_line_does_not_offer_submission_address_for_inquiries(mail_client):
    client, _ = mail_client
    text = "장학금 신청 안내\n제출 방법: 이메일 접수 apply@example.edu, 문의처: help@example.edu"
    doc_id = _analyze(client, text)
    _register(client, doc_id)
    options = client.get(f"/api/documents/{doc_id}/mail-options").json()
    assert options["inquiry"]["recipients"] == ["help@example.edu"]
    assert options["application"]["recipients"] == ["apply@example.edu"]


def test_email_submission_also_allows_inquiry_without_separate_contact(mail_client):
    client, calls = mail_client
    doc_id = _analyze(client, "유니폼 디자인 공모\n이메일로 제출: apply@example.edu\n메일 제목: 공모전_성명")
    _register(client, doc_id)

    options = client.get(f"/api/documents/{doc_id}/mail-options").json()
    assert options["inquiry"] == {"recipients": ["apply@example.edu"], "usesSubmissionRecipient": True}
    assert options["application"]["recipients"] == ["apply@example.edu"]
    request = {"kind": "inquiry", "recipient": "apply@example.edu", "question": "팀으로 응모해도 되나요?"}
    response = client.post(f"/api/mail-drafts/{doc_id}", json=request)
    assert response.status_code == 200, response.text
    assert response.json()["recipient"] == "apply@example.edu"
    assert request["question"] in response.json()["body"]
    assert calls == [("inquiry", options["title"], request["question"])]


def test_mail_rules_can_be_written_in_a_table(mail_client):
    client, _ = mail_client
    text = (
        "장학금 신청 안내\n제출처 | apply@example.edu\n"
        "메일 제목 | [장학금] 성명\n메일 본문 | 성명 | 학번"
    )
    doc_id = _analyze(client, text)
    _register(client, doc_id)
    application = client.get(f"/api/documents/{doc_id}/mail-options").json()["application"]
    assert application["recipients"] == ["apply@example.edu"]
    assert application["subjectFormats"] == ["[장학금] 성명"]
    assert application["requiredFields"] == ["성명", "학번"]
