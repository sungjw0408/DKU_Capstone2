import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/utils/todoManagement.js", import.meta.url), "utf8");
const { splitDeadline, daysUntil, isOverdue, nextTodo, googleCalendarUrl } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const today = new Date(2026, 8, 20); // 2026-09-20 (월은 0부터라 8 = 9월)

test("마감 문자열을 날짜와 시각으로 나눈다", () => {
  assert.deepEqual(splitDeadline("2026-09-25T17:00"), { date: "2026-09-25", time: "17:00" });
  assert.deepEqual(splitDeadline("2026-09-25"), { date: "2026-09-25", time: "" });
  assert.equal(splitDeadline(""), null);
});

test("남은 일수와 기한 지남", () => {
  assert.equal(daysUntil("2026-09-25", today), 5);
  assert.equal(daysUntil("2026-09-19", today), -1);
  assert.equal(isOverdue({ date: "2026-09-19", is_completed: false }, today), true);
  assert.equal(isOverdue({ date: "2026-09-19", is_completed: true }, today), false);
  assert.equal(isOverdue({ date: "", is_completed: false }, today), false);
});

test("다음 할 일은 안 한 일 중 날짜가 가장 빠른 것, 날짜 미정은 뒤로", () => {
  const todos = [
    { id: "a", date: "", order: 0, is_completed: false },
    { id: "b", date: "2026-09-24", order: 1, is_completed: false },
    { id: "c", date: "2026-09-22", order: 2, is_completed: true },
  ];
  assert.equal(nextTodo(todos).id, "b");
  assert.equal(nextTodo([{ id: "x", is_completed: true }]), null);
});

test("Google 캘린더 주소: 시각이 있으면 소요시간만큼, 없으면 하루 종일", () => {
  const timed = googleCalendarUrl({ title: "학생포털 제출", date: "2026-09-25", time: "17:00", durationMinutes: 30 });
  assert.match(timed, /dates=20260925T170000\/20260925T173000/);
  const allDay = googleCalendarUrl({ title: "성적증명서 발급", date: "2026-09-30" });
  assert.match(allDay, /dates=20260930\/20261001/);
  assert.equal(googleCalendarUrl({ title: "날짜 미정", date: "" }), null);
});