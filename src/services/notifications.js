// 마감 알림 (expo-notifications)
// - 로그인하면 알림 권한을 묻고, 문서·할 일 목록으로 알림을 예약한다.
// - 문서·할 일이 바뀌면(api.js → dataEvents) 목록을 다시 불러와 예약을 새로 맞춘다.
//   그래서 등록·삭제·완료·마감일 변경이 모두 같은 길로 반영된다.
// - 로그아웃하면 이 앱이 예약한 알림을 모두 지운다.
// - 웹은 예약 알림을 지원하지 않아 아무것도 하지 않는다.
import { Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { listDocuments, listTodos } from "./api";
import { onDataChanged } from "./dataEvents";
import { buildNotificationPlan, planSignature, REMINDER_HOUR, REMINDER_HOURS } from "../utils/notificationPlan";

const SOURCE = "ttokdoc-deadline"; // 우리 앱이 예약한 알림 표시
const CHANNEL_ID = "deadline";
const ENABLED_KEY = "ttokdoc.notifications.enabled";
const HOUR_KEY = "ttokdoc.notifications.hour";

export const notificationsSupported = Platform.OS !== "web";

let lastSignature = null;
let queue = Promise.resolve();
let refreshTimer = null;

if (notificationsSupported) {
  // 앱을 보고 있을 때 온 알림도 배너로 보여준다
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

// 설정 탭의 "마감 알림" 스위치 (기본은 켜짐)
export async function isNotificationEnabled() {
  try { return (await AsyncStorage.getItem(ENABLED_KEY)) !== "off"; } catch { return true; }
}

// 설정 탭의 "알림 시각" (기본 오전 9시)
export async function getReminderHour() {
  try {
    const saved = Number(await AsyncStorage.getItem(HOUR_KEY));
    return REMINDER_HOURS.includes(saved) ? saved : REMINDER_HOUR;
  } catch { return REMINDER_HOUR; }
}

export async function setReminderHour(hour) {
  try { await AsyncStorage.setItem(HOUR_KEY, String(hour)); } catch {}
  await refreshDeadlineNotifications(); // 바뀐 시각으로 다시 예약
}

// 알림함 화면: 앞으로 보낼 알림 목록 (웹에서도 목록은 볼 수 있다)
export async function getUpcomingReminders() {
  const [documents, todos, hour] = await Promise.all([listDocuments(), listTodos(), getReminderHour()]);
  return buildNotificationPlan(documents, todos, new Date(), { hour });
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
export async function cancelDeadlineNotifications() {
  if (!notificationsSupported) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled
    .filter((item) => item.content?.data?.source === SOURCE)
    .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)));
  lastSignature = null;
}

async function applyPlan(items) {
  const signature = planSignature(items);
  if (signature === lastSignature) return; // 바뀐 게 없으면 그대로 둔다
  await cancelDeadlineNotifications();
  for (const item of items) {
    await Notifications.scheduleNotificationAsync({
      content: { title: item.title, body: item.body, sound: true, data: { ...item.data, source: SOURCE } },
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

// 이미 불러온 문서·할 일로 예약을 맞춘다 (여러 번 불려도 순서대로 하나씩)
export function syncDeadlineNotifications(documents, todos, { ask = false } = {}) {
  if (!notificationsSupported) return Promise.resolve();
  queue = queue.then(async () => {
    if (!(await isNotificationEnabled())) return;
    if (!(await ensurePermission(ask))) return;
    await applyPlan(buildNotificationPlan(documents, todos, new Date(), { hour: await getReminderHour() }));
  }).catch((e) => console.warn("마감 알림 예약 실패:", e?.message));
  return queue;
}

// 서버에서 목록을 새로 받아 예약을 맞춘다
export async function refreshDeadlineNotifications(options) {
  if (!notificationsSupported) return;
  try {
    const [documents, todos] = await Promise.all([listDocuments(), listTodos()]);
    await syncDeadlineNotifications(documents, todos, options);
  } catch (e) {
    console.warn("마감 알림 새로고침 실패:", e?.message);
  }
}

// 설정 탭 스위치
export async function setNotificationEnabled(enabled) {
  try { await AsyncStorage.setItem(ENABLED_KEY, enabled ? "on" : "off"); } catch {}
  if (!enabled) { await cancelDeadlineNotifications(); return false; }
  const granted = await ensurePermission(true);
  if (granted) { lastSignature = null; await refreshDeadlineNotifications(); }
  return granted;
}

// 로그인한 동안 켜 둔다 (AppNavigator). 돌려준 함수를 부르면(로그아웃) 정리한다.
// onOpen: 알림을 눌렀을 때 그 문서의 관리 화면으로 보내는 함수
export function startDeadlineNotifications(onOpen) {
  if (!notificationsSupported) return () => {};
  refreshDeadlineNotifications({ ask: true });
  const offData = onDataChanged(() => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => refreshDeadlineNotifications(), 800); // 연달아 바뀌면 한 번만
  });
  const response = Notifications.addNotificationResponseReceivedListener((event) => {
    const data = event.notification.request.content.data || {};
    if (data.source === SOURCE) onOpen?.(data);
  });
  return () => {
    offData();
    response.remove();
    clearTimeout(refreshTimer);
    cancelDeadlineNotifications().catch(() => {});
  };
}
