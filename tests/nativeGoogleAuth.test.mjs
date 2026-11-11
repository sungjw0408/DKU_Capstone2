import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const { transformSync } = require("@babel/core");
const nativeSource = await readFile(new URL("../src/services/googleAuth.native.js", import.meta.url), "utf8");
const flowSource = await readFile(new URL("../src/utils/googleAccountFlow.js", import.meta.url), "utf8");
const { createGoogleAccountFlow, googleFlowError } = await import(`data:text/javascript;base64,${Buffer.from(flowSource).toString("base64")}`);
const formSource = await readFile(new URL("../src/utils/authForm.js", import.meta.url), "utf8");
const { authErrorMessage } = await import(`data:text/javascript;base64,${Buffer.from(formSource).toString("base64")}`);
const { buildAppConfig, configurationErrors } = require("../config/nativeGoogle.cjs");
const baseConfig = require("../app.json").expo;
const webClientId = "example-web.apps.googleusercontent.com";
const iosClientId = "example-ios.apps.googleusercontent.com";

const transformed = transformSync(nativeSource, {
  babelrc: false, configFile: false,
  plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")],
}).code;

function harness(options = {}) {
  const calls = [];
  const guest = { uid: "guest-one", isAnonymous: true };
  const member = { uid: "member-one", isAnonymous: false, email: "member@example.com",
    getIdToken: async (force) => { calls.push(["refresh", force]); return "firebase-token"; } };
  const auth = { currentUser: options.user ?? null };
  const statusCodes = { SIGN_IN_CANCELLED: "SIGN_IN_CANCELLED", IN_PROGRESS: "IN_PROGRESS", PLAY_SERVICES_NOT_AVAILABLE: "PLAY_SERVICES_NOT_AVAILABLE" };
  const GoogleSignin = {
    configure: (config) => calls.push(["configure", config]),
    hasPlayServices: async (config) => { calls.push(["playServices", config]); if (options.playError) throw options.playError; return true; },
    signOut: async () => { calls.push(["googleSignOut"]); },
    signIn: async (config) => {
      calls.push(["googleSignIn", config]);
      if (options.onChoose) await options.onChoose(auth);
      if (options.chooseError) throw options.chooseError;
      return options.response || { type: "success", data: { idToken: "google-id-token" } };
    },
  };
  const firebase = {
    GoogleAuthProvider: { credential: (token) => ({ token }) },
    signInWithCredential: async (actualAuth, credential) => {
      calls.push(["firebaseSignIn", actualAuth, credential]); actualAuth.currentUser = member; return { user: member };
    },
    linkWithCredential: async (user, credential) => {
      calls.push(["firebaseLink", user, credential]);
      if (options.linkError) throw options.linkError;
      user.isAnonymous = false; return { user };
    },
    reauthenticateWithCredential: async (user, credential) => {
      calls.push(["reauthenticate", user, credential]);
      if (options.confirmError) throw options.confirmError;
      return { user };
    },
  };
  const exports = {};
  vm.runInNewContext(transformed, {
    exports,
    require: (name) => {
      if (name === "expo-constants") return { __esModule: true, default: { expoConfig: { extra: {
        googleSignIn: options.config || { webClientId, iosClientId },
      } } } };
      if (name === "react-native") return { Platform: { OS: options.platform || "android" }, TurboModuleRegistry: {
        get: () => options.nativeModule === false ? null : {},
      } };
      if (name === "firebase/auth") return firebase;
      if (name === "./firebaseAuth") return { auth };
      if (name === "../utils/googleAccountFlow") return { createGoogleAccountFlow, googleFlowError };
      if (name === "@react-native-google-signin/google-signin") {
        calls.push(["loadSdk"]); return { GoogleSignin, statusCodes };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { api: exports, calls, auth, guest, member };
}

test("Expo Go에서는 Google SDK를 불러오지 않아 이메일·게스트 인증 초기화를 막지 않는다", async () => {
  const h = harness({ nativeModule: false });
  assert.equal(h.api.googleSignInAvailable, false);
  await assert.rejects(h.api.loginGoogleAccount(), { code: "auth/google-native-unavailable" });
  assert.equal(h.calls.length, 0);
});

test("iOS 클라이언트 ID가 없으면 iOS만 차단하고 Android는 웹 ID로 구성한다", () => {
  assert.equal(harness({ platform: "ios", config: { webClientId } }).api.googleSignInAvailable, false);
  assert.equal(harness({ platform: "android", config: { webClientId } }).api.googleSignInAvailable, true);
  assert.equal(harness({ config: { webClientId: "not-an-oauth-client" } }).api.googleSignInAvailable, false);
});

test("Android는 Play 서비스를 확인하고 ID 토큰으로 기존 Firebase 인증에 로그인한다", async () => {
  const h = harness();
  const user = await h.api.loginGoogleAccount();
  assert.equal(user, h.member);
  assert.equal(h.auth.currentUser, h.member);
  assert.ok(h.calls.some(([name]) => name === "playServices"));
  const configured = h.calls.find(([name]) => name === "configure")[1];
  assert.equal(configured.webClientId, webClientId);
  assert.equal(configured.offlineAccess, false);
  assert.equal(configured.scopes, undefined);
  assert.equal(h.calls.find(([name]) => name === "firebaseSignIn")[2].token, "google-id-token");
  assert.equal(h.calls.filter(([name]) => name === "googleSignOut").length, 2);
});

test("iOS는 전용 클라이언트 ID를 사용하며 Android Play 서비스를 호출하지 않는다", async () => {
  const h = harness({ platform: "ios" });
  await h.api.loginGoogleAccount();
  assert.equal(h.calls.find(([name]) => name === "configure")[1].iosClientId, iosClientId);
  assert.equal(h.calls.some(([name]) => name === "playServices"), false);
});

test("계정 선택 취소 시 Firebase 로그인이나 게스트 연결을 하지 않는다", async () => {
  for (const chooseOptions of [{ response: { type: "cancelled", data: null } }, { chooseError: { code: "SIGN_IN_CANCELLED" } }]) {
    const guest = { uid: "guest", isAnonymous: true };
    const h = harness({ ...chooseOptions, user: guest });
    await assert.rejects(h.api.linkGuestGoogleAccount(guest), { code: "auth/google-cancelled" });
    assert.equal(h.auth.currentUser, guest);
    assert.equal(guest.isAnonymous, true);
    assert.equal(h.calls.some(([name]) => name === "firebaseSignIn" || name === "firebaseLink"), false);
    assert.equal(authErrorMessage({ code: "auth/google-cancelled" }), "");
  }
});

test("ID 토큰이 없으면 불완전한 인증 정보로 Firebase에 로그인하지 않는다", async () => {
  const h = harness({ response: { type: "success", data: { idToken: null } } });
  await assert.rejects(h.api.loginGoogleAccount(), { code: "auth/google-token-missing" });
  assert.equal(h.calls.some(([name]) => name === "firebaseSignIn"), false);
});

test("게스트는 signIn 대신 link를 사용해 같은 UID와 데이터 경로를 유지한다", async () => {
  const guest = { uid: "keep-my-documents", isAnonymous: true };
  const h = harness({ user: guest });
  const result = await h.api.linkGuestGoogleAccount(guest);
  assert.equal(result.uid, "keep-my-documents");
  assert.equal(h.auth.currentUser, guest);
  assert.equal(h.calls.some(([name]) => name === "firebaseSignIn"), false);
  assert.equal(h.calls.find(([name]) => name === "firebaseLink")[1], guest);
});

test("이미 가입된 Google 계정 연결 충돌 시 게스트를 보존한다", async () => {
  for (const code of ["auth/credential-already-in-use", "auth/email-already-in-use", "auth/account-exists-with-different-credential"]) {
    const guest = { uid: "keep-guest", isAnonymous: true };
    const h = harness({ user: guest, linkError: { code } });
    await assert.rejects(h.api.linkGuestGoogleAccount(guest), { code: "auth/guest-google-account-in-use" });
    assert.equal(h.auth.currentUser, guest);
    assert.equal(guest.isAnonymous, true);
    assert.equal(h.calls.some(([name]) => name === "firebaseSignIn"), false);
  }
});

test("계정 선택 도중 로그인한 사용자가 바뀌면 새 인증 적용을 중단한다", async () => {
  const guest = { uid: "first", isAnonymous: true };
  const h = harness({ user: guest, onChoose: (auth) => { auth.currentUser = { uid: "second" }; } });
  await assert.rejects(h.api.linkGuestGoogleAccount(guest), { code: "auth/google-session-changed" });
  assert.equal(h.calls.some(([name]) => name === "firebaseLink" || name === "firebaseSignIn"), false);
  assert.equal(h.auth.currentUser.uid, "second");
});

test("중복 Google 로그인은 계정 선택창과 Firebase 요청을 추가하지 않는다", async () => {
  let release;
  const choosing = new Promise((resolve) => { release = resolve; });
  const h = harness({ onChoose: () => choosing });
  const first = h.api.loginGoogleAccount();
  await assert.rejects(h.api.loginGoogleAccount(), { code: "auth/google-in-progress" });
  release();
  await first;
  assert.equal(h.calls.filter(([name]) => name === "googleSignIn").length, 1);
});

test("재인증 성공 시 현재 사용자의 Firebase 토큰을 강제로 갱신한다", async () => {
  const h = harness();
  h.auth.currentUser = h.member;
  await h.api.confirmGoogleAccount(h.member);
  assert.equal(h.calls.find(([name]) => name === "reauthenticate")[1], h.member);
  assert.equal(h.calls.find(([name]) => name === "googleSignIn")[1].loginHint, h.member.email);
  assert.ok(h.calls.some(([name, force]) => name === "refresh" && force === true));
  assert.equal(h.calls.some(([name]) => name === "firebaseSignIn"), false);
});

test("탈퇴 재인증에서 다른 Google 계정을 선택하면 거부하고 세션을 유지한다", async () => {
  const h = harness({ confirmError: { code: "auth/user-mismatch" } });
  h.auth.currentUser = h.member;
  await assert.rejects(h.api.confirmGoogleAccount(h.member), { code: "auth/user-mismatch" });
  assert.equal(h.auth.currentUser, h.member);
  assert.equal(h.calls.some(([name]) => name === "refresh"), false);
});

test("Play 서비스 오류와 OAuth 설정 오류는 안전한 한국어 안내로 변환한다", async () => {
  const h = harness({ playError: { code: "PLAY_SERVICES_NOT_AVAILABLE" } });
  await assert.rejects(h.api.loginGoogleAccount(), { code: "auth/google-play-services-unavailable" });
  const invalid = harness({ chooseError: { code: "10" } });
  await assert.rejects(invalid.api.loginGoogleAccount(), { code: "auth/google-configuration-missing" });
  assert.match(authErrorMessage({ code: "auth/google-play-services-unavailable" }), /Google Play/);
});

test("앱 설정은 기존 디자인·웹 설정을 유지하고 iOS 반환 URL만 추가한다", () => {
  const config = buildAppConfig(baseConfig, { EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: webClientId, EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: iosClientId });
  assert.deepEqual(config.web, baseConfig.web);
  assert.deepEqual(config.splash, baseConfig.splash);
  assert.deepEqual(config.android.adaptiveIcon, baseConfig.android.adaptiveIcon);
  assert.equal(config.ios.bundleIdentifier, "com.actiondoc.ttokdoc");
  assert.equal(config.android.package, "com.actiondoc.ttokdoc");
  const googlePlugin = config.plugins.find((item) => Array.isArray(item) && item[0] === "@react-native-google-signin/google-signin");
  assert.equal(googlePlugin[1].iosUrlScheme, "com.googleusercontent.apps.example-ios");
  assert.deepEqual(configurationErrors(config, "ios"), []);
  assert.deepEqual(configurationErrors(config, "android"), []);
});

test("iOS ID가 없는 웹 개발은 유지하고 iOS 빌드 사전 검사에서 누락을 알린다", () => {
  const config = buildAppConfig(baseConfig, {});
  assert.equal(config.plugins.some((item) => Array.isArray(item) && item[0].includes("google-signin")), false);
  assert.ok(configurationErrors(config, "ios").some((message) => message.includes("EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID")));
  assert.deepEqual(configurationErrors(config, "android"), []);
});
