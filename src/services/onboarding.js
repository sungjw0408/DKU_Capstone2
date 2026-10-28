// 첫 실행 안내: 한 번 보면 다시 안 띄우고, 설정의 "앱 소개 다시 보기"로 다시 열 수 있다.
import AsyncStorage from "@react-native-async-storage/async-storage";

const DONE_KEY = "ttokdoc.onboarding.done";
const listeners = new Set();

export async function shouldShowOnboarding() {
  try { return (await AsyncStorage.getItem(DONE_KEY)) !== "yes"; } catch { return false; }
}

export async function finishOnboarding() {
  try { await AsyncStorage.setItem(DONE_KEY, "yes"); } catch {}
}

// 설정 화면에서 다시 열 때
export function showOnboarding() {
  listeners.forEach((listener) => listener());
}

export function onShowOnboarding(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
