// 마감 알림 (expo-notifications)
// - 알림 권한이 있으면 로그인한 계정의 문서 마감 알림을 예약한다.
// - 문서·할 일이 바뀌면(api.js → dataEvents) 목록을 다시 불러와 예약을 새로 맞춘다.
//   그래서 등록·삭제·완료·마감일 변경이 모두 같은 길로 반영된다.
// - 로그아웃하면 이 앱이 예약한 알림을 모두 지운다.
// - 웹은 예약 알림을 지원하지 않아 아무것도 하지 않는다.
import { AppState, Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { listDocuments } from "./api";
import { currentAuthUser } from "./auth";
import { onDataChanged } from "./dataEvents";
import { buildNotificationPlan, isReminderTime, planSignature, REMINDER_HOUR, REMINDER_OFFSETS } from "../utils/notificationPlan";

const SOURCE = "ttokdoc-deadline"; // 우리 앱이 예약한 알림 표시
const CHANNEL_ID = "deadline";
const ENABLED_KEY = "ttokdoc.notifications.enabled";
const HOUR_KEY = "ttokdoc.notifications.hour";
const TIME_KEY = "ttokdoc.notifications.time";
const OFFSETS_KEY = "ttokdoc.notifications.offsets";
const HISTORY_KEY = "ttokdoc.notifications.history:";
const historyListeners = new Set();
let historyQueue = Promise.resolve();

export const notificationsSupported = Platform.OS !== "web";

let lastSignature = null;
let queue = Promise.resolve();
let refreshVersion = 0;

if (notificationsSupported) {
  // 앱을 보고 있을 때 온 알림도 배너로 보여준다
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data;
      const show = !(data?.source === SOURCE && data.kind === "todo");
      return { shouldShowAlert: show, shouldPlaySound: show, shouldSetBadge: false };
    },
  });
}

// 설정 탭의 "마감 알림" 스위치 (기본은 켜짐)
export async function isNotificationEnabled() {
  try { return (await AsyncStorage.getItem(ENABLED_KEY)) !== "off"; } catch { return true; }
}

// 시·분을 함께 저장한다. 이전 버전에서 저장한 정시 설정도 읽는다.
export async function getReminderTime() {
  try {
    const saved = JSON.parse(await AsyncStorage.getItem(TIME_KEY));
    if (isReminderTime(saved)) return { hour: saved.hour, minute: saved.minute };
  } catch {}
  try {
    const legacy = await AsyncStorage.getItem(HOUR_KEY);
    const time = { hour: Number(legacy), minute: 0 };
    if (legacy !== null && legacy.trim() !== "" && isReminderTime(time)) return time;
  } catch {}
  return { hour: REMINDER_HOUR, minute: 0 };
}

export async function setReminderTime(time) {
  if (!isReminderTime(time)) throw new Error("알림 시각을 다시 선택해 주세요.");
  await AsyncStorage.setItem(TIME_KEY, JSON.stringify({ hour: time.hour, minute: time.minute }));
  await refreshDeadlineNotifications();
}

export const getReminderHour = async () => (await getReminderTime()).hour;
export const setReminderHour = (hour) => setReminderTime({ hour, minute: 0 });

export async function getReminderOffsets() {
  try {
    const stored = JSON.parse(await AsyncStorage.getItem(OFFSETS_KEY));
    if (Array.isArray(stored) && stored.every((offset) => REMINDER_OFFSETS.includes(offset))) {
      return REMINDER_OFFSETS.filter((offset) => stored.includes(offset));
    }
  } catch {}
  return REMINDER_OFFSETS;
}

export async function setReminderOffsets(offsets) {
  await AsyncStorage.setItem(OFFSETS_KEY, JSON.stringify(REMINDER_OFFSETS.filter((offset) => offsets.includes(offset))));
  refreshDeadlineNotifications();
}

export function onNotificationHistoryChanged(listener) {
  historyListeners.add(listener);
  return () => historyListeners.delete(listener);
}

function receivedNotificationDate(value) {
  const timestamp = typeof value === "number" ? value
    : typeof value === "string" ? Date.parse(value) : NaN;
  // Expo SDK 51: iOS supplies Unix seconds; Android supplies milliseconds.
  // This also repairs ISO dates saved as January 1970 by the previous conversion.
  return new Date(timestamp > 0 && timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp);
}

