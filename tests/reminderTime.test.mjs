import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const planSource = await readFile(new URL("../src/utils/notificationPlan.js", import.meta.url), "utf8");
const plan = await import(`data:text/javascript;base64,${Buffer.from(planSource).toString("base64")}`);
const stored = new Map();
const storage = {
  getItem: async (key) => stored.get(key) ?? null,
  setItem: async (key, value) => stored.set(key, value),
};
globalThis.reminderTimeTest = { storage, plan };
const source = (await readFile(new URL("../src/services/notifications.js", import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "");
const mocks = `
  const Platform = { OS: "web" };
  const AsyncStorage = globalThis.reminderTimeTest.storage;
  const { buildNotificationPlan, isReminderTime, planSignature, REMINDER_HOUR, REMINDER_OFFSETS } = globalThis.reminderTimeTest.plan;
  const currentAuthUser = () => null;
`;
const { getReminderTime, setReminderTime, getReminderHour, setReminderHour } = await import(`data:text/javascript;base64,${Buffer.from(mocks + source).toString("base64")}`);

test.beforeEach(() => stored.clear());
test.after(() => delete globalThis.reminderTimeTest);

test("이전 정시 설정을 읽고 분 단위 설정은 재조회해도 유지한다", async () => {
  assert.deepEqual(await getReminderTime(), { hour: 9, minute: 0 });
  stored.set("ttokdoc.notifications.hour", "18");
  assert.deepEqual(await getReminderTime(), { hour: 18, minute: 0 });
  await setReminderTime({ hour: 0, minute: 37 });
  assert.deepEqual(await getReminderTime(), { hour: 0, minute: 37 });
  assert.equal(await getReminderHour(), 0);
  await setReminderHour(22);
  assert.deepEqual(await getReminderTime(), { hour: 22, minute: 0 });
});

test("잘못 저장된 시각을 복구하고 유효하지 않은 변경은 기존 값을 보존한다", async () => {
  stored.set("ttokdoc.notifications.time", "broken JSON");
  stored.set("ttokdoc.notifications.hour", "18");
  assert.deepEqual(await getReminderTime(), { hour: 18, minute: 0 });
  stored.set("ttokdoc.notifications.hour", "");
  assert.deepEqual(await getReminderTime(), { hour: 9, minute: 0 });
  await setReminderTime({ hour: 23, minute: 59 });
  for (const invalid of [{ hour: 24, minute: 0 }, { hour: 9, minute: 60 }, { hour: 9.5, minute: 0 }, { hour: 9, minute: -1 }]) {
    await assert.rejects(setReminderTime(invalid));
    assert.deepEqual(await getReminderTime(), { hour: 23, minute: 59 });
  }
});
