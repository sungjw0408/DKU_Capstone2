import { dialogGlass } from "../theme/theme";
import { pageContent } from "../theme/theme";
import { Text, TextInput } from "../components/Typography";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useScrollToTop } from "@react-navigation/native";
import { View, ScrollView, Pressable, StyleSheet, Modal, Alert, Platform } from "react-native";
import ScreenSurface from "../components/ScreenSurface";
import { Ionicons } from "@expo/vector-icons";
import AppHeader from "../components/AppHeader";
import DocumentHero from "../components/DocumentHero";
import WeekDatePicker from "../components/WeekDatePicker";
import Card from "../components/Card";
import Badge from "../components/Badge";
import ProgressBar from "../components/ProgressBar";
import DocumentEditModal from "../components/DocumentEditModal";
import EmptyStart from "../components/EmptyStart";
import { colors, spacing, type, radius } from "../theme/theme";
import { listDocuments, getDocument, listTodos, updateTodo, updateDocument, deleteDocument, } from "../services/api";
import { upcomingDocuments, ddayLabel, planProgress } from "../utils/homeData";
import { ddayTone } from "../utils/dday";
import { DOCUMENT_FILTERS, documentCounts, documentStatus, matchesQuery } from "../utils/documentList";
import { groupHomeTodos } from "../utils/todoList";
import { dateKeyOf, dateLabel, parseDateKey, toDateKey } from "../utils/calendarData";

