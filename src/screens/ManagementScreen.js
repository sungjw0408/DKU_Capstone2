// src/screens/ManagementScreen.js
import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Card from "../components/Card";
import ProgressBar from "../components/ProgressBar";
import { colors, spacing, type } from "../theme/theme";

import { listTodos, updateTodo, deleteTodo } from "../services/api";

export default function ManagementScreen({ route }) {
  const documentId = route?.params?.documentId;
  const [todoList, setTodoList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError("");
    listTodos(documentId).then((items) => { if (active) setTodoList(items); })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [documentId]));

  const handleToggle = async (todoId, currentStatus) => {
    if (busyId) return;
    setBusyId(todoId);
    const nextStatus = !currentStatus;
    setTodoList((prev) => prev.map((item) => item.id === todoId ? { ...item, is_completed: nextStatus } : item));
    try { await updateTodo(todoId, nextStatus); }
    catch (e) {
      setTodoList((prev) => prev.map((item) => item.id === todoId ? { ...item, is_completed: currentStatus } : item));
      setError(e.message);
    } finally { setBusyId(null); }
  };

  const removeTodo = async (todoId) => {
    if (busyId) return;
    setBusyId(todoId);
    setError("");
    try {
      await deleteTodo(todoId);
      setTodoList((prev) => prev.filter((item) => item.id !== todoId));
    } catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };

  const handleDelete = (todoId, todoTitle) => {
    if (Platform.OS === "web") {
      if (window.confirm(`'${todoTitle}' 항목을 삭제하시겠습니까?`)) removeTodo(todoId);
      return;
    }
    Alert.alert("할 일 삭제", `'${todoTitle}' 항목을 삭제하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => removeTodo(todoId) },
    ]);
  };

  // 진행률 자동 계산
  const completedCount = todoList.filter((item) => item.is_completed).length;
  const progress = todoList.length > 0 ? completedCount / todoList.length : 0;

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator size="large" color={colors.stamp} />
        <Text style={{ marginTop: spacing.md, color: colors.muted }}>할 일 목록을 불러오는 중...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={type.h1}>등록 후 관리</Text>
        <Text style={styles.subtitle}>마감일까지 진행 상황을 지켜볼게요</Text>
        {!!error && <Text accessibilityRole="alert" style={[type.small, { color: colors.alert }]}>{error}</Text>}

        <Card style={styles.card}>
          <Text style={type.bodyStrong}>
            {todoList[0]?.doc_title || route?.params?.documentTitle || "할 일 목록"}
          </Text>

          <View style={{ marginVertical: spacing.md }}>
            <ProgressBar progress={progress} />
            <Text style={styles.progressLabel}>
              {completedCount} / {todoList.length} 완료
            </Text>
          </View>

          {todoList.length === 0 ? (
            <Text style={styles.emptyText}>등록된 할 일이 없습니다.</Text>
          ) : (
            todoList.map((item) => (
              <View key={item.id} style={styles.stepRow}>
                {/* 체크박스 & 텍스트 영역 */}
                <Pressable
                  style={styles.todoContent}
                  accessibilityRole="checkbox" accessibilityLabel={`${item.title} 완료`} aria-checked={!!item.is_completed}
                  disabled={!!busyId} onPress={() => handleToggle(item.id, item.is_completed)}
                >
                  <Ionicons
                    name={item.is_completed ? "checkbox" : "square-outline"}
                    size={20}
                    color={item.is_completed ? colors.stamp : colors.muted}
                  />
                  <Text style={[type.body, item.is_completed && styles.doneText]}>
                    {item.title}
                  </Text>
                </Pressable>

                {/* 쓰레기통 삭제 버튼 */}
                <Pressable
                  style={styles.deleteButton}
                  accessibilityRole="button" accessibilityLabel={`${item.title} 삭제`} disabled={!!busyId}
                  onPress={() => handleDelete(item.id, item.title)}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.muted} />
                </Pressable>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  center: { alignItems: "center", justifyContent: "center" },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  subtitle: { ...type.body, color: colors.muted, marginTop: 4, marginBottom: spacing.lg },
  card: { marginBottom: spacing.lg },
  progressLabel: { ...type.small, marginTop: spacing.xs },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  todoContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flex: 1,
  },
  deleteButton: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
  doneText: { color: colors.muted, textDecorationLine: "line-through" },
  emptyText: { ...type.body, color: colors.muted, textAlign: "center", paddingVertical: spacing.lg },
});