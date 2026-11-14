import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const { transformSync } = require("@babel/core");
const authSource = await readFile(new URL("../src/services/auth.js", import.meta.url), "utf8");
const transformed = transformSync(authSource, {
  babelrc: false, configFile: false, plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
}).code;
const formSource = await readFile(new URL("../src/utils/authForm.js", import.meta.url), "utf8");
const { validatePasswordChange } = await import(`data:text/javascript;base64,${Buffer.from(formSource).toString("base64")}`);

function harness(options = {}) {
  const calls = [];
  const user = {
    uid: "account-one", email: "member@example.com", isAnonymous: false, emailVerified: false,
    providerData: options.providers || [{ providerId: "password" }],
    getIdToken: async () => { calls.push("token"); return "test-token"; },
  };
  const auth = { currentUser: user };
  const exports = {};
  const firebase = {
    EmailAuthProvider: { credential: (email, password) => ({ email, password }) },
    reauthenticateWithCredential: async (account, credential) => {
      assert.equal(account, user);
      calls.push(["reauthenticate", credential.password]);
      if (options.confirmError) throw options.confirmError;
      if (options.switchAccount) auth.currentUser = { uid: "account-two" };
    },
    updatePassword: async (account, password) => { assert.equal(account, user); calls.push(["password", password]); },
    sendPasswordResetEmail: async (actualAuth, email) => { assert.equal(actualAuth, auth); calls.push(["reset", email]); },
    sendEmailVerification: async (account) => { assert.equal(account, user); calls.push("verification"); },
    reload: async (account) => { account.emailVerified = true; calls.push("reload"); },
  };
  vm.runInNewContext(transformed, {
    exports,
    require: (name) => {
      if (name === "firebase/auth") return firebase;
      if (name === "./firebaseAuth") return { auth };
      if (name === "./googleAuth") return { confirmGoogleAccount: async () => calls.push("google") };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { ...exports, user, auth, calls };
}

test("현재 비밀번호와 새 비밀번호 확인을 검사하고 공백을 보존한다", () => {
  const values = { currentPassword: "old password", newPassword: "new password ", confirmation: "new password " };
  assert.equal(validatePasswordChange(values), "");
  assert.match(validatePasswordChange({ ...values, currentPassword: "" }), /현재 비밀번호/);
  assert.match(validatePasswordChange({ ...values, newPassword: "12345" }), /6자/);
  assert.match(validatePasswordChange({ ...values, newPassword: values.currentPassword }), /다른/);
  assert.match(validatePasswordChange({ ...values, confirmation: values.confirmation.trim() }), /일치/);
});

test("재인증이 완료된 뒤 비밀번호를 변경한다", async () => {
  const account = harness();
  await account.changeAccountPassword(account.user, "old password", "new password ");
  assert.deepEqual(account.calls, [["reauthenticate", "old password"], "token", ["password", "new password "]]);
});

test("재인증 실패나 계정 전환 시 비밀번호 변경을 보내지 않는다", async () => {
  const failure = Object.assign(new Error("wrong password"), { code: "auth/invalid-credential" });
  const wrong = harness({ confirmError: failure });
  await assert.rejects(wrong.changeAccountPassword(wrong.user, "wrong", "new password"), failure);
  assert.equal(wrong.calls.some((call) => call[0] === "password"), false);
  const switched = harness({ switchAccount: true });
  await assert.rejects(switched.changeAccountPassword(switched.user, "old password", "new password"), (error) => error.code === "auth/session-changed");
  assert.equal(switched.calls.some((call) => call[0] === "password"), false);
});

test("Google 전용·게스트는 비밀번호 변경을 거부하고 이메일 로그인 수단이 있으면 허용한다", async () => {
  const google = harness({ providers: [{ providerId: "google.com" }] });
  await assert.rejects(google.changeAccountPassword(google.user, "old password", "new password"), /이메일/);
  const guest = harness();
  guest.user.isAnonymous = true;
  await assert.rejects(guest.changeAccountPassword(guest.user, "old password", "new password"), /이메일/);
  const linked = harness({ providers: [{ providerId: "password" }, { providerId: "google.com" }] });
  await linked.changeAccountPassword(linked.user, "old password", "new password");
  assert.equal(linked.calls.includes("google"), false);
});

test("재설정 메일은 현재 계정으로 보내고 인증 상태는 새로 조회한다", async () => {
  const account = harness();
  await account.sendAccountPasswordReset(account.user);
  await account.sendAccountVerification(account.user);
  await account.reloadAccount(account.user);
  await account.sendAccountVerification(account.user);
  assert.deepEqual(account.calls, [["reset", "member@example.com"], "verification", "reload", "token"]);
  account.auth.currentUser = null;
  await assert.rejects(account.sendAccountPasswordReset(account.user), (error) => error.code === "auth/session-changed");
});
