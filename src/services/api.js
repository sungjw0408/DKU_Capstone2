
import { Platform } from "react-native";
import { currentAuthUser } from "./auth";
import { emitDataChanged } from "./dataEvents";

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const TIMEOUT_MS = 120000; // Gemini 분석은 수 초~수십 초 (사진은 글자 받아쓰기까지 해서 더 걸림)

export async function request(path, options = {}, config = {}) {
  const user = config.authenticated === false ? null : (config.user || currentAuthUser());
  if (config.authenticated !== false && !user) {
    const error = new Error("로그인이 필요해요.");
    error.status = 401;
    throw error;
  }
  const headers = new Headers(options.headers || {});
  if (user) headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...options, headers, cache: "no-store", signal: controller.signal });
  } catch (e) {
    if (e.name === "AbortError") throw new Error(config.timeoutMessage || "분석 시간이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.");
    throw new Error(`서버에 연결할 수 없어요 (${BASE_URL}). 서버가 켜져 있는지, 주소가 맞는지 확인해 주세요.`);
  } finally {
    clearTimeout(timer);
  }
  if (user && currentAuthUser()?.uid !== user.uid) {
    throw new Error("로그인한 계정이 변경됐어요. 현재 화면에서 다시 시도해 주세요.");
  }
  if (res.ok && config.responseType === "blob") return res.blob();
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof body.detail === "string" ? body.detail : body.detail?.message || JSON.stringify(body.detail ?? body);
    const error = new Error(detail || `요청 실패 (${res.status})`);
    error.status = res.status;
    error.documentId = body.detail?.documentId;
    error.code = body.detail?.code;
    throw error;
  }
  // 문서·할 일을 바꾸는 요청이 성공하면 알림 예약을 다시 맞추도록 알린다
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET" && /^\/api\/(documents|todos)/.test(path)) emitDataChanged();
  return body;
}

export const checkHealth = () => request("/health", {}, { authenticated: false });

// 붙여넣은 텍스트 분석 → { documentId, view, analysis }
export function analyzeText(text) {
  const form = new FormData();
  form.append("text", text);
  return request("/api/documents/analyze", { method: "POST", body: form });
}

export function attachmentMimeType(filename) {
  const name = (filename ?? "").toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() : "";

  return {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  }[extension] ?? null;
}

export async function analyzeWithAttachments(text, assets) {
  if (!text.trim()) {
    throw new Error("공지 본문을 입력해주세요.");
  }

  if (!Array.isArray(assets) || assets.length < 1 || assets.length > 3) {
    throw new Error("첨부 파일은 1개 이상 3개 이하로 선택해주세요.");
  }

  const form = new FormData();
  form.append("text", text);

  for (const asset of assets) {
    const name = asset.name ?? asset.fileName ?? asset.file?.name ?? "";
    const type = attachmentMimeType(name);

    if (!type) {
      throw new Error(`지원하지 않는 첨부 파일 형식입니다: ${name}`);
    }

    if (Platform.OS === "web") {
      const blob =
        asset.file ?? (await (await fetch(asset.uri)).blob());

      form.append("files", blob, name);
    } else {
      form.append("files", {
        uri: asset.uri,
        name,
        type,
      });
    }
  }

  return request(
    "/api/documents/analyze-with-attachments",
    {
      method: "POST",
      body: form,
    },
    {
      timeoutMs: 300000,
    }
  );
}

// expo-image-picker / expo-document-picker 의 asset 을 그대로 넘기면 된다.
export async function analyzeFile(asset) {
  const isPdf = (asset.mimeType ?? asset.name ?? "").toLowerCase().includes("pdf");
  const type = asset.mimeType ?? asset.file?.type ?? (isPdf ? "application/pdf" : "image/jpeg");
  // 카메라로 찍은 사진은 파일 이름이 없을 수 있어서, 확장자를 붙여 서버가 형식을 알 수 있게 한다
  const ext = type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : type.startsWith("image/hei") ? "heic" : "jpg";
  const name = asset.fileName ?? asset.name ?? asset.file?.name ?? `upload.${ext}`;
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

export async function analyzeImages(assets) {
  if (!Array.isArray(assets) || assets.length < 2 || assets.length > 5) {
    throw new Error("사진은 2장 이상 5장 이하로 선택해주세요.");
  }

  const form = new FormData();

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];

    const type = asset.mimeType ?? asset.file?.type ?? "image/jpeg";

    const ext =
      type === "image/png" ? "png" :
      type === "image/webp" ? "webp" :
      type === "image/heic" ? "heic" :
      type === "image/heif" ? "heif" : "jpg";

    const name =
      asset.fileName ??
      asset.name ??
      asset.file?.name ??
      `page-${i + 1}.${ext}`;

    if (Platform.OS === "web") {
      const blob =
        asset.file ?? (await (await fetch(asset.uri)).blob());

      form.append("files", blob, name);
    } else {
      form.append("files", {
        uri: asset.uri,
        name,
        type,
      });
    }
  }

  return request(
    "/api/documents/analyze-images",
    {
      method: "POST",
      body: form,
    },
    {
      timeoutMs: 300000,
    }
  );
}

