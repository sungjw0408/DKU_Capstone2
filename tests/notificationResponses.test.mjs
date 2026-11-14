import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const stored = new Map([["ttokdoc.notifications.enabled", "off"]]);
let receive;
let finishColdRead;
let cleared = 0;
const user = { uid: "current" };

globalThis.notificationTest = {
  currentAuthUser: () => user,
  AsyncStorage: {
    getItem: async (key) => stored.get(key) ?? null,
    setItem: async (key, value) => { stored.set(key, value); },
  },
  AppState: { addEventListener: () => ({ remove() {} }) },
  Notifications: {
    DEFAULT_ACTION_IDENTIFIER: "default",
    setNotificationHandler() {},
    getAllScheduledNotificationsAsync: async () => [],
    getPresentedNotificationsAsync: async () => [],
    addNotificationReceivedListener() { return { remove() {} }; },
    addNotificationResponseReceivedListener(listener) {
      receive = listener;
      return { remove() { receive = undefined; } };
    },
    getLastNotificationResponseAsync: () => new Promise((resolve) => { finishColdRead = resolve; }),
    clearLastNotificationResponseAsync: async () => { cleared += 1; },
  },
};

const source = (await readFile(new URL("../src/services/notifications.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/gm, "");
const mocks = [
  "const { Notifications, AppState, AsyncStorage, currentAuthUser } = globalThis.notificationTest;",
  "const Platform = { OS: 'ios' };",
  "const onDataChanged = () => () => {};",
  "const REMINDER_OFFSETS = [3, 1, 0];",
].join("\n");
const { startDeadlineNotifications, getReminderOffsets, getNotificationHistory } = await import(
  "data:text/javascript;base64," + Buffer.from(mocks + "\n" + source).toString("base64")
);

function response(identifier, data) {
  return {
    actionIdentifier: "default",
    notification: { date: Date.now(), request: { identifier, content: { data: { source: "ttokdoc-deadline", ...data } } } },
  };
}

test("종료 상태에서 받은 마감 알림을 한 번만 열고 다른 계정·할 일 알림은 건너뛴다", async () => {
  const opened = [];
  const stop = startDeadlineNotifications(user.uid, (data) => opened.push(data));
  try {
    const cold = response("cold", { ownerUid: "current", kind: "deadline", documentId: "notice" });
    finishColdRead(cold);
    await Promise.resolve();
    receive(cold);
    receive(response("previous-account", { ownerUid: "previous", kind: "deadline", documentId: "private" }));
    receive(response("group", { ownerUid: "current", kind: "todo" }));
    await getNotificationHistory();
    assert.deepEqual(opened.map((data) => [data.kind, data.documentId]), [["deadline", "notice"]]);
    assert.equal(cleared, 3);
  } finally {
    stop();
  }
});

test("저장된 시점이 없으면 기본값을 적용하고, 모두 해제한 값은 유지한다", async () => {
  assert.deepEqual(await getReminderOffsets(), [3, 1, 0]);
  stored.set("ttokdoc.notifications.offsets", "[]");
  assert.deepEqual(await getReminderOffsets(), []);
});
