import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function sourceModule(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
}
const { compareNoticeAffiliation, createAffiliationMatcher } = await sourceModule("../src/utils/noticeEligibility.js");
const { gmailComposeUrl, signedInWithGoogle } = await sourceModule("../src/utils/noticeMail.js");
const { notificationRoute } = await sourceModule("../src/navigation/routes.js");

const catalog = JSON.parse(await readFile(new URL("../backend/app/data/affiliations.json", import.meta.url), "utf8"));
const match = createAffiliationMatcher(catalog);
const software = { universityId: "dankook", campusId: "jukjeon", collegeId: "sw-convergence", departmentId: "sw-convergence-software" };
const computer = { ...software, departmentId: "sw-convergence-computer" };
const criterion = (value, extra) => ({ key: "applicant_criteria", status: "verified", value, ...extra });
const excluded = (value) => criterion(value, { key: "applicant_exclusion" });
const status = (fields, profile = software) => compareNoticeAffiliation(fields, profile, match)?.status;

test("같은 학과의 약칭과 단과대 명칭을 인식하고, 단과대 안의 다른 학과는 구분한다", () => {
  assert.equal(status([criterion("ＳＷ 학과 재학생")]), "yes");
  assert.equal(status([criterion("SW융합대학 재학생")]), "yes");
  assert.equal(status([criterion("AI융합대학 소프트웨어학과 재학생")]), "yes");
  assert.equal(status([criterion("SW융합대학 소프트웨어학과 재학생")], computer), "no");
  assert.equal(status([criterion("공과대학 또는 SW학과 재학생")]), "yes");
  assert.equal(status([criterion("가상소프트웨어학과 재학생")]), "review");
});

test("소속 제외를 우선하고, 편입 여부와 근거가 불분명한 항목은 확인이 필요하다", () => {
  const included = criterion("SW융합대학 재학생");
  assert.equal(status([included, excluded("SW학과")]), "no");
  assert.equal(status([included, excluded("컴퓨터공학과")]), "yes");
  assert.equal(status([included, excluded("편입생 지원 불가")]), "review");
  assert.equal(status([included, criterion("컴퓨터공학과", { status: "unverified", key: "applicant_exclusion" })]), "review");
  assert.equal(status([criterion("SW학과 지원 불가"), included]), "no");
  assert.equal(status([criterion("SW학과", { evidence: { matched_text: "SW학과 학생은 신청 불가" } })]), "review");
  assert.equal(status([included, criterion("평점 3.5 이상")]), "review");
  assert.equal(status([included], { accountType: "guest" }), "review");
  assert.equal(status([]), undefined);
});

test("등록 후 관리의 소속 판정은 신청 대상에 단과대나 학과가 나올 때만 표시한다", () => {
  const forManagement = (fields) => compareNoticeAffiliation(fields, software, match, { collegeOrDepartmentOnly: true });
  assert.equal(forManagement([criterion("단국대학교 죽전캠퍼스 재학생")]), null);
  assert.equal(forManagement([criterion("전학과 재학생")]), null);
  assert.equal(forManagement([criterion("단국대학교 재학생"), excluded("컴퓨터공학과")]), null);
  assert.equal(forManagement([criterion("ＳＷ 학과 재학생")]).status, "yes");
  assert.equal(forManagement([criterion("컴퓨터공학과 재학생")]).status, "no");
  assert.equal(forManagement([criterion("SW융합대학 재학생"), excluded("SW학과")]).status, "no");
  assert.equal(forManagement([criterion("SW융합대학 재학생"), excluded("편입생")]).status, "review");
  assert.equal(forManagement([criterion("가상융합학과 재학생")]).status, "review");
});

test("Gmail 작성 주소에 수정한 제목과 한글 본문을 안전하게 채운다", () => {
  const body = "안녕하세요.\n서류 A & B를 문의드립니다.";
  const url = new URL(gmailComposeUrl("sw+help@example.edu", "장학 & 연구\n수강 공지", body));
  assert.equal(url.origin, "https://mail.google.com");
  assert.equal(url.searchParams.get("view"), "cm");
  assert.equal(url.searchParams.get("to"), "sw+help@example.edu");
  assert.equal(url.searchParams.get("su"), "장학 & 연구 수강 공지");
  assert.equal(url.searchParams.get("body"), body);
});

test("계정에 Google이 연결되어 있어도 비밀번호로 들어온 세션에서는 메일 기능을 숨긴다", async () => {
  const user = { providerData: [{ providerId: "google.com" }] };
  assert.equal(await signedInWithGoogle({ ...user, getIdTokenResult: async () => ({ signInProvider: "password" }) }), false);
  assert.equal(await signedInWithGoogle({ ...user, getIdTokenResult: async () => ({ signInProvider: "google.com" }) }), true);
  assert.equal(await signedInWithGoogle({ isAnonymous: true }), false);
});

test("공지, 개별 할 일, 묶음 할 일 알림을 서로 다른 대상으로 연결한다", () => {
  assert.equal(notificationRoute({ kind: "deadline", documentId: "notice" }).params.documentId, "notice");
  assert.deepEqual(notificationRoute({ kind: "todo", documentId: "notice", todoId: "todo-2" }), {
    name: "Management", params: { documentId: "notice", todoId: "todo-2" },
  });
  assert.deepEqual(notificationRoute({ kind: "todo" }), {
    name: "Tabs", params: { screen: "Todos" },
  });
  assert.equal(notificationRoute({ kind: "deadline" }), null);
});
