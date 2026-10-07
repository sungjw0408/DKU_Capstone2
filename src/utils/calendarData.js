// 캘린더 화면용: 문서 마감일과 준비 계획 할 일을 날짜(YYYY-MM-DD)별로 묶는다.
// (테스트에서 파일 하나만 불러 쓸 수 있도록 다른 모듈을 import 하지 않는다)
export function parseDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function dateKeyOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// "2026-12-31", "2026-12-31T17:00" → "2026-12-31" (형식이 틀리면 null)
export function toDateKey(value) {
  const key = typeof value === "string" ? value.slice(0, 10) : "";
  return parseDateKey(key) ? key : null;
}

export function deadlineTime(value) {
  const match = typeof value === "string" && value.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : "";
}

// { "2026-12-31": { deadlines: [문서...], todos: [할 일...] } }
export function buildCalendarEvents(documents = [], todos = []) {
  const events = {};
  const slot = (key) => (events[key] ??= { deadlines: [], todos: [] });
  documents.forEach((doc) => {
    const key = toDateKey(doc.deadline);
    if (key) slot(key).deadlines.push({ ...doc, time: deadlineTime(doc.deadline) });
  });
  todos.forEach((todo) => {
    const key = toDateKey(todo.date);
    if (key) slot(key).todos.push(todo);
  });
  Object.values(events).forEach((day) => {
    day.deadlines.sort((a, b) => (a.time || "99").localeCompare(b.time || "99") || (a.title || "").localeCompare(b.title || ""));
    day.todos.sort((a, b) => (a.time || "99").localeCompare(b.time || "99") || (a.order ?? 0) - (b.order ?? 0));
  });
  return events;
}

// 해당 달(monthIndex 0~11)의 마감 개수
export function monthDeadlineCount(events, year, monthIndex) {
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}-`;
  return Object.entries(events)
    .filter(([key]) => key.startsWith(prefix))
    .reduce((sum, [, day]) => sum + day.deadlines.length, 0);
}

// 달력 칸: 주 단위 배열, 빈 칸은 null
export function monthWeeks(year, monthIndex) {
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  return Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const day = week * 7 + weekday - firstWeekday + 1;
      return day >= 1 && day <= daysInMonth ? day : null;
    }));
}

export function dateLabel(key) {
  const date = parseDateKey(key);
  if (!date) return key;
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${"일월화수목금토"[date.getDay()]})`;
}
