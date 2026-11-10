"""등록된 공지의 이메일 작성에 사용할 수 있는 원문 근거와 입력 계약."""
from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas import AnalysisResult, FieldKey, SourceDocument

_EMAIL = re.compile(
    r"(?<![A-Z0-9._%+'@-])[A-Z0-9_%+'-]+(?:\.[A-Z0-9_%+'-]+)*"
    r"@(?:[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?\.)+[A-Z]{2,}(?![A-Z0-9_@-]|\.[A-Z0-9_@-])",
    re.IGNORECASE,
)
_EMAIL_WORD = r"(?:이\s*)?메일|e-?mail"
_SUBMISSION_CHANNEL = re.compile(
    rf"(?:{_EMAIL_WORD})(?:\s*(?:을\s*통해|으?로))?\s*(?:접수|제출|신청|응모|송부)"
    rf"|(?:접수|제출|신청|응모)(?:\s*(?:방법|용))?\s*[:：=]?\s*(?:{_EMAIL_WORD})"
    rf"|(?:{_EMAIL_WORD})\s*(?:접수처|제출처)",
    re.IGNORECASE,
)
_SUBMISSION_ADDRESS = re.compile(r"접수처|제출처|(?:접수|제출|신청|응모)\s*주소")
_SEND_TO = re.compile(r"[\s)\]）]*(?:으?로)\s*(?:제출|접수|송부|신청)")
_CONTACT = re.compile(r"문의|연락처|질문")
_PROHIBITION = re.compile(
    r"(?:이메일|메일|접수|제출|신청)[^,;|]{0,24}(?:불가|금지|미접수|하지\s*않|받지\s*않|안\s*됨)"
    r"|(?:문의|연락)\s*용|(?:포털|홈페이지|온라인|방문|우편)[^,;|]{0,20}(?:만\s*(?:가능|접수|신청)|접수만\s*가능)"
)
_EMAIL_PROHIBITION = re.compile(
    rf"(?:{_EMAIL_WORD})(?:\s*(?:을\s*통해|으?로(?:는)?))?\s*(?:접수|제출|신청)(?:은|는|를)?"
    r"\s*(?:불가|금지|하지\s*않|받지\s*않|안\s*됨)",
    re.IGNORECASE,
)
_SOURCE_CLAUSES = re.compile(r"[;；|]|\s+[/／]\s+|[,，]\s*(?=(?:문의|연락처|제출|접수|신청))|(?<=[.!?])\s+")
_SUBJECT = re.compile(
    r"(?:^|\s)(?:(?:이\s*)?메일\s*제목|제목\s*(?:형식|양식|예시))"
    r"(?:\s*[\[(（]?(?:형식|양식|예시)[\])）]?)?\s*(?:[:：=|]|은|는)\s*(\S.*)$"
)
_BODY = re.compile(
    r"(?:^|\s)(?:(?:이\s*)?메일\s*본문(?:\s*(?:필수\s*)?(?:기재|작성)\s*(?:사항|항목)?)?"
    r"|필수\s*(?:기재|작성)\s*(?:사항|항목)|본문\s*(?:기재|작성)\s*(?:사항|항목)?)"
    r"\s*(?:[:：=|]|은|는|에)\s*(\S.*)$"
)
_EXPLICIT_MAIL_RULE = re.compile(r"(?:이\s*)?메일\s*(?:제목|본문)")
_FIELD_LIST = re.compile(r"[,，/／·ㆍ、+|]|\s+(?:및|그리고)\s+")
_FIELD_SUFFIX = re.compile(r"\s*(?:(?:을|를)?\s*(?:반드시\s*)?(?:기재|작성|입력)(?:\s*(?:바랍니다|해\s*주세요|필수))?)[.。]?$")
_CONFIRMED = {"verified", "user_confirmed"}


def _unique(values):
    unique = {}
    for value in values:
        unique.setdefault(value.casefold(), value)
    return list(unique.values())


def _submission_emails(lines: list[str]) -> list[str]:
    if any(_EMAIL_PROHIBITION.search(line) for line in lines):
        return []
    recipients, prohibited = [], set()
    previous = ""
    for line in lines:
        heading = previous
        for clause in _SOURCE_CLAUSES.split(line):
            preceding, heading = heading, clause
            matches = list(_EMAIL.finditer(clause))
            if not matches:
                continue
            emails = [match.group() for match in matches]
            if _PROHIBITION.search(clause):
                prohibited.update(email.casefold() for email in emails)
                continue
            # '이메일로 제출' 다음 줄에 주소만 쓰는 공지도 지원한다.
            after_email = _EMAIL.sub("", clause)
            continuation = bool(re.fullmatch(
                r"[\W_]*(?:(?:이\s*)?메일|e-?mail|주소|이메일\s*주소|제출처|접수처)?[\W_]*",
                after_email, re.IGNORECASE,
            ))
            if _CONTACT.search(clause):
                continue
            if _SUBMISSION_CHANNEL.search(clause) or _SUBMISSION_ADDRESS.search(clause):
                recipients.extend(emails)
            elif (
                continuation
                and (_SUBMISSION_CHANNEL.search(preceding) or _SUBMISSION_ADDRESS.search(preceding))
                and not (_EMAIL.search(preceding) or _CONTACT.search(preceding) or _PROHIBITION.search(preceding))
            ):
                recipients.extend(emails)
            else:
                recipients.extend(match.group() for match in matches if _SEND_TO.match(clause[match.end():]))
        previous = line
    return [email for email in _unique(recipients) if email.casefold() not in prohibited]


