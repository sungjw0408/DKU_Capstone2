// 준비 계획의 날짜는 시간대 변환 없이 달력 날짜(YYYY-MM-DD)로 다룬다.
export function parsePlanDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1000 || year > 9999) return null;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date : null;
}

export function formatStepDate(value) {
  const date = parsePlanDate(value);
  if (!date) return value || "날짜 미정";
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${"일월화수목금토"[date.getDay()]})`;
}

export function formatDeadline(step) {
  if (!step) return "마감일 미정";
  const date = parsePlanDate(step.date);
  if (!date) return step.deadlineText || "마감일 미정";
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일${step.time ? ` ${step.time}` : ""}`;
}

export function getDday(deadline, referenceDate) {
  const due = parsePlanDate(deadline);
  const today = parsePlanDate(referenceDate);
  if (!due || !today) return "미정";
  const days = Math.round((Date.UTC(due.getFullYear(), due.getMonth(), due.getDate())
    - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  return days === 0 ? "D-Day" : days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

export function sortPlanSteps(steps) {
  return [...steps].sort((a, b) => Number(!!a.isDeadline) - Number(!!b.isDeadline)
    || Number(!a.date) - Number(!b.date)
    || (a.date || "").localeCompare(b.date || "")
    || (a.time || "").localeCompare(b.time || ""));
}

export function localPlanDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeDocumentName(value) {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9가-힣]/g, "");
}

function relatedDocumentNotes(todo, requiredDocs) {
  const action = normalizeDocumentName(todo);
  // 괄호 안의 시험 종류·발급 조건은 메모에는 유지하고 문서명 매칭에서만 제외한다.
  const namedDocs = requiredDocs.filter((doc) => {
    const name = normalizeDocumentName(doc.replace(/[（(][^）)]*[）)]/g, ""));
    const englishScore = /공인영어|영어성적|어학성적/.test(action)
      && /\b(?:TOEIC|TOEFL|OPIc|TEPS|IELTS|G-TELP)\b/i.test(doc);
    return (name.length >= 2 && action.includes(name)) || englishScore;
  });
  // 이름이 명시된 일정은 해당 서류만, 전체 서류 제출·확인 일정은 전체 목록을 연결한다.
  const docs = namedDocs.length ? namedDocs
    : /서류/.test(action) && /제출|업로드|확인|검토|준비|구비/.test(action) ? requiredDocs : [];
  return docs.length ? `필요 서류: ${docs.join(", ")}` : "";
}

// view는 근거 검증·사용자 확인을 반영한 API 응답이다. 준비 날짜와 소요시간은 생성하지 않는다.
export function createDocumentPlan({ documentId, view, analysis } = {}, today = localPlanDate()) {
  const requiredDocs = [...new Set((view?.requiredDocs || [])
    .filter((doc) => typeof doc === "string" && doc.trim()).map((doc) => doc.trim()))];
  const steps = (view?.todos || []).filter((todo) => todo.text?.trim()).map((todo, index) => ({
    id: `document-todo-${todo.id || index}`,
    label: todo.text.trim(), date: "", time: "", durationMinutes: null,
    notes: relatedDocumentNotes(todo.text, requiredDocs), done: false,
  }));
  if (view) {
    const iso = view.deadline?.datetime || "";
    const [datePart, timePart = ""] = iso.split("T");
    const date = parsePlanDate(datePart) ? datePart : "";
    const time = date && /^([01]\d|2[0-3]):[0-5]\d$/.test(timePart) ? timePart : "";
    steps.push({
      id: "document-deadline", label: "최종 마감", date, time,
      deadlineText: view.deadline?.text || "", durationMinutes: null, notes: "", done: false, isDeadline: true,
    });
  }
  return {
    id: documentId || view?.id || analysis?.document_id || "missing-document",
    title: view?.title || analysis?.title || "문서 준비 계획",
    referenceDate: today, isMock: false, hasAnalysis: !!view,
    requiredDocs,
    steps: sortPlanSteps(steps),
  };
}

export function formatDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return [hours ? `${hours}시간` : "", minutes ? `${minutes}분` : ""].filter(Boolean).join(" ");
}

export function durationFromParts(hours, minutes) {
  const h = hours.trim();
  const m = minutes.trim();
  if (!h && !m) return null;
  if ((h && !/^\d+$/.test(h)) || (m && !/^\d+$/.test(m))) return NaN;
  if (Number(h) > 24 || Number(m) > 59) return NaN;
  const total = Number(h) * 60 + Number(m);
  return total > 0 && total <= 1440 ? total : NaN;
}

export function validatePlanStep(form, steps, editingId, allowUndated = false) {
  if (!form.label.trim()) return "일정 이름을 입력해 주세요.";
  const date = form.date.trim();
  if ((!date && !allowUndated) || (date && !parsePlanDate(date))) return "달력에서 날짜를 선택해 주세요.";
  if (!date && form.time.trim()) return "시간을 지정하려면 먼저 날짜를 선택해 주세요.";
  if (form.time.trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time.trim())) {
    return "시간 선택에서 시와 분을 다시 선택해 주세요.";
  }
  if (Number.isNaN(durationFromParts(form.durationHours, form.durationMinutes))) {
    return "예상 소요시간은 1분~24시간이며, 분은 0~59로 입력해 주세요.";
  }
  const deadline = steps.find((step) => step.isDeadline);
  if (date && deadline?.date && editingId !== deadline.id && date > deadline.date) {
    return "준비 일정은 최종 마감일 이전 또는 같은 날로 지정해 주세요.";
  }
  if (date && deadline && editingId === deadline.id
    && steps.some((step) => !step.isDeadline && step.date && step.date > date)) {
    return "최종 마감일은 준비 일정 이후 또는 같은 날로 지정해 주세요.";
  }
  return "";
}
