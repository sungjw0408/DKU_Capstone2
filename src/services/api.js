// src/services/api.js — ActionDoc 백엔드 호출
// 프론트 루트 .env 에 EXPO_PUBLIC_API_URL=http://<PC 내부 IP>:8000
//  - 실제 폰(Expo Go): PC의 내부 IP (localhost 불가)
//  - Android 에뮬레이터: http://10.0.2.2:8000
//  - 웹 / iOS 시뮬레이터: http://localhost:8000
import { Platform } from "react-native";

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const TIMEOUT_MS = 60000; // Gemini 분석은 수 초~수십 초 걸릴 수 있음

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === "AbortError") throw new Error("분석 시간이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.");
    throw new Error(`서버에 연결할 수 없어요 (${BASE_URL}). 서버가 켜져 있는지, 주소가 맞는지 확인해 주세요.`);
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof body.detail === "string" ? body.detail : body.detail?.message || JSON.stringify(body.detail ?? body);
    const error = new Error(detail || `요청 실패 (${res.status})`);
    error.status = res.status;
    error.documentId = body.detail?.documentId;
    throw error;
  }
  return body;
}

export const checkHealth = () => request("/health");

// 붙여넣은 텍스트 분석 → { documentId, view, analysis }
export function analyzeText(text) {
  const form = new FormData();
  form.append("text", text);
  return request("/api/documents/analyze", { method: "POST", body: form });
}

// expo-image-picker / expo-document-picker 의 asset 을 그대로 넘기면 된다.
export async function analyzeFile(asset) {
  const name = asset.fileName ?? asset.name ?? "upload";
  const type = asset.mimeType ?? (name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
  const form = new FormData();
  if (Platform.OS === "web") {
    // 웹은 {uri} 객체를 못 보내므로 실제 Blob 으로 변환
    const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
    form.append("file", blob, name);
  } else {
    form.append("file", { uri: asset.uri, name, type });
  }
  return request("/api/documents/analyze", { method: "POST", body: form });
}

export const listDocuments = () => request("/api/documents");
export const getDocument = (id) => request(`/api/documents/${id}`);
export const getSource = (id) => request(`/api/documents/${id}/source`);
export const retryDocument = (id) => request(`/api/documents/${encodeURIComponent(id)}/retry`, { method: "POST" });
export const savePlan = (id, steps, revision) => request(`/api/documents/${encodeURIComponent(id)}/plan`, {
  method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps, revision }),
});
export const registerPlan = (id, steps, revision) => request(`/api/documents/${encodeURIComponent(id)}/plan/register`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps, revision }),
});
export const listTodos = (documentId) => request(`/api/todos${documentId ? `?document_id=${encodeURIComponent(documentId)}` : ""}`);
export const updateTodo = (id, completed) => request(`/api/todos/${encodeURIComponent(id)}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_completed: completed }),
});
export const deleteTodo = (id) => request(`/api/todos/${encodeURIComponent(id)}`, { method: "DELETE" });

// '확인 필요' 항목 승인(수정값 선택) → 갱신된 { view, analysis }
export function confirmField(docId, fieldId, patch = {}) {
  return request(`/api/documents/${docId}/fields/${fieldId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

// 잘못 추출된 항목 삭제 → 갱신된 { view, analysis }
export const rejectField = (docId, fieldId) =>
  request(`/api/documents/${docId}/fields/${fieldId}`, { method: "DELETE" });