def _contact_emails(lines: list[str]) -> set[str]:
    addresses = set()
    for index, line in enumerate(lines):
        previous = lines[index - 1] if index else ""
        for clause in _SOURCE_CLAUSES.split(line):
            if _CONTACT.search(clause) and not (
                _SUBMISSION_CHANNEL.search(clause) or _SUBMISSION_ADDRESS.search(clause)
            ):
                addresses.update(email.casefold() for email in _EMAIL.findall(clause))
        if _CONTACT.search(previous) and not _EMAIL.search(previous) and _EMAIL.fullmatch(line):
            addresses.add(line.casefold())
    return addresses


def _instructions(lines: list[str], pattern: re.Pattern) -> list[str]:
    return _unique(match.group(1).strip()[:500] for line in lines if (match := pattern.search(line)))


def _required_fields(instructions: list[str]) -> list[str]:
    fields = []
    for instruction in instructions:
        items = _FIELD_LIST.split(_FIELD_SUFFIX.sub("", instruction).strip(" .。"))
        if all(re.fullmatch(r"[가-힣A-Za-z0-9 ()·-]{1,24}", item.strip()) for item in items):
            fields.extend(item.strip() for item in items)
    return _unique(fields)[:12]


def mail_options(analysis: AnalysisResult, source: SourceDocument | None, title: str) -> dict:
    confirmed = [field for field in analysis.fields if field.status in _CONFIRMED]
    # 기존 공지도 저장된 원문에서 확인한다. 원문이 없는 레코드는 검증된 인용문만 사용한다.
    pages = source.pages if source else [
        field.evidence.matched_text or field.value for field in confirmed
        if field.key == FieldKey.SUBMISSION_METHOD
    ]
    recipients, instruction_lines, explicit_contacts = [], [], set()
    for page in pages:
        lines = [line.lstrip(" \t-–—○●■□▶▷·•※") for line in page.splitlines() if line.strip()]
        addresses = _submission_emails(lines)
        recipients.extend(addresses)
        instruction_lines.extend(line for line in lines if addresses or _EXPLICIT_MAIL_RULE.search(line))
        if addresses:
            explicit_contacts.update(_contact_emails(lines))

    submission_addresses = {email.casefold() for email in recipients}
    inquiry = _unique(
        email for field in confirmed if field.key == FieldKey.CONTACT
        for email in _EMAIL.findall(field.value)
        if email.casefold() not in submission_addresses or email.casefold() in explicit_contacts
        or field.status == "user_confirmed"
    )
    body_instructions = _instructions(instruction_lines, _BODY)
    return {
        "title": title,
        "inquiry": {"recipients": inquiry} if inquiry else None,
        "application": {
            "recipients": _unique(recipients),
            "subjectFormats": _instructions(instruction_lines, _SUBJECT),
            "bodyInstructions": body_instructions,
            "requiredFields": _required_fields(body_instructions),
            "attachments": _unique(field.value for field in confirmed if field.key == FieldKey.REQUIRED_DOCUMENT),
        } if recipients else None,
    }


class MailDraftRequest(BaseModel):
    kind: Literal["inquiry", "application"]
    recipient: str = Field(min_length=3, max_length=254)
    question: str = Field(default="", max_length=600)
    subject: str = Field(default="", max_length=500)
    answers: dict[str, str] = Field(default_factory=dict, max_length=12)
    details: str = Field(default="", max_length=1200)

    @field_validator("recipient", "question", "subject", "details")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("answers")
    @classmethod
    def validate_answers(cls, values: dict[str, str]) -> dict[str, str]:
        if any(len(value) > 200 for value in values.values()):
            raise ValueError("각 신청 항목은 200자 이하로 입력해 주세요.")
        return {key: value.strip() for key, value in values.items()}


def prepare_draft(options: dict, request: MailDraftRequest) -> tuple[str, str]:
    """주소를 다시 확인하고, 신청 정보는 모델 호출과 분리해 그대로 본문에 넣는다."""
    option = options[request.kind]
    if not option or request.recipient not in option["recipients"]:
        raise ValueError("이 공지에서 확인된 이메일을 선택해 주세요.")
    if request.kind == "inquiry":
        if not request.question:
            raise ValueError("문의 내용을 한 줄로 적어 주세요.")
        return options["title"], ""

    if option["subjectFormats"] and not request.subject:
        raise ValueError("공지의 제목 형식에 맞춰 메일 제목을 입력해 주세요.")
    fields = option["requiredFields"]
    if any(not request.answers.get(field) for field in fields):
        raise ValueError("공지에서 요구하는 신청 정보를 모두 입력해 주세요.")
    if not fields and not request.details:
        raise ValueError("메일에 넣을 신청 정보를 입력해 주세요.")
    lines = [f"{field}: {request.answers[field]}" for field in fields]
    if request.details:
        lines.append(request.details)
    return request.subject or f'[신청] {options["title"]}', "\n".join(lines)
