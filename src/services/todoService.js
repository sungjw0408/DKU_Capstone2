import { db } from "./firebase";

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";


export async function saveTodosForDocument({
  documentId,
  documentTitle,
  steps,
}) {
  if (!documentId) {
    throw new Error("documentId가 없습니다.");
  }

  const todosRef = collection(db, "todos");

  // 같은 문서에서 전에 등록했던 Todo 조회
  const existingQuery = query(
    todosRef,
    where("document_id", "==", documentId)
  );

  const existingSnapshot = await getDocs(existingQuery);

  const batch = writeBatch(db);

  // 기존 Todo 제거
  existingSnapshot.forEach((snapshot) => {
    batch.delete(snapshot.ref);
  });

  // 최종 마감 일정은 Todo에서 제외
  const todoSteps = steps.filter(
    (step) => !step.isDeadline
  );

  todoSteps.forEach((step, index) => {
    const stepId = encodeURIComponent(
      String(step.id ?? index)
    );

    const todoRef = doc(
      db,
      "todos",
      `${documentId}_${stepId}`
    );

    batch.set(todoRef, {
      document_id: documentId,
      doc_title: documentTitle,

      title: step.label,

      date: step.date ?? null,
      time: step.time ?? null,

      is_completed: step.done ?? false,

      order: index,

      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  });

  await batch.commit();

  return todoSteps.length;
}


export async function getTodosByDocument(documentId) {
  if (!documentId) {
    return [];
  }

  const q = query(
    collection(db, "todos"),
    where("document_id", "==", documentId)
  );

  const snapshot = await getDocs(q);

  const todos = snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));

  todos.sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  );

  return todos;
}


export async function updateTodoCompleted(
  todoId,
  isCompleted
) {
  const todoRef = doc(db, "todos", todoId);

  await updateDoc(todoRef, {
    is_completed: isCompleted,
    updated_at: serverTimestamp(),
  });
}


export async function deleteTodo(todoId) {
  const todoRef = doc(db, "todos", todoId);

  await deleteDoc(todoRef);
}