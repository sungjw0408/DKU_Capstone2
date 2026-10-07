export function upcomingDocuments(documents, sortBy = "dday") {
  return documents.filter((item) => typeof item.dday === "number" && item.dday <= 0).sort((a, b) =>
    sortBy === "recent" ? (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0)
      : Math.abs(a.dday) - Math.abs(b.dday) || (a.deadline || "").localeCompare(b.deadline || ""));
}

export function ddayLabel(value) {
  return value == null ? "미정" : value === 0 ? "D-Day" : value < 0 ? `D${value}` : `D+${value}`;
}

export function planProgress(plan) {
  const steps = (plan?.steps || []).filter((step) => !step.isDeadline);
  return steps.length ? steps.filter((step) => step.done).length / steps.length : 0;
}