export const listDocuments = () => request("/api/documents");
export const getDocument = (id) => request(`/api/documents/${id}`);
export const getNoticeMailOptions = (id, user) => request(
  "/api/documents/" + encodeURIComponent(id) + "/mail-options", {}, { user },
);
export const createNoticeMailDraft = (id, input, user) => request(
  "/api/mail-drafts/" + encodeURIComponent(id),
  { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  { user, timeoutMessage: "메일 초안 작성이 지연되고 있어요. 잠시 후 다시 시도해 주세요." },
);
export const updateDocument = (id, patch) =>
  request(
    `/api/documents/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    }
  );

export const deleteDocument = (id, user) =>
  request(
    `/api/documents/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
    { user }
  );

// 여러 문서를 삭제할 때는 시작한 계정을 유지하고, 성공/실패한 ID를 따로 반환한다.
export async function deleteDocuments(ids) {
  const user = currentAuthUser();
  const uniqueIds = [...new Set(ids)];
  const deletedIds = [];
  const failures = [];
  for (let index = 0; index < uniqueIds.length; index++) {
    if (!user || currentAuthUser()?.uid !== user.uid) {
      failures.push(...uniqueIds.slice(index).map((id) => ({ id, message: "로그인한 계정이 변경됐어요. 현재 화면에서 다시 시도해 주세요." })));
      break;
    }
    const id = uniqueIds[index];
    try {
      await deleteDocument(id, user);
      deletedIds.push(id);
    } catch (error) {
      // 다른 화면/기기에서 이미 삭제한 문서는 목록에서도 제거한다.
      if (error.status === 404) deletedIds.push(id);
      else failures.push({ id, message: error.message || "문서를 삭제하지 못했어요." });
      if (error.status === 401) {
        failures.push(...uniqueIds.slice(index + 1).map((remainingId) => ({ id: remainingId, message: error.message })));
        break;
      }
    }
  }
  return { deletedIds, failures };
}
export const getSource = (id) => request(`/api/documents/${id}/source`);
export const retryDocument = (id) => request(`/api/documents/${encodeURIComponent(id)}/retry`, { method: "POST" });
export const initializePlan = (id, steps) => request(`/api/documents/${encodeURIComponent(id)}/plan/initialize`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps, revision: 0 }),
});
export const savePlan = (id, steps, revision) => request(`/api/documents/${encodeURIComponent(id)}/plan`, {
  method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps, revision }),
});
export const registerPlan = (id, steps, revision) => request(`/api/documents/${encodeURIComponent(id)}/plan/register`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps, revision }),
});
export const listTodos = (documentId) => request(`/api/todos${documentId ? `?document_id=${encodeURIComponent(documentId)}` : ""}`);
export const addTodo = (documentId, todo) => request(`/api/documents/${encodeURIComponent(documentId)}/todos`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(todo),
});
export const updateTodo = (id, completed) => request(`/api/todos/${encodeURIComponent(id)}`, {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_completed: completed }),
});
export const editTodo = (id, patch) =>
  request(
    `/api/todos/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    }
  );
export const deleteTodo = (id) => request(`/api/todos/${encodeURIComponent(id)}`, { method: "DELETE" });

// 원문 근거 화면: 백엔드가 렌더링한 원본 PDF 페이지 이미지 주소 (page 는 1부터)
export async function getPageImage(id, page, width = 1000) {
  const blob = await request(`/api/documents/${encodeURIComponent(id)}/pages/${page}/image?width=${width}`, {}, { responseType: "blob" });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("원문 페이지 이미지를 불러오지 못했어요."));
    reader.readAsDataURL(blob);
  });
}

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