export default function HomeScreen({ navigation, route }) {
  // 두 화면의 카드·문서 열기·수정·삭제 동작을 함께 유지한다.
  const isDocumentsScreen = route?.name === "Documents";
  const scroll = useRef(null);
  useScrollToTop(scroll);
  const [tab, setTab] = useState("today");
  const today = dateKeyOf(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [taskView, setTaskView] = useState("today");
  const [tasks, setTasks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [sortBy, setSortBy] = useState("dday");
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const initialLoading = loading && !hasLoaded;
  const [error, setError] = useState("");
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  const [reload, setReload] = useState(0);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [editingDocument, setEditingDocument] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  // 내 문서: 제목 검색 + 상태 필터 (진행 중 / 마감 지남 / 완료)
  const [query, setQuery] = useState("");
  const [docFilter, setDocFilter] = useState("all");

  useEffect(() => {
    if (isDocumentsScreen) return;
    return navigation.addListener("tabPress", () => setTab("today"));
  }, [navigation, isDocumentsScreen]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([listDocuments(), isDocumentsScreen ? Promise.resolve([]) : listTodos()]).then(([docs, todos]) => {
      if (!active) return;
      setDocuments(docs);
      setHasLoaded(true);
      setTasks(todos);
    }).catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload, isDocumentsScreen]));

  const selectDate = (key) => { setSelectedDate(key); setTaskView("today"); };

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

  const openDocument = async (item) => {
    console.log("카드 누름:", item.title, "등록됨:", item.registered);
    if (openingId) return;

    // 등록을 마친 문서는 바로 관리 화면으로 (할 일 확인·체크)
    if (item.registered) {
      navigation.navigate("Management", { documentId: item.id, documentTitle: item.title });
      return;
    }

    // 아직 등록 전이면 지금처럼 분석 결과부터 (계획을 마저 세우도록)
    setOpeningId(item.id);
    setError("");
    try {
      const result = await getDocument(item.id);
      navigation.navigate("AIAnalysis", { ...result, preview: { kind: result.sourceKind } });
    } catch (e) { setError(e.message); }
    finally { setOpeningId(null); }
  };

  const saveDocumentEdit = async (patch) => {
    const target = editingDocument;

    if (!target) return;

    const result = await updateDocument(
      target.id,
      patch
    );

    setDocuments((prev) =>
      prev.map((document) =>
        document.id === target.id
          ? {
              ...document,
              ...result.document,
            }
          : document
      )
    );

    if (patch.title) {
      setTasks((prev) =>
        prev.map((task) =>
          task.document_id === target.id
            ? {
                ...task,
                doc_title: patch.title,
              }
            : task
        )
      );
    }

    setEditingDocument(null);
  };


  const performDeleteDocument = async (document) => {
    setDeletingId(document.id);
    setError("");

    try {
      await deleteDocument(document.id);

      setDocuments((prev) =>
        prev.filter((item) => item.id !== document.id)
      );

      setTasks((prev) =>
        prev.filter(
          (item) => item.document_id !== document.id
        )
      );
    } catch (e) {
      setError(
        e.message ?? "프로젝트 삭제에 실패했습니다."
      );
    } finally {
      setDeletingId(null);
    }
  };


  const confirmDeleteDocument = (document) => {
    const message =
      `"${document.title}" 프로젝트를 삭제할까요?\n등록된 할 일도 함께 삭제됩니다.`;

    if (Platform.OS === "web") {
      const confirmed = window.confirm(message);

      if (confirmed) {
        performDeleteDocument(document);
      }

      return;
    }

    Alert.alert(
      "프로젝트 삭제",
      message,
      [
        {
          text: "취소",
          style: "cancel",
        },
        {
          text: "삭제",
          style: "destructive",
          onPress: () => {
            performDeleteDocument(document);
          },
        },
      ]
    );
  };

  // 내 문서 목록은 서버의 최신 등록순을 그대로 두고 검색·필터만 적용한다
  const docCounts = documentCounts(documents, query);
  const visibleDocuments = documents
    .filter((item) => matchesQuery(item, query))
    .filter((item) => docFilter === "all" || documentStatus(item) === docFilter);
  const noDocuments = !initialLoading && !error && documents.length === 0;

  const dailyTasks = tasks.filter((task) => task.date === selectedDate);
  const overdueTasks = tasks.filter((task) => toDateKey(task.date) && task.date < today && !task.is_completed);
  const taskGroups = groupHomeTodos(taskView === "overdue" ? overdueTasks : dailyTasks, documents,
    taskView === "overdue" ? new Date() : parseDateKey(selectedDate));
  const taskFilters = [
    { key: "today", label: selectedDate === today ? "오늘 할 일" : `${dateLabel(selectedDate)} 할 일`, count: dailyTasks.filter((task) => !task.is_completed).length },
    { key: "overdue", label: "지난 할 일", count: overdueTasks.length },
  ];
  const sortedUpcoming = upcomingDocuments(documents, sortBy);
  const previewUpcoming = upcomingDocuments(documents).slice(0, 3);
  const emptyLabel = initialLoading ? "불러오는 중…" : error ? "문서를 불러오지 못했어요."
    : isDocumentsScreen ? (query.trim() ? `‘${query.trim()}’에 맞는 문서가 없어요.` : "이 조건에 맞는 문서가 없어요.")
    : "다가오는 마감이 없습니다.";
  const renderDocumentCard = (list) => (
    <Card>
      {list.length === 0 && (
        <Text style={type.small}>{emptyLabel}</Text>
      )}

      {list.map((item, idx) => (
        <View
          key={item.id}
          style={[
            styles.upcomingItem,
            idx > 0 && styles.upcomingDivider,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title} 문서 열기`}
            disabled={!!openingId}
            onPress={() => openDocument(item)}
            style={styles.upcomingMain}
          >
            <Badge label={ddayLabel(item.dday)} tone={ddayTone(item.dday == null ? null : -item.dday)} style={styles.taskDdayBadge} />
            <View style={styles.upcomingDetails}>
              <Text style={type.bodyStrong}>{item.title}</Text>
              <Text style={styles.deadlineDate}>{toDateKey(item.deadline) ? dateLabel(toDateKey(item.deadline)) : "마감일 미정"}</Text>
              {isDocumentsScreen && <View style={{ marginTop: spacing.sm }}>
                <ProgressBar progress={item.progress || 0} color={colors.green} />
              </View>}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title} 프로젝트 메뉴`}
            hitSlop={8}
            style={styles.moreButton}
            onPress={() => setSelectedDocument(item)}
          >
            <Ionicons
              name="ellipsis-vertical"
              size={20}
              color={colors.muted}
            />
          </Pressable>
        </View>
      ))}
    </Card>
  );

  return (
    <ScreenSurface style={styles.safe} edges={["top"]}>
      <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.container}>
        <View style={styles.masthead}>
          <AppHeader subtitle="오늘의 준비를 한눈에" />
          {!isDocumentsScreen && <>
            <WeekDatePicker selected={selectedDate} onSelect={selectDate} today={today} />
            <DocumentHero onPress={() => navigation.navigate("DocumentAdd")} />
          </>}
        </View>
        <View style={styles.homeBody}>
        {!!error && <Text accessibilityRole="alert" style={[type.small, { color: colors.alert, marginBottom: spacing.md }]}>{error}</Text>}
        {!!error && <Pressable accessibilityRole="button" disabled={loading} onPress={() => setReload((prev) => prev + 1)}
          style={{ marginBottom: spacing.md }}><Text style={[type.bodyStrong, { color: colors.stamp }]}>다시 불러오기</Text></Pressable>}
        {/* 문서가 하나도 없으면 첫 공지 안내 */}
        {noDocuments && isDocumentsScreen ? <EmptyStart /> : isDocumentsScreen ? <>
          <View style={styles.sectionHeaderRow}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>내 문서</Text>
            <Text style={type.small}>{initialLoading ? "불러오는 중…" : `${documents.length}개`}</Text>
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput value={query} onChangeText={setQuery} placeholder="문서 제목 검색"
              placeholderTextColor={colors.muted} style={styles.searchInput} returnKeyType="search"
              accessibilityLabel="문서 제목 검색" />
            {!!query && (
              <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => setQuery("")} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
            {DOCUMENT_FILTERS.map(([key, label]) => {
              const on = docFilter === key;
              return (
                <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: on }}
                  onPress={() => setDocFilter(key)} style={[styles.filterChip, on && styles.filterChipOn]}>
                  <Text style={[styles.filterChipText, on && styles.filterChipTextOn]}>{label} {docCounts[key]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {renderDocumentCard(visibleDocuments)}
        </> : <>
          <View style={styles.todaySection}>
            <View accessibilityRole="tablist" style={styles.taskTabs}>
              {taskFilters.map((filter) => <Pressable key={filter.key} accessibilityRole="tab"
                accessibilityState={{ selected: taskView === filter.key }} aria-selected={taskView === filter.key}
                accessibilityLabel={`${filter.label} ${filter.count}개`}
                onPress={() => setTaskView(filter.key)} style={[styles.taskTab, taskView === filter.key && styles.taskTabActive]}>
                <Text style={[styles.taskTabLabel, taskView === filter.key && styles.taskTabLabelActive]}>{filter.label}</Text>
                <Text style={[styles.taskCount, taskView === filter.key && styles.taskCountActive]}>{initialLoading ? "—" : filter.count}</Text>
              </Pressable>)}
            </View>
            {taskGroups.length === 0 ? (
              <Card style={styles.emptyTaskCard}>
                <View style={styles.emptyToday}>
                  <Text style={[type.body, { textAlign: "center" }]}>{initialLoading ? "불러오는 중…"
                    : taskView === "overdue" ? "지난 할 일이 없어요."
                    : selectedDate === today ? "오늘 등록된 할 일이 없어요." : "이 날짜에 등록된 할 일이 없어요."}</Text>
                </View>
              </Card>
            ) : (
              <View style={styles.taskGroups}>
                {taskGroups.map((group) => (
                  <Card key={group.key} style={styles.taskCard}>
                    <View style={styles.taskDocumentHeader}>
                      <Text accessibilityRole="header" style={styles.taskDocumentTitle}>{group.title}</Text>
                      <Badge label={ddayLabel(group.dday)} tone={ddayTone(group.dday == null ? null : -group.dday)}
                        style={styles.taskDdayBadge} />
                    </View>
                    {group.todos.map((item) => (
                      <Pressable key={item.id} accessibilityRole="checkbox"
                        accessibilityLabel={`${item.title}${item.overdue ? ", 지난 할 일" : ""} 완료`}
                        accessibilityState={{ checked: !!item.is_completed, disabled: !!busyTaskId }} aria-checked={!!item.is_completed} disabled={!!busyTaskId}
                        onPress={() => toggleTask(item)} style={styles.taskRow}>
                        <Ionicons name={item.is_completed ? "checkbox" : "square-outline"} size={22}
                          color={item.is_completed ? colors.stamp : colors.muted} />
                        <Text style={[styles.taskTitle, item.is_completed && styles.doneText]}>{item.title}</Text>
                        {taskView === "overdue" && <View><Badge label={dateLabel(item.date)} tone="alert" /></View>}
                      </Pressable>
                    ))}
                  </Card>
                ))}
              </View>
            )}
          </View>
          <View>
            <View style={styles.sectionHeaderRow}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>다가오는 마감</Text>
              <Pressable accessibilityRole="button" onPress={() => setTab(tab === "upcoming" ? "today" : "upcoming")} hitSlop={8}>
                <Text style={styles.seeAll}>{tab === "upcoming" ? "간략히 보기" : "전체 보기"} ›</Text>
              </Pressable>
            </View>
            {tab === "upcoming" && <Pressable accessibilityRole="button" style={styles.sortToggle}
              onPress={() => setSortBy((prev) => prev === "dday" ? "recent" : "dday")}>
              <Ionicons name="swap-vertical" size={14} color={colors.muted} />
              <Text style={styles.sortToggleText}>{sortBy === "dday" ? "마감임박순" : "최신순"}</Text>
            </Pressable>}
            {noDocuments ? <EmptyStart /> : renderDocumentCard(tab === "upcoming" ? sortedUpcoming : previewUpcoming)}
          </View>
        </>}
        </View>
      </ScrollView>

      <Modal
        visible={!!selectedDocument}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedDocument(null)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setSelectedDocument(null)}
        >
          <Pressable
            style={styles.documentMenu}
            onPress={(event) => event.stopPropagation()}
          >
            <Text
              style={styles.menuTitle}
              numberOfLines={1}
            >
              {selectedDocument?.title}
            </Text>

            <Pressable
              style={styles.menuAction}
              onPress={() => {
                const document = selectedDocument;
                setSelectedDocument(null);
                setEditingDocument(document);
              }}
            >
              <Ionicons
                name="create-outline"
                size={20}
                color={colors.ink}
              />
              <Text style={styles.menuActionText}>
                프로젝트 수정
              </Text>
            </Pressable>

            <Pressable
              style={styles.menuAction}
              onPress={() => {
                const document = selectedDocument;
                setSelectedDocument(null);

                if (document) {
                  confirmDeleteDocument(document);
                }
              }}
            >
              <Ionicons
                name="trash-outline"
                size={20}
                color={colors.alert}
              />
              <Text
                style={[
                  styles.menuActionText,
                  { color: colors.alert },
                ]}
              >
                프로젝트 삭제
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {editingDocument && (
        <DocumentEditModal
          document={editingDocument}
          onSave={saveDocumentEdit}
          onClose={() => setEditingDocument(null)}
        />
      )}

    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  masthead: { backgroundColor: colors.hero },
  homeBody: { padding: spacing.lg },
  taskTabs: { flexDirection: "row", flexWrap: "wrap", columnGap: 20, borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: spacing.md },
  taskTab: { minHeight: 44, paddingBottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: 6, borderBottomWidth: 2, borderBottomColor: "transparent" },
  taskTabActive: { borderBottomColor: colors.ink },
  taskTabLabel: { ...type.h2, color: colors.muted },
  taskTabLabelActive: { color: colors.ink },
  taskCount: { ...type.h2, color: colors.muted },
  taskCountActive: { color: colors.stamp },
  todaySection: { marginBottom: spacing.xl },
  emptyTaskCard: { minHeight: 96 },
  emptyToday: { alignItems: "center", justifyContent: "center", flex: 1, paddingVertical: 12, gap: 12 },
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { flex: 1 },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 44, marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 0, outlineStyle: "none" },
  filterChips: { gap: spacing.sm, paddingBottom: spacing.md },
  filterChip: {
    paddingHorizontal: spacing.md, height: 32, borderRadius: radius.pill, justifyContent: "center",
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  filterChipOn: { backgroundColor: colors.stamp, borderColor: colors.stamp },
  filterChipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  filterChipTextOn: { color: "#FFFFFF" },
  container: { ...pageContent, paddingBottom: 112 },

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

  sectionTitle: { ...type.h2, fontSize: 18, marginBottom: spacing.sm },
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

  taskGroups: { gap: spacing.md },
  taskCard: { paddingVertical: spacing.md },
  taskDocumentHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingBottom: spacing.md },
  taskDocumentTitle: { ...type.h2, flex: 1, lineHeight: 22 },
  taskDdayBadge: { width: 40, height: 40, borderRadius: 8, paddingHorizontal: 0, alignItems: "center", alignSelf: "center", flexShrink: 0 },
  taskRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.line },
  taskTitle: { ...type.bodyStrong, flex: 1, lineHeight: 20 },
  doneText: { color: colors.muted, textDecorationLine: "line-through" },

  upcomingDetails: { flex: 1, gap: 3 },
  deadlineDate: { ...type.small },
  upcomingItem: {
    position: "relative",
    paddingVertical: spacing.md,
  },
  upcomingMain: {
    paddingRight: 32,
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
  },
  moreButton: {
    position: "absolute",
    right: 0,
    top: spacing.md,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  upcomingDivider: { borderTopWidth: 1, borderTopColor: colors.line },

  menuBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    padding: spacing.lg,
  },
  documentMenu: { ...dialogGlass,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  menuTitle: {
    ...type.bodyStrong,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  menuAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  menuActionText: {
    ...type.bodyStrong,
  },
});