async function readHistory(uid) {
  const saved = JSON.parse(await AsyncStorage.getItem(HISTORY_KEY + uid) || "[]");
  return (Array.isArray(saved) ? saved : []).flatMap((item) => {
    if (item?.data?.kind !== "deadline" || item.data.ownerUid !== uid) return [];
    const date = receivedNotificationDate(item.date);
    if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now()) return [];
    return [{ ...item, date: date.toISOString() }];
  });
}

// 예약 시각이 지났다는 이유로 생성하지 않고, OS에서 실제 수신한 알림만 저장한다.
function rememberNotifications(notifications, uid) {
  const received = notifications.flatMap((notification) => {
    const request = notification?.request;
    const content = request?.content;
    const data = content?.data;
    if (!request?.identifier || data?.source !== SOURCE || data.kind !== "deadline" || data.ownerUid !== uid) return [];
    const date = receivedNotificationDate(notification.date);
    if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now()) return [];
    return [{ id: request.identifier, date: date.toISOString(), title: content.title || "마감 알림", body: content.body || "", data }];
  });
  if (!received.length) return historyQueue;
  const save = historyQueue.then(async () => {
    const previous = await readHistory(uid);
    const entries = new Map(previous.map((item) => [item.id, item]));
    let changed = false;
    received.forEach((item) => { if (!entries.has(item.id)) { entries.set(item.id, item); changed = true; } });
    if (!changed) return;
    const next = [...entries.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    await AsyncStorage.setItem(HISTORY_KEY + uid, JSON.stringify(next));
    if (currentAuthUser()?.uid === uid) historyListeners.forEach((listener) => { try { listener(); } catch {} });
  });
  historyQueue = save.catch(() => {});
  return save;
}

async function collectPresentedNotifications(uid) {
  const presented = await Notifications.getPresentedNotificationsAsync();
  await rememberNotifications(presented, uid);
}

export async function getNotificationHistory() {
  const uid = currentAuthUser()?.uid;
  if (!uid) return [];
  if (notificationsSupported) {
    try { await collectPresentedNotifications(uid); }
    catch (error) { console.warn("휴대폰 알림 내역 불러오기 실패:", error?.message); }
  }
  await historyQueue;
  const items = await readHistory(uid);
  if (currentAuthUser()?.uid !== uid) return [];
  return items.map((item) => ({ ...item, date: new Date(item.date) })).sort((a, b) => b.date - a.date);
}

export async function permissionStatus() {
  if (!notificationsSupported) return "unsupported";
  const result = await Notifications.getPermissionsAsync();
  return result.granted ? "granted" : result.canAskAgain === false ? "blocked" : result.status;
}

// 알림 권한 받기 (ask=false면 묻지 않고 현재 상태만 확인)
export async function ensurePermission(ask = true) {
  if (!notificationsSupported) return false;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "마감 알림",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!ask || current.canAskAgain === false) return false;
  const next = await Notifications.requestPermissionsAsync();
  return !!next.granted;
}

export const openSystemSettings = () => Linking.openSettings();

// 이 앱이 예약한 알림만 지운다
async function cancelDeadlineNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled
    .filter((item) => item.content?.data?.source === SOURCE)
    .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
  lastSignature = null;
}

async function applyPlan(items, uid) {
  const signature = uid + planSignature(items);
  if (signature === lastSignature) return; // 바뀐 게 없으면 그대로 둔다
  await cancelDeadlineNotifications();
  for (const item of items) {
    await Notifications.scheduleNotificationAsync({
      content: { title: item.title, body: item.body, sound: true, data: { ...item.data, source: SOURCE, ownerUid: uid } },
      trigger: Platform.OS === "android" ? { date: item.date, channelId: CHANNEL_ID } : { date: item.date },
    });
  }
  lastSignature = signature;
  if (__DEV__) {
    // 개발 중 확인용: Metro 터미널에 예약 목록이 찍힌다
    console.log(`[마감 알림] ${items.length}개 예약`);
    items.forEach((item) => console.log(`  ${item.date.toLocaleString()}  ${item.title}`));
  }
}

