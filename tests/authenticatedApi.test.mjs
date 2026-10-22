import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Firebase 인증 상태와 전송 계층을 대체하고 실제 공통 요청 코드를 실행한다.
const source = (await readFile(new URL("../src/services/api.js", import.meta.url), "utf8"))
  .replace('import { Platform } from "react-native";', 'const Platform = { OS: "web" };')
  .replace('import { currentAuthUser } from "./auth";', 'const currentAuthUser = () => globalThis.apiTestUser;');
const { request, checkHealth } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const originalFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = originalFetch; delete globalThis.apiTestUser; });
const alice = { uid: "alice", getIdToken: async () => "test-token" };

test("문서 요청에 실제 로그인 토큰을 붙이고 캐시 사용을 막는다", async () => {
  globalThis.apiTestUser = alice;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.get("Authorization"), "Bearer test-token");
    assert.equal(options.cache, "no-store");
    assert.equal(options.headers.get("Content-Type"), null);
    return new Response(JSON.stringify([{ id: "own-document" }]));
  };
  assert.deepEqual(await request("/api/documents"), [{ id: "own-document" }]);
});

test("로그인하지 않은 개인 요청은 서버로 보내지 않고 공개 요청은 가능하다", async () => {
  globalThis.apiTestUser = null;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(options.headers.get("Authorization"), null);
    return new Response('{"status":"ok"}');
  };
  await assert.rejects(request("/api/documents"), (error) => error.status === 401);
  assert.equal(calls, 0);
  assert.deepEqual(await checkHealth(), { status: "ok" });
});

test("응답을 기다리는 중 계정이 바뀌면 이전 계정의 내용을 반환하지 않는다", async () => {
  globalThis.apiTestUser = alice;
  globalThis.fetch = async () => {
    globalThis.apiTestUser = { uid: "bob" };
    return new Response('{"private":"alice"}');
  };
  await assert.rejects(request("/api/documents"), /계정이 변경/);
});

test("삭제 진행 상태와 재인증 요구 코드를 화면에서 구분할 수 있다", async () => {
  globalThis.apiTestUser = alice;
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: { code: "account-deleting", message: "진행 중" } }), { status: 423 });
  await assert.rejects(request("/api/documents"), (error) => error.code === "account-deleting" && error.status === 423);
});

test("원문 이미지도 동일한 인증 요청으로 받는다", async () => {
  globalThis.apiTestUser = alice;
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.get("Authorization"), "Bearer test-token");
    return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "Content-Type": "image/png" } });
  };
  const blob = await request("/api/documents/own/pages/1/image", {}, { responseType: "blob" });
  assert.equal(blob.type, "image/png");
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [137, 80, 78, 71]);
});
