// 할 일 탭: 위쪽에서 [할 일 | 문서]를 고른다.
// - 할 일: 등록한 모든 문서의 준비 할 일을 날짜별로 모아 보고 바로 체크한다.
// - 문서: 올린 문서 전체 목록 (검색·필터, DocumentListPanel)
import React, { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Card from "../components/Card";
import DocumentListPanel from "../components/DocumentListPanel";
import { colors, spacing, type } from "../theme/theme";
import { listTodos, updateTodo } from "../services/api";
import { groupTodos, todoDateLabel } from "../utils/todoList";

const SECTIONS = [
  ["overdue", "지난 할 일"],
  ["today", "오늘"],
  ["upcoming", "다가오는 할 일"],
  ["undated", "날짜 미정"],
];

export default function TodosScreen({ navigation }) {
  const [view, setView] = useState("todos"); // "todos" | "documents"
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [reload, setReload] = useState(0);

  // 탭에 들어올 때마다 다시 불러온다 (관리 화면에서 체크하고 돌아와도 반영)
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError("");
    listTodos()
      .then((items) => { if (active) setTodos(items); })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]));

  const groups = useMemo(() => groupTodos(todos), [todos]);
  const remaining = todos.length - groups.done.length;

  const toggle = async (item) => {
    if (busyId) return;
    const completed = !item.is_completed;
    setBusyId(item.id);
    setTodos((prev) => prev.map((t) => (t.id === item.id ? { ...t, is_completed: completed } : t)));
    try {
      await updateTodo(item.id, completed);
    } catch (e) {
      setTodos((prev) => prev.map((t) => (t.id === item.id ? { ...t, is_completed: item.is_completed } : t)));
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const openDocument = (item) => {
    if (!item.document_id) return;
    navigation.navigate("Management", { documentId: item.document_id, documentTitle: item.doc_title });
  };

  const renderRow = (item, idx, tone) => (
    <View key={item.id} style={[styles.row, idx > 0 && styles.divider]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`${item.title} 완료`}
        aria-checked={!!item.is_completed}
        disabled={!!busyId}
        onPress={() => toggle(item)}
        hitSlop={8}
      >
        <Ionicons
          name={item.is_completed ? "checkbox" : "square-outline"}
          size={22}
          color={item.is_completed ? colors.stamp : colors.muted}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.doc_title} 관리 화면 열기`}
        onPress={() => openDocument(item)}
        style={({ pressed }) => [styles.rowBody, pressed && styles.pressed]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[type.bodyStrong, item.is_completed && styles.doneText]} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.sub} numberOfLines={1}>{item.doc_title}</Text>
        </View>
        <Text style={[styles.when, tone === "overdue" && { color: colors.alert }]}>
          {todoDateLabel(item.date)}{item.time ? ` ${item.time}` : ""}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.muted} />
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={type.display}>{view === "documents" ? "문서" : "할 일"}</Text>
        <View style={styles.segment} accessibilityRole="tablist">
          {[["todos", "할 일"], ["documents", "문서"]].map(([key, label]) => (
            <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: view === key }}
              onPress={() => setView(key)} style={[styles.segmentItem, view === key && styles.segmentOn]}>
              <Text style={[styles.segmentText, view === key && styles.segmentTextOn]}>
                {key === "todos" && !loading ? `${label} ${remaining}` : label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {view === "documents" ? <DocumentListPanel /> : <>
        {!!error && (
          <View style={styles.errorBox}>
            <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => setReload((n) => n + 1)} hitSlop={8}>
              <Text style={[type.bodyStrong, { color: colors.stamp }]}>다시 불러오기</Text>
            </Pressable>
          </View>
        )}

        {loading && todos.length === 0 ? (
          <Card><ActivityIndicator color={colors.stamp} /></Card>
        ) : remaining === 0 ? (
          <Card style={styles.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={36} color={colors.stamp} />
            <Text style={type.bodyStrong}>남은 할 일이 없어요</Text>
            <Text style={type.small}>문서를 추가하고 준비 계획을 등록하면 여기에 모여요.</Text>
          </Card>
        ) : (
          SECTIONS.map(([key, label]) => groups[key].length > 0 && (
            <View key={key} style={styles.section}>
              <Text style={[styles.sectionTitle, key === "overdue" && { color: colors.alert }]}>
                {label} {groups[key].length}
              </Text>
              <Card style={styles.listCard}>{groups[key].map((item, idx) => renderRow(item, idx, key))}</Card>
            </View>
          ))
        )}

        {groups.done.length > 0 && (
          <View style={styles.section}>
            <Pressable accessibilityRole="button" onPress={() => setShowDone((v) => !v)} hitSlop={8} style={styles.doneToggle}>
              <Text style={styles.sectionTitle}>완료한 일 {groups.done.length}</Text>
              <Ionicons name={showDone ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
            </Pressable>
            {showDone && <Card style={styles.listCard}>{groups.done.map((item, idx) => renderRow(item, idx, "done"))}</Card>}
          </View>
        )}
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: 2 },
  segment: { flexDirection: "row", backgroundColor: colors.line, borderRadius: 999, padding: 3, marginTop: spacing.sm },
  segmentItem: { flex: 1, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { fontSize: 14, fontWeight: "600", color: colors.muted },
  segmentTextOn: { color: colors.ink },
  container: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl },
  errorBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginBottom: spacing.md },
  errorText: { ...type.small, color: colors.alert, flex: 1 },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  section: { marginBottom: spacing.lg },
  sectionTitle: { ...type.label, fontSize: 12, marginBottom: spacing.xs },
  listCard: { paddingVertical: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  rowBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  when: { fontSize: 12, fontWeight: "600", color: colors.ink },
  doneText: { color: colors.muted, textDecorationLine: "line-through" },
  doneToggle: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  pressed: { opacity: 0.6 },
});
