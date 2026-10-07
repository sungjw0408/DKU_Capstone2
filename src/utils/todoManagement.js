// 등록 후 관리 화면에서 쓰는 날짜·할 일 계산과 Google 캘린더 주소 만들기.

const pad = (n) => String(n).padStart(2, "0");

// "2026-09-25" → [2026, 9, 25] (형식이 틀리면 null)
function dateParts(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

// "2026-09-25T17:00" → { date: "2026-09-25", time: "17:00" }
export function splitDeadline(value) {
  if (!value) return null;
  const [date, time = ""] = String(value).split("T");
  return dateParts(date) ? { date, time: time.slice(0, 5) } : null;
}

// 오늘부터 그 날짜까지 남은 일수 (지났으면 음수, 날짜가 없으면 null)
export function daysUntil(dateValue, today = new Date()) {
  const p = dateParts(dateValue);
  if (!p) return null;
  const due = Date.UTC(p[0], p[1] - 1, p[2]);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due - base) / 86400000);
}

// 날짜가 지났는데 아직 안 한 할 일
export function isOverdue(todo, today = new Date()) {
  const left = daysUntil(todo.date, today);
  return !todo.is_completed && left !== null && left < 0;
}

// 아직 안 한 할 일 중 가장 먼저 해야 할 것 (날짜 미정은 뒤로)
export function nextTodo(todos) {
  return todos
    .filter((t) => !t.is_completed)
    .sort((a, b) =>
      (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99") || (a.order ?? 0) - (b.order ?? 0))[0] ?? null;
}

// Google 캘린더의 '일정 만들기' 화면을 미리 채워서 여는 주소 (로그인·서버 연동 불필요)
// 시각이 있으면 그 시각부터 소요시간(없으면 1시간)만큼, 없으면 하루 종일 일정
export function googleCalendarUrl({ title, date, time = "", durationMinutes = null, details = "" }) {
  const p = dateParts(date);
  if (!p) return null;
  const [y, mo, d] = p;
  let dates;
  if (/^\d{2}:\d{2}$/.test(time || "")) {
    const [h, mi] = time.split(":").map(Number);
    const start = new Date(y, mo - 1, d, h, mi);
    const end = new Date(start.getTime() + (durationMinutes || 60) * 60000);
    const stamp = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
    dates = `${stamp(start)}/${stamp(end)}`;
  } else {
    const ymd = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`;
    dates = `${ymd(new Date(y, mo - 1, d))}/${ymd(new Date(y, mo - 1, d + 1))}`;
  }
  return "https://calendar.google.com/calendar/render?action=TEMPLATE"
    + `&text=${encodeURIComponent(title)}&dates=${dates}`
    + `&details=${encodeURIComponent(details)}&ctz=Asia%2FSeoul`;
}