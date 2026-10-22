import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function sourceModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}
const { validateCredentials, authErrorMessage, findAffiliation } = await sourceModule("../src/utils/authForm.js");
const { registerWithProfile } = await sourceModule("../src/utils/accountFlow.js");
const valid = { email: "test@example.com", password: "keep spaces ", confirmation: "keep spaces " };

test("가입 전 이메일·비밀번호·확인을 검사하고 비밀번호 공백을 보존한다", () => {
  assert.equal(validateCredentials(valid, true), "");
  assert.ok(validateCredentials({ ...valid, email: "wrong" }, true));
  assert.ok(validateCredentials({ ...valid, password: "12345", confirmation: "12345" }, true));
  assert.ok(validateCredentials({ ...valid, confirmation: "keep spaces" }, true));
  assert.equal(validateCredentials({ email: " test@example.com ", password: "old" }), "");
});
test("다른 단과대 학과 조합은 선택으로 인정하지 않는다", () => {
  const catalog = { colleges: [{ id: "a", departments: [{ id: "a1" }] }, { id: "b", departments: [{ id: "b1" }] }] };
  assert.ok(findAffiliation(catalog, "a", "a1"));
  assert.equal(findAffiliation(catalog, "a", "b1"), null);
  assert.equal(findAffiliation(null, "a", "a1"), null);
});
test("Firebase 설정 미완료·잘못된 자격 증명을 한국어로 안내한다", () => {
  assert.match(authErrorMessage({ code: "auth/configuration-not-found" }), /설정/);
  assert.match(authErrorMessage({ code: "auth/invalid-credential" }), /이메일 또는 비밀번호/);
  assert.equal(authErrorMessage({ code: "auth/unknown", message: "raw internal error" }).includes("raw"), false);
});
test("가입 성공 시 소속을 생성된 UID로 저장한다", async () => {
  const user = { uid: "new-user" };
  const selection = { collegeId: "a", departmentId: "a1" };
  const result = await registerWithProfile({
    createAccount: async (email, password) => { assert.equal(email, valid.email); assert.equal(password, valid.password); return user; },
    saveProfile: async (actualUser, value) => { assert.equal(actualUser, user); assert.equal(value, selection); return { uid: user.uid }; },
  }, { ...valid, selection });
  assert.equal(result.needsProfile, false);
  assert.equal(result.profile.uid, "new-user");
});
test("소속 저장 실패 시 생성된 계정을 유지하고 재가입하지 않는다", async () => {
  let creates = 0;
  const user = { uid: "created-once" };
  const failure = new Error("server offline");
  const result = await registerWithProfile({
    createAccount: async () => { creates++; return user; },
    saveProfile: async () => { throw failure; },
  }, { ...valid, selection: { collegeId: "a", departmentId: "a1" } });
  assert.equal(creates, 1);
  assert.equal(result.user, user);
  assert.equal(result.needsProfile, true);
  assert.equal(result.error, failure);
});
test("계정 생성 실패 시 프로필은 저장하지 않는다", async () => {
  let saves = 0;
  await assert.rejects(registerWithProfile({
    createAccount: async () => { throw new Error("email exists"); },
    saveProfile: async () => { saves++; },
  }, valid), /email exists/);
  assert.equal(saves, 0);
});
