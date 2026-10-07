"""사용자가 편집한 준비 계획의 저장 계약과 등록 할 일 변환."""
from __future__ import annotations

import re
from datetime import date

from pydantic import BaseModel, Field, model_validator


class PlanStep(BaseModel):
    id: str = Field(min_length=1, max_length=160, pattern=r"^[a-zA-Z0-9_-]+$")
    label: str = Field(min_length=1, max_length=500)
    date: str = ""
    time: str = ""
    durationMinutes: int | None = Field(default=None, ge=1, le=1440)
    notes: str = Field(default="", max_length=4000)
    done: bool = False
    isDeadline: bool = False
    deadlineText: str = ""

    @model_validator(mode="after")
    def validate_schedule(self):
        self.label = self.label.strip()
        if not self.label:
            raise ValueError("일정 이름을 입력해 주세요.")
        if self.date:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", self.date) or date.fromisoformat(self.date).year < 1000:
                raise ValueError("올바른 날짜를 지정해 주세요.")
        if self.time and (not self.date or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", self.time)):
            raise ValueError("날짜와 올바른 시간을 지정해 주세요.")
        if self.isDeadline:
            self.done = False
        return self


class PlanSave(BaseModel):
    steps: list[PlanStep] = Field(max_length=101)
    revision: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def validate_steps(self):
        if len({step.id for step in self.steps}) != len(self.steps):
            raise ValueError("일정 ID는 중복될 수 없습니다.")
        deadlines = [step for step in self.steps if step.isDeadline]
        if len(deadlines) != 1:
            raise ValueError("최종 마감 일정은 하나여야 합니다.")
        if deadlines[0].date and any(step.date > deadlines[0].date for step in self.steps if not step.isDeadline):
            raise ValueError("준비 일정은 최종 마감일 이전 또는 같은 날이어야 합니다.")
        self.steps.sort(key=lambda step: (step.isDeadline, not bool(step.date), step.date, step.time))
        return self


class TodoPatch(BaseModel):
    is_completed: bool


class RevisionConflict(Exception):
    pass


def todo_id(document_id: str, step_id: str) -> str:
    return f"{document_id}__{step_id}"


def plan_todos(document_id: str, title: str, plan: dict) -> list[dict]:
    return [{
        "id": todo_id(document_id, step["id"]), "document_id": document_id,
        "step_id": step["id"], "doc_title": title, "title": step["label"],
        "date": step.get("date", ""), "time": step.get("time", ""),
        "duration_minutes": step.get("durationMinutes"), "notes": step.get("notes", ""),
        "order": index, "is_completed": step.get("done", False),
        "updated_at": plan["updated_at"],
    } for index, step in enumerate(plan["steps"]) if not step.get("isDeadline")]


def document_list_item(document_id: str, record: dict, today: date) -> dict:
    from app.schemas import AnalysisResult
    from app.services.frontend_view import to_list_item

    analysis_data = record.get("analysis")
    item = to_list_item(AnalysisResult.model_validate(analysis_data), today) if analysis_data else {
        "id": document_id, "title": record.get("title", "문서"), "type": "문서", "dday": None,
    }
    plan = record.get("plan")
    if plan:
        deadline = next((step for step in plan["steps"] if step.get("isDeadline")), {})
        item["deadline"] = deadline.get("date", "") + (f'T{deadline["time"]}' if deadline.get("time") else "")
    else:
        item["deadline"] = record.get("deadline")
    try:
        item["dday"] = (today - date.fromisoformat((item["deadline"] or "").split("T")[0])).days
    except ValueError:
        item["dday"] = None
    steps = [step for step in (plan or {}).get("steps", []) if not step.get("isDeadline")]
    item.update({"created_at": record.get("created_at"), "status": record.get("status", "in_progress"),
                 "registered": bool(plan and plan.get("registered")),
                 "progress": sum(step.get("done", False) for step in steps) / len(steps) if steps else 0})
    return item
