const CRITERIA = "applicant_criteria";
const EXCLUSION = "applicant_exclusion";
const EXCLUDED = /(?:신청|지원|접수)(?:은|는|이|가|을|를)?\s*(?:불가|할\s*수\s*없)|제외/;
const POSITIVE = /(?:신청|지원|접수)\s*(?:가능|대상)|자격\s*요건/;
const WORD = "가-힣a-z0-9";
const ENDING = "재학생|학부생|학생|소속|전공자|생|에서|에는|에게|으로|이며|의|은|는|이|가|과|와|만";
const UNIT_BOUNDARY = "(?=$|[^" + WORD + "]|(?:" + ENDING + ")(?=$|[^" + WORD + "]))";
const NAMED_UNIT = new RegExp("(^|[^" + WORD + "])([" + WORD + "]+)(?:학과|학부|대학)" + UNIT_BOUNDARY, "g");
const GENERAL_UNIT_PREFIX = /^(?:전|전체|모든|본|해당|특정|타|다른|일부|각|소속|단과|국내|국외|해외|외국|다니는|출신)$/;
const normalize = (value) => value.normalize("NFKC").toLowerCase().trim();
const isEligibilityField = ({ key }) => key === CRITERIA || key === EXCLUSION;

export const hasNoticeEligibility = (fields) => fields.some(isEligibilityField);

function affiliationNames(catalog) {
  const names = new Map();
  const add = (entry, kind) => {
    for (const name of [entry.name, ...(entry.aliases ?? [])]) {
      const key = normalize(name).replace(/\s/g, "");
      if (!names.has(key)) names.set(key, { id: entry.id, kind });
      else if (names.get(key)?.id !== entry.id) names.set(key, null);
    }
  };

  add(catalog.university, "universityId");
  const campus = catalog.university;
  add({ id: campus.campusId, name: campus.campusName, aliases: [campus.campusName + "캠퍼스"] }, "campusId");
  for (const college of catalog.colleges) {
    add(college, "collegeId");
    for (const department of college.departments) add(department, "departmentId");
  }
  return names;
}

export function createAffiliationMatcher(catalog) {
  const names = affiliationNames(catalog);
  const alternatives = [...names.keys()].sort((a, b) => b.length - a.length)
    .map((name) => [...name].map((char) => "\\^$.*+?()[]{}|".includes(char) ? "\\" + char : char).join("\\s*"));
  const pattern = new RegExp(
    "(^|[^" + WORD + "])(" + alternatives.join("|") + ")" + UNIT_BOUNDARY,
    "g",
  );
  const findUnit = (name) => names.get(name.replace(/\s/g, ""));
  const mentionsCollegeOrDepartment = (text) => {
    for (const [, , name] of normalize(text).matchAll(pattern)) {
      const kind = findUnit(name)?.kind;
      if (kind === "collegeId" || kind === "departmentId") return true;
    }
    return false;
  };
  const compare = (text, profile) => {
    const units = [];
    const expression = normalize(text).replace(pattern, (_, prefix, name) => {
      const index = units.push(findUnit(name)) - 1;
      return prefix + "#" + index + "#";
    });
    if (!units.length) return "unknown";

    const groups = expression.replace(/#(?:와|과)\s+/g, "#,")
      .split(/[,/·;]|\s*(?:또는|혹은|및)\s*/).filter((part) => part.trim());
    const matches = groups.map((group) => {
      const mentioned = [];
      const rest = group.replace(/#(\d+)#/g, (_, index) => {
        mentioned.push(units[Number(index)]);
        return "";
      })
        .replace(/^\s*(?:(?:신청|지원|접수)\s*(?:가능|불가)?\s*대상(?:자|은|는)?|(?:신청\s*)?제외\s*대상|자격\s*요건)\s*:?\s*/, "")
        .replace(/(?:신청|지원|접수)(?:은|는|이|가|을|를)?\s*(?:가능(?:합니다|함)?|불가(?:합니다|함)?|할\s*수\s*없(?:습니다|음)?)|(?:신청|지원)\s*대상에서\s*제외(?:됩니다)?/g, "")
        .replace(/\s+제외(?:됩니다|함)?(?=[.\s)]*$)/, "")
        .replace(/\s+/g, "")
        .replace(/^[\[(]+|[\]).。]+$/g, "");
      if (!mentioned.length || mentioned.some((unit) => !unit)) return "unknown";
      if (!/^(?:의|은|는|이|가|에서|으로|재학생|학부생|학생|소속|전공자|생|전체|대상|만|한정)*$/.test(rest)) return "unknown";
      if (new Set(mentioned.map((unit) => unit.kind)).size < new Set(mentioned.map((unit) => unit.id)).size) return "unknown";
      return mentioned.every(({ kind, id }) => profile[kind] === id) ? "match" : "different";
    });
    if (matches.includes("unknown")) return "unknown";
    return matches.includes("match") ? "match" : "different";
  };
  return { compare, mentionsCollegeOrDepartment };
}

export function compareNoticeAffiliation(fields, profile, matcher, { collegeOrDepartmentOnly = false } = {}) {
  const conditions = fields.filter(isEligibilityField);
  if (!conditions.length) return null;
  if (collegeOrDepartmentOnly && !conditions.some(({ key, value }) => {
    if (key !== CRITERIA || !value) return false;
    if (matcher?.mentionsCollegeOrDepartment(value)) return true;
    return Array.from(normalize(value).matchAll(NAMED_UNIT)).some(([, , name]) => !GENERAL_UNIT_PREFIX.test(name));
  })) return null;
  if (!profile?.collegeId || !profile?.departmentId) return { status: "review", reason: "소속 정보가 필요해요." };
  if (!matcher) return { status: "review", reason: "소속 목록을 불러오지 못했어요." };

  const inclusions = [];
  const exclusions = [];
  for (const field of conditions) {
    const value = field.value ?? "";
    const evidence = field.evidence?.matched_text ?? "";
    const excluded = field.key === EXCLUSION || EXCLUDED.test(value);
    const trusted = field.status === "user_confirmed"
      || (field.status === "verified" && !field.checks?.some((check) => !check.passed));
    // 과거 분석에서 제외 문구가 빠졌거나 한 줄에 여러 조건이 섞였으면 단정하지 않는다.
    const mixed = (excluded && POSITIVE.test(value.replace(/(?:신청|지원|접수)\s*대상에서\s*제외/, "")))
      || (!excluded && EXCLUDED.test(evidence))
      || (excluded && /제외하지|불가하지|제외\s*예외/.test(value + " " + evidence));
    const check = trusted && !mixed ? matcher.compare(value, profile) : "unknown";
    (excluded ? exclusions : inclusions).push(check);
  }

  if (exclusions.includes("match")) return { status: "no", reason: "내 소속이 신청 불가 대상에 포함돼요." };
  if (inclusions.length && inclusions.every((result) => result === "different")) {
    return { status: "no", reason: "공지에 나온 신청 대상 소속과 달라요." };
  }
  if (inclusions.includes("match") && !inclusions.includes("unknown") && !exclusions.includes("unknown")) {
    return { status: "yes", reason: "신청 대상에 내 소속이 포함돼요. 재학 상태 등 별도 자격은 공지에서 확인해 주세요." };
  }
  return { status: "review", reason: "소속만으로 판단하기 어려워요. 신청 조건과 제외 대상을 원문에서 확인해 주세요." };
}
