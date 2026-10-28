import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/utils/notificationPlan.js", import.meta.url), "utf8");
const { buildNotificationPlan, planSignature, MAX_SCHEDULED, hourLabel } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const now = new Date(2026, 9, 23, 10, 0); // 2026-10-23 오전 10시
const at = (iso) => new Date(`${iso}T09:00:00`).getTime(); // 그날 오전 9시 (현지 시각)

test("등록한 문서는 마감 D-3, D-1, 당일 오전 9시에 알린다", () => {
  const plan = buildNotificationPlan([
    { id: "a", title: "SW인재 장학금", registered: true, progress: 0.5, deadline: "2026-11-25T17:00" },
  ], [], now);
  assert.deepEqual(plan.map((i) => i.id), ["doc:a:d3", "doc:a:d1", "doc:a:d0"]);
  assert.deepEqual(plan.map((i) => i.date.getTime()), [at("2026-11-22"), at("2026-11-24"), at("2026-11-25")]);
  assert.equal(plan[0].title, "마감 3일 전: SW인재 장학금");
  assert.equal(plan[0].body, "11월 25일 17:00 마감이에요. 준비 상황을 확인해 보세요.");
  assert.equal(plan[2].title, "오늘 마감: SW인재 장학금");
  assert.equal(plan[0].data.documentId, "a");
});

test("등록 전 문서, 다 끝낸 문서, 마감일 없는 문서는 알리지 않는다", () => {
  const plan = buildNotificationPlan([
    { id: "draft", title: "등록 전", registered: false, deadline: "2026-11-25" },
    { id: "done", title: "다 끝냄", registered: true, progress: 1, deadline: "2026-11-25" },
    { id: "none", title: "마감 미정", registered: true, progress: 0, deadline: "" },
  ], [], now);
  assert.deepEqual(plan, []);
});

test("이미 지난 시각은 건너뛴다 (내일 마감이면 D-1과 당일만, 오늘 9시는 이미 지남)", () => {
  const plan = buildNotificationPlan([
    { id: "b", title: "내일 마감", registered: true, progress: 0, deadline: "2026-10-24" },
    { id: "c", title: "오늘 마감", registered: true, progress: 0, deadline: "2026-10-23" },
  ], [], now);
  assert.deepEqual(plan.map((i) => i.id), ["doc:b:d0"]);
});

test("할 일은 그날 아침 9시, 같은 날은 하나로 묶는다", () => {
  const docs = [{ id: "a", title: "장학금", registered: true, progress: 0.2, deadline: "" }];
  const plan = buildNotificationPlan(docs, [
    { id: "t1", title: "추천서 받기", date: "2026-10-27", time: "14:00", document_id: "a", doc_title: "장학금" },
    { id: "t2", title: "재학증명서 발급", date: "2026-10-28", document_id: "a", doc_title: "장학금" },
    { id: "t3", title: "신청서 작성", date: "2026-10-28", time: "10:00", document_id: "a", doc_title: "장학금" },
    { id: "t4", title: "끝낸 일", date: "2026-10-29", document_id: "a", is_completed: true },
    { id: "t5", title: "날짜 없음", date: null, document_id: "a" },
    { id: "t6", title: "지운 문서의 할 일", date: "2026-10-30", document_id: "deleted" },
  ], now);
  assert.deepEqual(plan.map((i) => i.id), ["todo:2026-10-27", "todo:2026-10-28"]);
  assert.equal(plan[0].title, "오늘 할 일: 추천서 받기");
  assert.equal(plan[0].body, "장학금 · 14:00");
  assert.equal(plan[1].title, "오늘 할 일 2개");
  assert.equal(plan[1].body, "· 신청서 작성\n· 재학증명서 발급");
  assert.equal(plan[1].date.getTime(), at("2026-10-28"));
});

test("예약은 가까운 순으로 최대 60개", () => {
  const docs = Array.from({ length: 30 }, (_, i) => ({
    id: `d${i}`, title: `문서${i}`, registered: true, progress: 0,
    deadline: `2026-12-${String(i + 1).padStart(2, "0")}`,
  }));
  const plan = buildNotificationPlan(docs, [], now);
  assert.equal(plan.length, MAX_SCHEDULED);
  for (let i = 1; i < plan.length; i++) assert.ok(plan[i - 1].date <= plan[i].date);
});

test("같은 데이터면 같은 서명, 마감일을 바꾸면 서명도 바뀐다", () => {
  const doc = { id: "a", title: "x", registered: true, progress: 0, deadline: "2026-11-25" };
  const s1 = planSignature(buildNotificationPlan([doc], [], now));
  assert.equal(s1, planSignature(buildNotificationPlan([{ ...doc }], [], now)));
  assert.notEqual(s1, planSignature(buildNotificationPlan([{ ...doc, deadline: "2026-11-26" }], [], now)));
});

test("설정에서 고른 알림 시각으로 예약한다", () => {
  const plan = buildNotificationPlan(
    [{ id: "a", title: "x", registered: true, progress: 0, deadline: "2026-11-25" }],
    [{ id: "t", title: "할 일", date: "2026-10-30", document_id: "a" }],
    now, { hour: 18 },
  );
  for (const item of plan) assert.equal(item.date.getHours(), 18);
  // 오늘 오후 6시는 아직 안 지났으니 오늘 마감 문서도 당일 알림이 잡힌다
  const today = buildNotificationPlan([{ id: "c", title: "오늘", registered: true, progress: 0, deadline: "2026-10-23" }], [], now, { hour: 18 });
  assert.deepEqual(today.map((i) => i.id), ["doc:c:d0"]);
});

test("알림 시각 표시", () => {
  assert.equal(hourLabel(9), "오전 9시");
  assert.equal(hourLabel(12), "낮 12시");
  assert.equal(hourLabel(18), "오후 6시");
});
