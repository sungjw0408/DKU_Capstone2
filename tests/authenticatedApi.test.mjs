import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Firebase 인증 상태와 전송 계층을 대체하고 실제 공통 요청 코드를 실행한다.
const source = (await readFile(new URL("../src/services/api.js", import.meta.url), "utf8"))
  .replace('import { Platform } from "react-native";', 'const Platform = { OS: "web" };')
  .replace('import { currentAuthUser } from "./auth";', 'const currentAuthUser = () => globalThis.apiTestUser;')
  .replace('import { emitDataChanged } from "./dataEvents";', 'const emitDataChanged = () => { globalThis.apiDataChanged = (globalThis.apiDataChanged || 0) + 1; };');
const { request, checkHealth, deleteDocument, deleteDocuments } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
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

test("문서·할 일을 바꾸는 요청이 성공하면 알림 다시 예약 신호를 보낸다", async () => {
  globalThis.apiTestUser = alice;
  globalThis.apiDataChanged = 0;
  globalThis.fetch = async () => new Response("{}");
  await request("/api/documents");
  assert.equal(globalThis.apiDataChanged, 0); // 조회는 신호 없음
  await request("/api/todos/t1", { method: "PATCH", body: "{}" });
  await request("/api/documents/d1", { method: "DELETE" });
  assert.equal(globalThis.apiDataChanged, 2);
  globalThis.fetch = async () => new Response('{"detail":"실패"}', { status: 500 });
  await assert.rejects(request("/api/documents/d1", { method: "DELETE" }));
  assert.equal(globalThis.apiDataChanged, 2); // 실패하면 신호 없음
});

test("목록의 문서 삭제는 해당 ID로 인증된 DELETE를 보내고 실패를 호출자에게 전달한다", async () => {
  globalThis.apiTestUser = alice;
  globalThis.apiDataChanged = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, "/api/documents/doc%2Fone");
    assert.equal(options.method, "DELETE");
    assert.equal(options.headers.get("Authorization"), "Bearer test-token");
    return new Response('{"deleted":true}');
  };
  assert.deepEqual(await deleteDocument("doc/one"), { deleted: true });
  assert.equal(globalThis.apiDataChanged, 1);
  globalThis.fetch = async () => new Response('{"detail":"삭제 실패"}', { status: 500 });
  await assert.rejects(deleteDocument("doc/one"), /삭제 실패/);
  assert.equal(globalThis.apiDataChanged, 1);
});

test("선택 삭제는 중복 ID를 한 번만 보내고 성공·실패·이미 삭제된 문서를 구분한다", async () => {
  globalThis.apiTestUser = alice;
  globalThis.apiDataChanged = 0;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const id = new URL(url).pathname.split("/").pop();
    calls.push(id);
    assert.equal(options.method, "DELETE");
    assert.equal(options.headers.get("Authorization"), "Bearer test-token");
    if (id === "failed") return new Response('{"detail":"잠시 후 다시 시도"}', { status: 500 });
    if (id === "missing") return new Response('{"detail":"문서 없음"}', { status: 404 });
    return new Response("{}");
  };
  assert.deepEqual(await deleteDocuments(["one", "failed", "one", "missing", "two"]), {
    deletedIds: ["one", "missing", "two"],
    failures: [{ id: "failed", message: "잠시 후 다시 시도" }],
  });
  assert.deepEqual(calls, ["one", "failed", "missing", "two"]);
  assert.equal(globalThis.apiDataChanged, 2);
});

test("선택 삭제 중 계정이 바뀌면 남은 문서의 삭제 요청을 보내지 않는다", async () => {
  globalThis.apiTestUser = alice;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(new URL(url).pathname);
    const response = new Response("{}");
    response.json = async () => { globalThis.apiTestUser = { uid: "bob" }; return {}; };
    return response;
  };
  const result = await deleteDocuments(["one", "two", "three"]);
  assert.deepEqual(result.deletedIds, ["one"]);
  assert.deepEqual(result.failures.map((failure) => failure.id), ["two", "three"]);
  assert.match(result.failures[0].message, /계정이 변경/);
  assert.deepEqual(calls, ["/api/documents/one"]);
});

test("선택 삭제 중 인증이 만료되면 중단하고 나머지는 실패 목록에 남긴다", async () => {
  globalThis.apiTestUser = alice;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('{"detail":"인증 만료"}', { status: 401 }); };
  const result = await deleteDocuments(["one", "two"]);
  assert.deepEqual(result.deletedIds, []);
  assert.deepEqual(result.failures.map((failure) => failure.id), ["one", "two"]);
  assert.equal(calls, 1);
});
