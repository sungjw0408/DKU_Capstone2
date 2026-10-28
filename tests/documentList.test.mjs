import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/utils/documentList.js", import.meta.url), "utf8");
const { documentStatus, filterDocuments, documentCounts, deadlineLabel, matchesQuery } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const docs = [
  { id: "soon", title: "SW인재 장학금 신청", dday: -2, registered: true, progress: 0.5, created_at: "2026-10-01T00:00:00Z" },
  { id: "far", title: "교환학생 선발 공고", dday: -30, registered: false, progress: 0, created_at: "2026-10-05T00:00:00Z" },
  { id: "none", title: "학점포기 제도 안내", dday: null, registered: false, progress: 0, created_at: "2026-10-03T00:00:00Z" },
  { id: "late1", title: "수강신청 철회", dday: 3, registered: true, progress: 0.2, created_at: "2026-09-01T00:00:00Z" },
  { id: "late2", title: "조기졸업 신청", dday: 10, registered: false, progress: 0, created_at: "2026-09-02T00:00:00Z" },
  { id: "done", title: "국가장학금 2차", dday: 5, registered: true, progress: 1, created_at: "2026-08-01T00:00:00Z" },
];

test("상태: 다 끝낸 등록 문서는 완료, 마감이 지나면 마감 지남, 나머지는 진행 중", () => {
  assert.equal(documentStatus(docs[0]), "active");
  assert.equal(documentStatus(docs[2]), "active");
  assert.equal(documentStatus(docs[3]), "overdue");
  assert.equal(documentStatus(docs[5]), "done"); // 마감이 지났어도 다 끝냈으면 완료
  assert.equal(documentStatus({ dday: 0 }), "active"); // 오늘 마감(D-Day)은 진행 중
});

test("필터별로 나누고, 진행 중은 마감이 가까운 순(미정은 맨 뒤)", () => {
  assert.deepEqual(filterDocuments(docs, { filter: "active" }).map((d) => d.id), ["soon", "far", "none"]);
  assert.deepEqual(filterDocuments(docs, { filter: "overdue" }).map((d) => d.id), ["late1", "late2"]);
  assert.deepEqual(filterDocuments(docs, { filter: "done" }).map((d) => d.id), ["done"]);
  assert.deepEqual(filterDocuments(docs).map((d) => d.id), ["soon", "far", "none", "late1", "late2", "done"]);
});

test("제목 검색은 띄어쓰기와 대소문자를 무시한다", () => {
  assert.ok(matchesQuery(docs[0], "sw 인재"));
  assert.ok(matchesQuery(docs[0], "  "));
  assert.deepEqual(filterDocuments(docs, { query: "장학금" }).map((d) => d.id), ["soon", "done"]);
  assert.deepEqual(filterDocuments(docs, { query: "없는제목" }), []);
});

test("필터 칩 개수는 검색어를 반영한다", () => {
  assert.deepEqual(documentCounts(docs), { all: 6, active: 3, overdue: 2, done: 1 });
  assert.deepEqual(documentCounts(docs, "신청"), { all: 3, active: 1, overdue: 2, done: 0 });
});

test("마감 표시", () => {
  assert.equal(deadlineLabel("2026-11-25T17:00"), "11월 25일 17:00 마감");
  assert.equal(deadlineLabel("2026-11-25"), "11월 25일 마감");
  assert.equal(deadlineLabel(""), "마감일 미정");
});
