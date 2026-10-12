import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { View, Text, ScrollView, Pressable, StyleSheet, Modal, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Card from "../components/Card";
import Badge from "../components/Badge";
import ProgressBar from "../components/ProgressBar";
import PrimaryButton from "../components/PrimaryButton";
import DocumentEditModal from "../components/DocumentEditModal";
import { colors, spacing, type, radius } from "../theme/theme";
import { listDocuments, getDocument, listTodos, updateTodo, updateDocument, deleteDocument, } from "../services/api";
import { localPlanDate } from "../utils/preparationPlan";
import { upcomingDocuments, ddayLabel, planProgress } from "../utils/homeData";
import { ddayTone } from "../utils/dday";

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
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [editingDocument, setEditingDocument] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

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

  const sortedUpcoming = upcomingDocuments(documents, sortBy);
  const previewUpcoming = upcomingDocuments(documents).slice(0, 3);
  const emptyLabel = loading ? "불러오는 중…" : error ? "문서를 불러오지 못했어요." : "다가오는 마감이 없습니다.";
  const renderUpcomingCard = (list) => (
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
            <View style={styles.upcomingRow}>
              <Text
                style={[
                  type.bodyStrong,
                  { flex: 1, marginRight: spacing.sm },
                ]}
              >
                {item.title}
              </Text>

              <Badge
                label={ddayLabel(item.dday)}
                tone={ddayTone(-item.dday)}
              />
            </View>

            <View style={{ marginTop: spacing.sm }}>
              <ProgressBar
                progress={item.progress || 0}
                color={colors.green}
              />
            </View>
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
  upcomingItem: {
    position: "relative",
    paddingVertical: spacing.md,
  },
  upcomingMain: {
    paddingRight: 32,
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
  documentMenu: {
    backgroundColor: "#FFFFFF",
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
