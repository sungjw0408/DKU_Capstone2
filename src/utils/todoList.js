// 할 일 탭: 모든 문서의 할 일을 날짜 기준으로 묶는다.
// (테스트에서 파일 하나만 불러 쓸 수 있도록 다른 모듈을 import 하지 않는다)
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const validDate = (value) => (DATE_RE.test(value || "") ? value : "");

// 날짜 → 시각 → 제목 순 (시각이 없으면 같은 날 맨 뒤)
function byDate(a, b) {
  return validDate(a.date).localeCompare(validDate(b.date))
    || (a.time || "99:99").localeCompare(b.time || "99:99")
    || (a.title || "").localeCompare(b.title || "");
}

// { overdue: 지난 할 일, today: 오늘, upcoming: 다가오는, undated: 날짜 미정, done: 완료 }
export function groupTodos(todos, today = new Date()) {
  const todayKey = keyOf(today);
  const groups = { overdue: [], today: [], upcoming: [], undated: [], done: [] };
  for (const todo of todos || []) {
    const date = validDate(todo.date);
    if (todo.is_completed) groups.done.push(todo);
    else if (!date) groups.undated.push(todo);
    else if (date < todayKey) groups.overdue.push(todo);
    else if (date === todayKey) groups.today.push(todo);
    else groups.upcoming.push(todo);
  }
  groups.overdue.sort(byDate);
  groups.today.sort(byDate);
  groups.upcoming.sort(byDate);
  groups.undated.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  groups.done.sort((a, b) => byDate(b, a)); // 완료는 최근 날짜부터
  return groups;
}

// "2026-10-23" → "내일" / "10월 25일 (일)" / "날짜 미정"
export function todoDateLabel(date, today = new Date()) {
  if (!validDate(date)) return "날짜 미정";
  const [y, m, d] = date.split("-").map(Number);
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  if (diff === 0) return "오늘";
  if (diff === 1) return "내일";
  if (diff === -1) return "어제";
  return `${m}월 ${d}일 (${"일월화수목금토"[new Date(y, m - 1, d).getDay()]})`;
}
