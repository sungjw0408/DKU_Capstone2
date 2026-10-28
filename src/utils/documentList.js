// 문서 목록: 상태 나누기(진행 중 / 마감 지남 / 완료), 제목 검색, 정렬.
// (테스트에서 파일 하나만 불러 쓸 수 있도록 다른 모듈을 import 하지 않는다)
// 서버의 dday는 "오늘 - 마감일"이라 마감 전이면 음수(D-5 → -5), 지나면 양수다.

export const DOCUMENT_FILTERS = [
  ["all", "전체"],
  ["active", "진행 중"],
  ["overdue", "마감 지남"],
  ["done", "완료"],
];

// 완료: 계획을 등록했고 할 일을 모두 끝냄 / 마감 지남: 완료 전인데 마감일이 지남 / 나머지는 진행 중
export function documentStatus(doc) {
  if (doc?.registered && (doc.progress || 0) >= 1) return "done";
  if (typeof doc?.dday === "number" && doc.dday > 0) return "overdue";
  return "active";
}

// 띄어쓰기·대소문자를 무시하고 제목에 검색어가 들어 있는지
const normalize = (text) => String(text || "").toLowerCase().replace(/\s+/g, "");
export function matchesQuery(doc, query) {
  const q = normalize(query);
  return !q || normalize(doc?.title).includes(q);
}

const created = (doc) => Date.parse(doc?.created_at) || 0;

// 진행 중: 마감이 가까운 순(마감일 없으면 맨 뒤) / 마감 지남: 최근에 지난 순 / 완료: 최근에 올린 순
function compare(a, b) {
  const sa = documentStatus(a);
  const sb = documentStatus(b);
  const order = { active: 0, overdue: 1, done: 2 };
  if (sa !== sb) return order[sa] - order[sb];
  if (sa === "done") return created(b) - created(a);
  const da = typeof a.dday === "number" ? a.dday : null;
  const db = typeof b.dday === "number" ? b.dday : null;
  if (da === null || db === null) return (da === null) - (db === null) || created(b) - created(a);
  if (sa === "overdue") return da - db || created(b) - created(a);
  return db - da || created(b) - created(a); // -2(D-2)가 -10(D-10)보다 먼저
}

export function filterDocuments(documents, { query = "", filter = "all" } = {}) {
  return (documents || [])
    .filter((doc) => matchesQuery(doc, query))
    .filter((doc) => filter === "all" || documentStatus(doc) === filter)
    .sort(compare);
}

// 필터 칩에 보여줄 개수 (검색어는 반영)
export function documentCounts(documents, query = "") {
  const counts = { all: 0, active: 0, overdue: 0, done: 0 };
  for (const doc of documents || []) {
    if (!matchesQuery(doc, query)) continue;
    counts.all += 1;
    counts[documentStatus(doc)] += 1;
  }
  return counts;
}

// "2026-11-25T17:00" → "11월 25일 17:00 마감" / 없으면 "마감일 미정"
export function deadlineLabel(deadline) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}))?/.exec(deadline || "");
  if (!m) return "마감일 미정";
  return `${Number(m[2])}월 ${Number(m[3])}일${m[4] ? ` ${m[4]}` : ""} 마감`;
}
