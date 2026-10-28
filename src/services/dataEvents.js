// 문서·할 일이 바뀌었다는 신호 (마감 알림을 다시 예약할 때 씀)
// api.js 가 POST/PUT/PATCH/DELETE 성공 뒤에 알리고, notifications.js 가 듣는다.
const listeners = new Set();

export function onDataChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitDataChanged() {
  listeners.forEach((listener) => {
    try { listener(); } catch (e) { console.warn("dataChanged listener 오류", e?.message); }
  });
}
