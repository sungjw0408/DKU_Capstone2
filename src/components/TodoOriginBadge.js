import React from "react";
import Badge from "./Badge";

export default function TodoOriginBadge({ todo }) {
  const stepId = todo.step_id ?? todo.id?.split("__").pop() ?? "";
  if (todo.origin === "ai" || (!todo.origin && stepId.startsWith("document-todo-"))) {
    return <Badge label="AI 생성" tone="stamp" />;
  }
  if (todo.origin === "user" || (!todo.origin && stepId.startsWith("custom-step-"))) {
    return <Badge label="직접 추가" tone="green" />;
  }
  return null;
}
