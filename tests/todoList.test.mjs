import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/utils/todoList.js", import.meta.url), "utf8");
const { groupTodos, todoDateLabel } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const today = new Date(2026, 9, 22); // 2026-10-22 (월은 0부터라 9 = 10월)

test("할 일을 지난 / 오늘 / 다가오는 / 날짜 미정 / 완료로 나눈다", () => {
  const todos = [
    { id: "a", title: "지난 일", date: "2026-10-20" },
    { id: "b", title: "오늘 일", date: "2026-10-22" },
    { id: "c", title: "다음 주", date: "2026-10-29" },
    { id: "d", title: "날짜 없음", date: null },
    { id: "e", title: "끝낸 일", date: "2026-10-21", is_completed: true },
    { id: "f", title: "형식 틀림", date: "10/30" },
  ];
  const g = groupTodos(todos, today);
  assert.deepEqual(g.overdue.map((t) => t.id), ["a"]);
  assert.deepEqual(g.today.map((t) => t.id), ["b"]);
  assert.deepEqual(g.upcoming.map((t) => t.id), ["c"]);
  assert.deepEqual(g.undated.map((t) => t.id).sort(), ["d", "f"]);
  assert.deepEqual(g.done.map((t) => t.id), ["e"]);
});

test("같은 날은 시각 순, 시각이 없으면 맨 뒤", () => {
  const g = groupTodos([
    { id: "late", title: "가", date: "2026-10-25", time: "18:00" },
    { id: "none", title: "나", date: "2026-10-25" },
    { id: "early", title: "다", date: "2026-10-25", time: "09:00" },
    { id: "first", title: "라", date: "2026-10-23" },
  ], today);
  assert.deepEqual(g.upcoming.map((t) => t.id), ["first", "early", "late", "none"]);
});

test("빈 목록도 처리한다", () => {
  const g = groupTodos(undefined, today);
  assert.equal(g.overdue.length + g.today.length + g.upcoming.length + g.undated.length + g.done.length, 0);
});

test("날짜 표시는 오늘·내일·어제를 말로 보여준다", () => {
  assert.equal(todoDateLabel("2026-10-22", today), "오늘");
  assert.equal(todoDateLabel("2026-10-23", today), "내일");
  assert.equal(todoDateLabel("2026-10-21", today), "어제");
  assert.equal(todoDateLabel("2026-10-25", today), "10월 25일 (일)");
  assert.equal(todoDateLabel("", today), "날짜 미정");
});
