import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Card from "../components/Card";
import Badge from "../components/Badge";
import ProgressBar from "../components/ProgressBar";
import PrimaryButton from "../components/PrimaryButton";
import { colors, spacing, type, radius } from "../theme/theme";
import { listDocuments, getDocument, listTodos, updateTodo } from "../services/api";
import { localPlanDate } from "../utils/preparationPlan";
import { upcomingDocuments, ddayLabel, planProgress } from "../utils/homeData";

const ddayTone = (dday) => {
  const daysLeft = Math.abs(dday);
  if (daysLeft <= 6) return "alert";
  if (daysLeft <= 13) return "gold";
  return "green";
};

const todayLabel = () => {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const now = new Date();
  return `${now.getMonth() + 1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
};

export default function HomeScreen({ navigation }) {
  const [tab, setTab] = useState("today");
  const [tasks, setTasks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [sortBy, setSortBy] = useState("dday");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [reload, setReload] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([listDocuments(), listTodos()]).then(([docs, todos]) => {
      if (!active) return;
      setDocuments(docs);
      setTasks(todos.filter((item) => item.date === localPlanDate()));
    }).catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]));

  const toggleTask = async (item) => {
    if (busyTaskId) return;
    const completed = !item.is_completed;
    setBusyTaskId(item.id);
    setTasks((prev) => prev.map((task) => task.id === item.id ? { ...task, is_completed: completed } : task));
    try {
      const { plan } = await updateTodo(item.id, completed);
      if (plan) setDocuments((prev) => prev.map((document) => document.id === item.document_id
        ? { ...document, progress: planProgress(plan) } : document));
    } catch (e) {
      setTasks((prev) => prev.map((task) => task.id === item.id ? { ...task, is_completed: item.is_completed } : task));
      setError(e.message);
    } finally { setBusyTaskId(null); }
  };

  const openDocument = async (id) => {
    if (openingId) return;
    setOpeningId(id);
    setError("");
    try {
      const result = await getDocument(id);
      navigation.navigate("AIAnalysis", { ...result, preview: { kind: result.sourceKind } });
    } catch (e) { setError(e.message); }
    finally { setOpeningId(null); }
  };

  const sortedUpcoming = upcomingDocuments(documents, sortBy);
  const previewUpcoming = upcomingDocuments(documents).slice(0, 3);
  const emptyLabel = loading ? "불러오는 중…" : error ? "문서를 불러오지 못했어요." : "다가오는 마감이 없습니다.";
  const renderUpcomingCard = (list) => (
    <Card>
      {list.length === 0 && <Text style={type.small}>{emptyLabel}</Text>}
      {list.map((item, idx) => (
        <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title} 문서 열기`}
          disabled={!!openingId} onPress={() => openDocument(item.id)}
          style={[styles.upcomingItem, idx > 0 && styles.upcomingDivider]}>
          <View style={styles.upcomingRow}>
            <Text style={[type.bodyStrong, { flex: 1, marginRight: spacing.sm }]}>{item.title}</Text>
            <Badge label={ddayLabel(item.dday)} tone={ddayTone(item.dday)} />
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <ProgressBar progress={item.progress || 0} color={colors.green} />
          </View>
        </Pressable>
      ))}
    </Card>
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.logoDot}>
            <Ionicons name="document-text" size={18} color="#FFFFFF" />
            <View style={styles.logoCheck}>
              <Ionicons name="checkmark" size={9} color={colors.stamp} />
            </View>
          </View>
          <Text style={styles.brand}>똑독</Text>
        </View>
        <View style={styles.headerIcons}>
          <Pressable hitSlop={8} accessibilityRole="button" accessibilityLabel="캘린더"
            onPress={() => navigation.navigate("Calendar")}>
            <Ionicons name="calendar-outline" size={22} color={colors.ink} />
          </Pressable>
          <Pressable hitSlop={8}>
            <Ionicons name="notifications-outline" size={22} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {!!error && <Text accessibilityRole="alert" style={[type.small, { color: colors.alert, marginBottom: spacing.md }]}>{error}</Text>}
        {!!error && <Pressable accessibilityRole="button" disabled={loading} onPress={() => setReload((prev) => prev + 1)}
          style={{ marginBottom: spacing.md }}><Text style={[type.bodyStrong, { color: colors.stamp }]}>다시 불러오기</Text></Pressable>}
        {/* 탭 버튼 */}
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tab, tab === "today" && styles.tabActive]}
            onPress={() => setTab("today")}
          >
            <Text style={[styles.tabText, tab === "today" && styles.tabTextActive]}>오늘 할일</Text>
            <View style={[styles.countPill, tab === "today" && styles.countPillActive]}>
              <Text style={[styles.countText, tab === "today" && styles.countTextActive]}>
                {tasks.length}
              </Text>
            </View>
          </Pressable>
          <Pressable
            style={[styles.tab, tab === "upcoming" && styles.tabActive]}
            onPress={() => setTab("upcoming")}
          >
            <Text style={[styles.tabText, tab === "upcoming" && styles.tabTextActive]}>다가오는 마감</Text>
            <View style={[styles.countPill, tab === "upcoming" && styles.countPillActive]}>
              <Text style={[styles.countText, tab === "upcoming" && styles.countTextActive]}>
                {sortedUpcoming.length}
              </Text>
            </View>
          </Pressable>
        </View>

        {tab === "today" ? (
          <>
            <Text style={styles.sectionTitle}>{todayLabel()}</Text>
            <Card style={{ marginBottom: spacing.xl }}>
              {tasks.length === 0 && <Text style={type.small}>{loading ? "불러오는 중…" : "오늘 등록된 할 일이 없습니다."}</Text>}
              {tasks.map((item, idx) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="checkbox" accessibilityLabel={`${item.title} 완료`} aria-checked={!!item.is_completed}
                  disabled={!!busyTaskId} onPress={() => toggleTask(item)}
                  style={[styles.taskRow, idx > 0 && styles.rowDivider]}
                >
                  <Ionicons
                    name={item.is_completed ? "checkbox" : "square-outline"}
                    size={22}
                    color={item.is_completed ? colors.stamp : colors.muted}
                  />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={[type.bodyStrong, item.is_completed && styles.doneText]}>{item.title}</Text>
                    <Text style={styles.taskSubtitle}>{item.doc_title}</Text>
                  </View>
                  <Text style={styles.taskDday}>{ddayLabel(documents.find((document) => document.id === item.document_id)?.dday)}</Text>
                </Pressable>
              ))}
            </Card>

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>다가오는 마감</Text>
              <Pressable onPress={() => setTab("upcoming")} hitSlop={8}>
                <Text style={styles.seeAll}>전체보기 ›</Text>
              </Pressable>
            </View>
            {renderUpcomingCard(previewUpcoming)}
          </>
        ) : (
          <View style={{ marginBottom: spacing.xl }}>
            <Text style={styles.sectionTitle}>다가오는 마감</Text>

            <Pressable
              style={styles.sortToggle}
              onPress={() => setSortBy((prev) => (prev === "dday" ? "recent" : "dday"))}
            >
              <Ionicons name="swap-vertical" size={14} color={colors.muted} />
              <Text style={styles.sortToggleText}>
                {sortBy === "dday" ? "마감임박순" : "최신순"}
              </Text>
            </Pressable>

            {renderUpcomingCard(sortedUpcoming)}
          </View>
        )}

      </ScrollView>

      <View style={styles.bottomBar}>
        <PrimaryButton
          label="+ 문서 추가하기"
          tone="stamp"
          onPress={() => navigation.navigate("DocumentAdd")}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerIcons: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  logoDot: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.stamp,
    alignItems: "center",
    justifyContent: "center",
  },
  logoCheck: {
  position: "absolute",
  right: -4,
  bottom: -4,
  width: 14,
  height: 14,
  borderRadius: 7,
  backgroundColor: "#FFFFFF",
  borderWidth: 1.5,
  borderColor: colors.stamp,
  alignItems: "center",
  justifyContent: "center",
},
  brand: { ...type.h1 },
  container: { padding: spacing.lg, paddingBottom: 100 },

  tabRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  tab: {
  flex: 1,                    // ← 추가: 남는 가로 공간을 반씩 나눠 가짐
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",   // ← 추가: 글씨와 숫자 동그라미를 버튼 가운데로
  gap: 6,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderRadius: 999,
  backgroundColor: colors.line,
},
  tabActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  tabText: { fontSize: 12, fontWeight: "700", color: colors.muted },
  tabTextActive: { color: colors.ink },
  countPill: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  countPillActive: { backgroundColor: colors.stamp },
  countText: { fontSize: 11, fontWeight: "700", color: colors.muted },
  countTextActive: { color: "#FFFFFF" },

  sectionTitle: { ...type.h2, fontSize: 22, marginBottom: spacing.sm },
  sectionTitleSmall: { ...type.h2, marginBottom: spacing.sm },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  seeAll: { fontSize: 13, fontWeight: "700", color: colors.stamp },
  sortToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginBottom: spacing.sm,
  },
  sortToggleText: { fontSize: 13, color: colors.muted, fontWeight: "600" },

  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  taskSubtitle: { fontSize: 12, color: colors.muted, marginTop: 2 },
  taskDday: { fontSize: 15, fontWeight: "700", color: colors.alert },
  doneText: { color: colors.muted, textDecorationLine: "line-through" },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.line },

  upcomingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  upcomingItem: { paddingVertical: spacing.md },
  upcomingDivider: { borderTopWidth: 1, borderTopColor: colors.line },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
