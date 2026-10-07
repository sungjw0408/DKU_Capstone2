import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/utils/calendarData.js", import.meta.url), "utf8");
const { toDateKey, deadlineTime, buildCalendarEvents, monthDeadlineCount, monthWeeks, dateLabel } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("마감일 문자열에서 날짜와 시간을 꺼낸다", () => {
  assert.equal(toDateKey("2026-12-31T17:00"), "2026-12-31");
  assert.equal(toDateKey("2026-12-31"), "2026-12-31");
  assert.equal(toDateKey("2026-02-30"), null);
  assert.equal(toDateKey(""), null);
  assert.equal(toDateKey(null), null);
  assert.equal(deadlineTime("2026-12-31T17:00"), "17:00");
  assert.equal(deadlineTime("2026-12-31"), "");
});

test("문서 마감과 할 일을 날짜별로 묶는다", () => {
  const events = buildCalendarEvents(
    [
      { id: "a", title: "장학금", deadline: "2026-10-20T17:00" },
      { id: "b", title: "공모전", deadline: "2026-10-20" },
      { id: "c", title: "마감 없음", deadline: null },
      { id: "d", title: "다음 달", deadline: "2026-11-02" },
    ],
    [
      { id: "t2", title: "신청서 작성", date: "2026-10-18", order: 1 },
      { id: "t1", title: "성적증명서 발급", date: "2026-10-18", order: 0 },
      { id: "t3", title: "날짜 미정", date: "" },
    ],
  );
  assert.deepEqual(Object.keys(events).sort(), ["2026-10-18", "2026-10-20", "2026-11-02"]);
  assert.deepEqual(events["2026-10-20"].deadlines.map((d) => d.id), ["a", "b"]); // 시간 있는 마감 먼저
  assert.equal(events["2026-10-20"].deadlines[0].time, "17:00");
  assert.deepEqual(events["2026-10-18"].todos.map((t) => t.id), ["t1", "t2"]);
  assert.equal(monthDeadlineCount(events, 2026, 9), 2);
  assert.equal(monthDeadlineCount(events, 2026, 10), 1);
});

test("달력 칸과 날짜 표시", () => {
  const weeks = monthWeeks(2026, 9); // 2026년 10월: 목요일 시작, 31일
  assert.equal(weeks[0].indexOf(1), 4);
  assert.equal(weeks.flat().filter(Boolean).length, 31);
  assert.equal(dateLabel("2026-10-07"), "10월 7일 (수)");
});
