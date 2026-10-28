// 마감 알림 계획: 어떤 알림을 언제 보낼지 계산만 한다 (실제 예약은 services/notifications.js).
// (테스트에서 파일 하나만 불러 쓸 수 있도록 다른 모듈을 import 하지 않는다)
//
// 규칙
// - 계획을 등록한 문서: 마감 D-3, D-1, 당일 알림 시각(기본 오전 9시, 설정에서 변경)
// - 할 일: 날짜가 있으면 그날 알림 시각 (같은 날 할 일이 여러 개면 한 번에 묶어서)
// - 할 일을 모두 끝낸 문서, 지운 문서, 완료한 할 일, 이미 지난 시각은 알리지 않음
// - iOS는 예약 알림을 64개까지만 보관해서, 가까운 순으로 60개까지만 예약
export const REMINDER_HOUR = 9;
// 설정 화면에서 고를 수 있는 알림 시각
export const REMINDER_HOURS = [7, 8, 9, 12, 18, 21];
export const MAX_SCHEDULED = 60;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

// "2026-11-25" 또는 "2026-11-25T17:00" → 그날 알림 시각 (형식이 틀리면 null)
function morningOf(value, hour) {
  const m = DATE_RE.exec(value || "");
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, 0, 0, 0);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

const timeOf = (deadline) => (String(deadline || "").split("T")[1] || "").slice(0, 5);
const isDone = (doc) => !!doc?.registered && (doc.progress || 0) >= 1;

export function buildNotificationPlan(documents, todos, now = new Date(), { hour = REMINDER_HOUR } = {}) {
  const items = [];
  const activeIds = new Set();

  for (const doc of documents || []) {
    if (!doc?.registered || isDone(doc)) continue;
    activeIds.add(doc.id);
    const day = morningOf(doc.deadline, hour);
    if (!day) continue;
    const time = timeOf(doc.deadline);
    const when = `${day.getMonth() + 1}월 ${day.getDate()}일${time ? ` ${time}` : ""}`;
    for (const offset of [3, 1, 0]) {
      const date = addDays(day, -offset);
      if (date <= now) continue;
      items.push({
        id: `doc:${doc.id}:d${offset}`,
        date,
        title: offset === 0 ? `오늘 마감: ${doc.title}` : `마감 ${offset}일 전: ${doc.title}`,
        body: offset === 0
          ? `오늘${time ? ` ${time}` : ""}까지예요. 남은 준비를 확인해 보세요.`
          : `${when} 마감이에요. 준비 상황을 확인해 보세요.`,
        data: { kind: "deadline", documentId: doc.id, documentTitle: doc.title },
      });
    }
  }

  // 같은 날 할 일은 한 알림으로 묶는다
  const byDay = new Map();
  for (const todo of todos || []) {
    if (todo?.is_completed) continue;
    if (todo.document_id && !activeIds.has(todo.document_id)) continue; // 지운 문서·끝낸 문서
    const date = morningOf(todo.date, hour);
    if (!date || date <= now) continue;
    const key = todo.date.slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, { date, todos: [] });
    byDay.get(key).todos.push(todo);
  }
  for (const [key, { date, todos: list }] of byDay) {
    list.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99") || (a.title || "").localeCompare(b.title || ""));
    const first = list[0];
    const single = list.length === 1;
    items.push({
      id: `todo:${key}`,
      date,
      title: single ? `오늘 할 일: ${first.title}` : `오늘 할 일 ${list.length}개`,
      body: single
        ? `${first.doc_title || "준비 계획"}${first.time ? ` · ${first.time}` : ""}`
        : list.slice(0, 3).map((t) => `· ${t.title}`).join("\n") + (list.length > 3 ? `\n외 ${list.length - 3}개` : ""),
      data: single
        ? { kind: "todo", documentId: first.document_id, documentTitle: first.doc_title }
        : { kind: "todo" },
    });
  }

  items.sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
  return items.slice(0, MAX_SCHEDULED);
}

// 예약 내용이 그대로면 다시 예약하지 않으려고 비교하는 값
export function planSignature(items) {
  return (items || []).map((i) => `${i.id}@${i.date.getTime()}|${i.title}|${i.body}`).join("\n");
}

// 9 → "오전 9시", 18 → "오후 6시", 12 → "낮 12시"
export function hourLabel(hour) {
  if (hour === 12) return "낮 12시";
  if (hour === 0) return "자정";
  return hour < 12 ? `오전 ${hour}시` : `오후 ${hour - 12}시`;
}