function enqueue(job) {
  queue = queue.then(job).catch((e) => console.warn("마감 알림 처리 실패:", e?.message));
  return queue;
}

// 서버에서 목록을 새로 받아 예약을 맞춘다
export async function refreshDeadlineNotifications() {
  const user = currentAuthUser();
  if (!notificationsSupported || !user) return;
  const version = ++refreshVersion;
  try {
    if (!(await isNotificationEnabled()) || !(await ensurePermission(false))) return;
    const documents = await listDocuments();
    await enqueue(async () => {
      const [enabled, time, offsets] = await Promise.all([isNotificationEnabled(), getReminderTime(), getReminderOffsets()]);
      if (!enabled || version !== refreshVersion || currentAuthUser() !== user) return;
      await applyPlan(buildNotificationPlan(documents, [], new Date(), { ...time, offsets }), user.uid);
    });
  } catch (e) {
    console.warn("마감 알림 새로고침 실패:", e?.message);
  }
}

// 설정 탭 스위치
export async function setNotificationEnabled(enabled) {
  if (!notificationsSupported) return false;
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? "on" : "off");
  if (!enabled) {
    refreshVersion += 1;
    await enqueue(cancelDeadlineNotifications);
    return false;
  }
  const granted = await ensurePermission(true);
  if (granted) refreshDeadlineNotifications();
  return granted;
}

// 로그인한 동안 켜 둔다 (AppNavigator). 돌려준 함수를 부르면(로그아웃) 정리한다.
// onOpen: 알림을 눌렀을 때 그 문서의 관리 화면으로 보내는 함수
export function startDeadlineNotifications(uid, onOpen) {
  if (!notificationsSupported) return () => {};
  let active = true;
  let refreshTimer = null;
  const handled = new Set();
  const saveReceived = (notification) => {
    if (!active || currentAuthUser()?.uid !== uid) return Promise.resolve();
    return rememberNotifications([notification], uid);
  };
  const received = Notifications.addNotificationReceivedListener((notification) => {
    saveReceived(notification).catch((error) => console.warn("받은 알림 저장 실패:", error?.message));
  });
  const recoverHistory = () => collectPresentedNotifications(uid).catch((error) => console.warn("받은 알림 불러오기 실패:", error?.message));
  recoverHistory();
  // 이전 버전에서 예약한 할 일 알림도 더 이상 보내지 않는다.
  enqueue(async () => {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of scheduled.filter((entry) => entry.content?.data?.source === SOURCE && entry.content.data.kind === "todo")) {
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
  });
  refreshDeadlineNotifications();
  const foreground = AppState.addEventListener("change", (state) => {
    if (state === "active") { recoverHistory(); refreshDeadlineNotifications(); }
  });
  const offData = onDataChanged(() => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshDeadlineNotifications(), 800); // 연달아 바뀌면 한 번만
  });
  const openResponse = (event) => {
    if (!active || event?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const { identifier, content } = event.notification.request;
    const data = content.data;
    if (data?.source !== SOURCE || handled.has(identifier)) return;
    handled.add(identifier);
    if (data.kind !== "deadline" || data.ownerUid !== uid || currentAuthUser()?.uid !== uid) {
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
      return;
    }
    saveReceived(event.notification)
      .then(() => Notifications.clearLastNotificationResponseAsync())
      .catch((error) => console.warn("받은 알림 저장 실패:", error?.message));
    onOpen(data);
  };
  const response = Notifications.addNotificationResponseReceivedListener(openResponse);
  Notifications.getLastNotificationResponseAsync().then((event) => {
    if (!handled.size) openResponse(event);
  }).catch(() => {});
  return () => {
    active = false;
    refreshVersion += 1;
    offData();
    response.remove();
    received.remove();
    foreground.remove();
    clearTimeout(refreshTimer);
    enqueue(async () => {
      await cancelDeadlineNotifications();
      const presented = await Notifications.getPresentedNotificationsAsync();
      await Promise.all(presented.filter(({ request }) => request.content.data?.source === SOURCE)
        .map(({ request }) => Notifications.dismissNotificationAsync(request.identifier)));
    });
  };
}
