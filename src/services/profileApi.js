import { request } from "./api";

const config = { timeoutMs: 20000, timeoutMessage: "소속 정보를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요." };
export const listAffiliations = () => request("/api/auth/affiliations", {}, { ...config, authenticated: false });

export const getProfileState = (user) => request("/api/me/profile", {}, { ...config, user });

export async function ensureGuestProfile(user) {
  return (await request("/api/me/guest-profile", { method: "POST" }, { ...config, user })).profile;
}

export async function getProfile(user) {
  return (await getProfileState(user)).profile;
}

export async function saveProfile(user, selection) {
  return (await request("/api/me/profile", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ collegeId: selection.collegeId, departmentId: selection.departmentId }),
  }, { ...config, user })).profile;
}

export const deleteOwnAccount = (user) => request("/api/me/account", {
  method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmed: true }),
}, { user, timeoutMs: 120000, timeoutMessage: "삭제 완료 여부를 확인하지 못했어요. 잠시 후 다시 로그인해서 상태를 확인해 주세요." });
