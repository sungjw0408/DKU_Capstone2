// src/screens/ManagementScreen.js
import React, { useCallback, useLayoutEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, Platform, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Card from "../components/Card";
import ProgressBar from "../components/ProgressBar";
import { colors, spacing, type, radius } from "../theme/theme";
import { listTodos, updateTodo, deleteTodo, listDocuments } from "../services/api";
import { formatStepDate, getDday, localPlanDate } from "../utils/preparationPlan";
import { daysUntil, googleCalendarUrl, isOverdue, nextTodo, splitDeadline } from "../utils/todoManagement";
import { ddayTone, DDAY_COLORS } from "../utils/dday";


// 주소 열기: 웹은 새 탭으로, 폰은 캘린더 앱(또는 브라우저)으로
function openUrl(url) {
  if (!url) return;
  if (Platform.OS === "web") window.open(url, "_blank", "noopener");
  else Linking.openURL(url);
}

// 할 일 하나 → Google 캘린더 주소 (날짜가 없으면 null)
function todoCalendarUrl(item) {
  return googleCalendarUrl({
    title: item.title,
    date: item.date,
    time: item.time,
    durationMinutes: item.duration_minutes,
    details: `${item.doc_title} 준비 일정 (ActionDoc)`,
  });
}

export default function ManagementScreen({ navigation, route }) {
  const documentId = route?.params?.documentId;
  const [todoList, setTodoList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [doc, setDoc] = useState(null);
  const goHome = useCallback(() => {
    navigation.reset({ index: 0, routes: [{ name: "Home" }] });
  }, [navigation]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={goHome} accessibilityRole="button" accessibilityLabel="홈으로" hitSlop={8} style={{ paddingHorizontal: 4 }}>
          <Ionicons name="home-outline" size={22} color={colors.ink} />
        </Pressable>
      ),
    });
  }, [navigation, goHome]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      listTodos(documentId),
      listDocuments().catch(() => []), // 마감 정보는 못 불러와도 할 일 목록은 보여줌
    ])
      .then(([items, documents]) => {
        if (!active) return;
        setTodoList(items);
        const id = documentId || items[0]?.document_id;
        setDoc((documents || []).find((d) => d.id === id) || null);
      })
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
  // 마감일 → 남은 일수 → 배지
  const deadline = splitDeadline(doc?.deadline);
  const ddayLabel = deadline ? getDday(deadline.date, localPlanDate()) : null;
  const ddayColor = DDAY_COLORS[ddayTone(deadline ? daysUntil(deadline.date) : null)];
  const allDone = todoList.length > 0 && completedCount === todoList.length;
  const next = nextTodo(todoList);
  const deadlineUrl = deadline && googleCalendarUrl({
    title: `[마감] ${todoList[0]?.doc_title || route?.params?.documentTitle || "신청"}`,
    date: deadline.date,
    time: deadline.time,
    durationMinutes: 30,
    details: "ActionDoc에서 등록한 신청 마감 일정",
  });

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator size="large" color={colors.stamp} />
        <Text style={{ marginTop: spacing.md, color: colors.muted }}>할 일 목록을 불러오는 중...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={type.h1}>등록 후 관리</Text>
        <Text style={styles.subtitle}>마감일까지 진행 상황을 지켜볼게요</Text>
        {!!error && <Text accessibilityRole="alert" style={[type.small, { color: colors.alert }]}>{error}</Text>}

        <Card style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.docTitle} numberOfLines={2}>
              {todoList[0]?.doc_title || route?.params?.documentTitle || "할 일 목록"}
            </Text>
            {ddayLabel && (
              <View style={[styles.ddayBadge, { backgroundColor: ddayColor.bg }]}>
                <Text style={[styles.ddayText, { color: ddayColor.fg }]}>{ddayLabel}</Text>
              </View>
            )}
          </View>
          {deadline && (
            <Text style={styles.deadlineText}>
              {formatStepDate(deadline.date)}{deadline.time ? ` ${deadline.time}` : ""} 마감
            </Text>
          )}

          <View style={{ marginVertical: spacing.md }}>
            <ProgressBar progress={progress} color={allDone ? "#2a7ea1" : colors.stamp} />
            <Text style={styles.progressLabel}>
              {completedCount} / {todoList.length} 완료
            </Text>
          </View>

          {/* 다음 할 일 또는 모두 완료 */}
          {allDone ? (
            <View style={[styles.banner, { backgroundColor: "#E3F4FC" }]}>
              <Text style={styles.bannerEmoji}>🎉</Text>
              <Text style={[styles.bannerText, { color: "#0B6E99" }]}>
                준비를 모두 마쳤어요! 마감 전에 제출만 확인하세요.
              </Text>
            </View>
          ) : next ? (
            <View style={[styles.banner, { backgroundColor: colors.stampSoft }]}>
              <Ionicons name="arrow-forward-circle" size={18} color={colors.stamp} />
              <Text style={styles.bannerText} numberOfLines={2}>
                <Text style={styles.bannerLabel}>다음 할 일 · </Text>
                {next.title}
                {next.date ? ` (${formatStepDate(next.date)})` : ""}
              </Text>
            </View>
          ) : null}

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
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.todoTitle, item.is_completed && styles.doneText]}>
                      {item.title}
                    </Text>
                    <Text style={[styles.todoDate, isOverdue(item) && styles.overdueText]}>
                      {item.date
                        ? `${formatStepDate(item.date)}${item.time ? ` ${item.time}` : ""}`
                        : "날짜 미정"}
                      {isOverdue(item) ? " · 기한 지남" : ""}
                    </Text>
                  </View>
                </Pressable>

                {/* Google 캘린더에 추가 (날짜가 있을 때만 누를 수 있음) */}
                <Pressable
                  style={styles.calendarIcon}
                  accessibilityRole="button" accessibilityLabel={`${item.title} Google 캘린더에 추가`}
                  disabled={!todoCalendarUrl(item)}
                  onPress={() => openUrl(todoCalendarUrl(item))}
                  hitSlop={6}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={todoCalendarUrl(item) ? colors.stamp : colors.muted}
                    style={!todoCalendarUrl(item) && { opacity: 0.4 }}
                  />
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

          {/* 마감일을 Google 캘린더에 */}
          {deadlineUrl ? (
            <Pressable
              style={({ pressed }) => [styles.calendarButton, pressed && styles.pressed]}
              accessibilityRole="button"
              onPress={() => openUrl(deadlineUrl)}
            >
              <Ionicons name="logo-google" size={16} color={colors.stamp} />
              <Text style={styles.calendarButtonText}>마감일을 Google 캘린더에 추가</Text>
            </Pressable>
          ) : null}
        </Card>

        <View style={styles.tip}>
          <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
          <Text style={styles.tipText}>
            달력 버튼을 누르면 Google 캘린더에 일정이 미리 채워져 열려요. 캘린더에서 '저장'을 눌러야 추가돼요.
          </Text>
        </View>

        <Pressable style={({ pressed }) => [styles.homeButton, pressed && styles.pressed]} onPress={goHome} accessibilityRole="button">
          <Ionicons name="home" size={18} color="#fff" />
          <Text style={styles.homeButtonText}>홈으로</Text>
        </Pressable>
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
  homeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 15,
    borderRadius: radius.md,
    backgroundColor: colors.stamp,
  },
  homeButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
    cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  docTitle: { flex: 1, fontSize: 17, fontWeight: "700", lineHeight: 24, color: colors.ink },
  ddayBadge: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  ddayText: { fontSize: 18, fontWeight: "700", includeFontPadding: false },
  deadlineText: { fontSize: 13, color: "#4B5565", marginTop: 4 },
  todoTitle: { fontSize: 15, lineHeight: 21, color: colors.ink },
  todoDate: { fontSize: 12, color: colors.muted, marginTop: 2 },
  overdueText: { color: colors.alert, fontWeight: "700" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.ink },
  bannerLabel: { fontWeight: "700", color: colors.stamp },

  calendarIcon: { padding: spacing.xs, marginLeft: spacing.sm },
  calendarButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.stamp,
    backgroundColor: colors.surface,
  },
  calendarButtonText: { color: colors.stamp, fontSize: 14, fontWeight: "700" },
  tip: { flexDirection: "row", gap: 5, alignItems: "flex-start", paddingHorizontal: 2, marginBottom: spacing.lg },
  tipText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.muted },
});