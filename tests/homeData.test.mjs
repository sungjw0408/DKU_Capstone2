import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/utils/homeData.js", import.meta.url), "utf8");
const { upcomingDocuments, ddayLabel, planProgress } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const documents = [
  { id: "later", dday: -5, deadline: "2026-10-12", created_at: "2026-10-07T00:00:00Z" },
  { id: "today", dday: 0, deadline: "2026-10-07" },
  { id: "expired", dday: 2 }, { id: "missing", dday: null },
  { id: "tomorrow", dday: -1, deadline: "2026-10-08", created_at: "2026-10-06T00:00:00Z" },
];

test("오늘 이후 실제 마감만 임박순으로 보여주고 입력 순서는 유지한다", () => {
  assert.deepEqual(upcomingDocuments(documents).map((item) => item.id), ["today", "tomorrow", "later"]);
  assert.equal(documents[0].id, "later");
});
test("최근 등록순은 DB의 등록 시각을 사용한다", () => {
  assert.deepEqual(upcomingDocuments(documents, "recent").map((item) => item.id), ["later", "tomorrow", "today"]);
});
test("DB가 비어 있거나 마감일이 없으면 목업 항목을 넣지 않는다", () => {
  assert.deepEqual(upcomingDocuments([]), []);
  assert.deepEqual(upcomingDocuments([{ dday: null }]), []);
});
test("D-day 부호와 당일 표기를 표시한다", () => {
  assert.equal(ddayLabel(-5), "D-5");
  assert.equal(ddayLabel(0), "D-Day");
  assert.equal(ddayLabel(2), "D+2");
  assert.equal(ddayLabel(null), "미정");
});
test("최종 마감은 완료율에서 제외하고 할 일 없는 문서는 0이다", () => {
  assert.equal(planProgress({ steps: [{ done: true }, { done: false }, { isDeadline: true, done: false }] }), 0.5);
  assert.equal(planProgress({ steps: [{ isDeadline: true, done: false }] }), 0);
});
