import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Expo가 사용하는 ES 모듈 유틸을 앱의 패키지 설정 변경 없이 Node에서 검증한다.
const source = await readFile(new URL("../src/utils/preparationPlan.js", import.meta.url), "utf8");
const {
  createDocumentPlan, formatDeadline, formatStepDate, getDday, localPlanDate,
  sortPlanSteps, validatePlanStep, durationFromParts, formatDuration,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

const view = {
  id: "doc-a", title: "기숙사 신청 안내",
  todos: [{ id: "t1", text: "입사신청서 작성" }, { id: "t2", text: "주민등록등본 준비" }],
  requiredDocs: ["입사신청서", "주민등록등본"],
  deadline: { text: "2027년 1월 15일 16시", datetime: "2027-01-15T16:00" },
};
const form = (overrides = {}) => ({
  label: "입사신청서 작성", date: "", time: "", durationHours: "", durationMinutes: "", ...overrides,
});

test("문서의 제목·마감·할 일·필요 서류를 연결하고 준비 날짜와 소요시간은 만들지 않는다", () => {
  const plan = createDocumentPlan({ documentId: "doc-a", view }, "2027-01-10");
  assert.equal(plan.title, view.title);
  assert.deepEqual(plan.requiredDocs, view.requiredDocs);
  assert.deepEqual(plan.steps.slice(0, -1).map((step) => step.label), view.todos.map((todo) => todo.text));
  for (const step of plan.steps.slice(0, -1)) {
    assert.equal(step.date, "");
    assert.equal(step.time, "");
    assert.equal(step.durationMinutes, null);
    assert.equal(step.done, false);
    assert.equal(formatStepDate(step.date), "날짜 미정");
  }
  const deadline = plan.steps.at(-1);
  assert.equal(deadline.isDeadline, true);
  assert.equal(deadline.done, false);
  assert.equal(formatDeadline(deadline), "2027년 1월 15일 16:00");
  assert.equal(getDday(deadline.date, plan.referenceDate), "D-5");
});

test("시각 없는 마감일에 시각을 만들지 않고, 잘못된 날짜는 원문만 표시한다", () => {
  const dateOnly = createDocumentPlan({ view: { ...view, deadline: { datetime: "2027-01-15" } } });
  assert.equal(dateOnly.steps.at(-1).time, "");
  const invalid = createDocumentPlan({ view: { ...view, deadline: { datetime: "2027-02-30T17:00", text: "일정 추후 공지" } } });
  assert.equal(invalid.steps.at(-1).date, "");
  assert.equal(invalid.steps.at(-1).time, "");
  assert.equal(formatDeadline(invalid.steps.at(-1)), "일정 추후 공지");
  assert.equal(getDday(invalid.steps.at(-1).date, "2027-01-10"), "미정");
});

test("누락된 분석·할 일·마감일에 예시 장학금 데이터를 넣지 않는다", () => {
  const missing = createDocumentPlan({ documentId: "missing" });
  assert.equal(missing.hasAnalysis, false);
  assert.deepEqual(missing.steps, []);
  const empty = createDocumentPlan({ view: { title: "공지", todos: [] } });
  assert.equal(empty.steps.length, 1);
  assert.equal(formatDeadline(empty.steps[0]), "마감일 미정");
  assert.deepEqual(empty.requiredDocs, []);
});

test("다른 문서와 승인·삭제 후 갱신된 분석 결과는 각각 새 준비 항목을 만든다", () => {
  const first = createDocumentPlan({ view });
  first.steps[0].done = true;
  first.steps[0].date = "2027-01-12";
  const second = createDocumentPlan({ view: { ...view, id: "doc-b", title: "공모전", todos: [{ id: "t1", text: "기획서 제출" }] } });
  assert.equal(second.id, "doc-b");
  assert.equal(second.steps[0].label, "기획서 제출");
  assert.equal(second.steps[0].done, false);
  assert.equal(second.steps[0].date, "");
  const revised = createDocumentPlan({ view: { ...view, todos: [view.todos[1]], requiredDocs: ["주민등록등본"] } });
  assert.deepEqual(revised.steps.filter((step) => !step.isDeadline).map((step) => step.label), ["주민등록등본 준비"]);
  assert.deepEqual(revised.requiredDocs, ["주민등록등본"]);
  assert.equal(view.todos[0].text, "입사신청서 작성");
});

test("관련 서류를 일정 메모에 채우고 괄호 안의 세부 내용은 그대로 유지한다", () => {
  const document = "공인영어성적 (TOEIC, TOEFL, TOEIC Speaking, OPIc, New TEPS, G-TELP Lv.2)";
  const plan = createDocumentPlan({ view: {
    title: "성적장학금", requiredDocs: [document],
    todos: [{ id: "t1", text: "웹정보시스템에서 공인 영어 성적 입력 및 승인 완료 확인" },
      { id: "t2", text: "소속 학과 선발원칙 및 전공평가점수 산정기준 확인" },
      { id: "t3", text: "신청기간 내 장학금 신청" }],
  } });
  assert.equal(plan.steps[0].notes, `필요 서류: ${document}`);
  assert.equal(plan.steps[1].notes, "");
  assert.equal(plan.steps[2].notes, "");
  assert.equal(plan.steps.at(-1).notes, "");
  assert.equal(plan.steps[0].date, "");
  assert.equal(plan.steps[0].durationMinutes, null);
});

test("일정에서 이름을 지정한 서류만 연결하고 전체 서류 확인에는 전체 목록을 연결한다", () => {
  const plan = createDocumentPlan({ view: {
    title: "장학금", requiredDocs: ["신청서", "성적증명서", "통장 사본", "성적증명서", " 통장 사본 "],
    todos: [{ id: "t1", text: "성적증명서 발급" }, { id: "t2", text: "신청서 작성" },
      { id: "t3", text: "학생포털에서 서류 제출" }, { id: "t4", text: "제출 서류 최종 확인" }],
  } });
  assert.equal(plan.steps[0].notes, "필요 서류: 성적증명서");
  assert.equal(plan.steps[1].notes, "필요 서류: 신청서");
  assert.equal(plan.steps[2].notes, "필요 서류: 신청서, 성적증명서, 통장 사본");
  assert.equal(plan.steps[3].notes, "필요 서류: 신청서, 성적증명서, 통장 사본");
  assert.deepEqual(plan.requiredDocs, ["신청서", "성적증명서", "통장 사본"]);
});

test("공인영어성적 서류가 시험명 목록으로 추출되어도 영어성적 일정에 연결한다", () => {
  const document = "TOEIC, TOEFL, TOEIC Speaking, OPIc, New TEPS, G-TELP Lv.2 중 취득 성적";
  const plan = createDocumentPlan({ view: { title: "성적장학금", requiredDocs: [document],
    todos: [{ id: "english", text: "공인영어성적 입력 및 승인 완료 확인" },
      { id: "apply", text: "장학금 신청" }] } });
  assert.equal(plan.steps[0].notes, `필요 서류: ${document}`);
  assert.equal(plan.steps[1].notes, "");
});

test("삭제된 필요 서류는 다음 분석 결과의 자동 메모에 남지 않는다", () => {
  const plan = createDocumentPlan({ view });
  assert.equal(plan.steps[1].notes, "필요 서류: 주민등록등본");
  const revised = createDocumentPlan({ view: { ...view, requiredDocs: ["입사신청서"] } });
  assert.equal(revised.steps[1].notes, "");
  assert.equal(revised.steps[0].notes, "필요 서류: 입사신청서");
});

test("날짜 있는 준비 일정 → 날짜 미정 → 최종 마감 순서로 표시한다", () => {
  const steps = [
    { id: "deadline", isDeadline: true, date: "2027-01-15" },
    { id: "undated", date: null }, { id: "late", date: "2027-01-12" },
    { id: "early", date: "2027-01-11" },
  ];
  assert.deepEqual(sortPlanSteps(steps).map((step) => step.id), ["early", "late", "undated", "deadline"]);
  assert.equal(steps[0].id, "deadline");
});

test("날짜 미정인 항목을 수정할 수 있고 실제 날짜·시각과 마감 제약은 검증한다", () => {
  const steps = createDocumentPlan({ view }).steps;
  assert.equal(validatePlanStep(form(), steps, null, true), "");
  assert.match(validatePlanStep(form(), steps, null), /날짜/);
  assert.match(validatePlanStep(form({ date: "2027-02-30" }), steps, null, true), /날짜/);
  assert.match(validatePlanStep(form({ time: "17:00" }), steps, null, true), /먼저 날짜/);
  assert.match(validatePlanStep(form({ date: "2027-01-16" }), steps, null, true), /최종 마감일/);
  assert.equal(validatePlanStep(form({ date: "2027-01-15", time: "16:00" }), steps, null, true), "");
  const dated = [...steps, { id: "manual", date: "2027-01-14" }];
  assert.match(validatePlanStep(form({ date: "2027-01-13" }), dated, "document-deadline", true), /준비 일정 이후/);
});

test("시간·분 입력과 오늘 기준 D-day를 기존 형식으로 표시한다", () => {
  assert.equal(durationFromParts("1", "30"), 90);
  assert.equal(formatDuration(90), "1시간 30분");
  assert.equal(durationFromParts("", ""), null);
  assert.equal(Number.isNaN(durationFromParts("1", "60")), true);
  assert.equal(localPlanDate(new Date(2027, 0, 10, 23, 59)), "2027-01-10");
  assert.equal(getDday("2027-01-10", "2027-01-10"), "D-Day");
  assert.equal(getDday("2027-01-10", "2027-01-11"), "D+1");
});
