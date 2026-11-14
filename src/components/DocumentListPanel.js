import { Text, TextInput } from "./Typography";
// 문서 목록: 올린 문서 전체를 제목 검색 + 상태 필터(진행 중 / 마감 지남 / 완료)로 본다.
// 누르면 홈 카드와 같은 규칙: 등록한 문서는 관리 화면, 아니면 분석 결과.
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { View, Pressable, StyleSheet, ActivityIndicator, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "./Card";
import Badge from "./Badge";
import ProgressBar from "./ProgressBar";
import EmptyStart from "./EmptyStart";
import AppHeader from "./AppHeader";
import { colors, pageContent, radius, spacing, type } from "../theme/theme";
import { listDocuments, getDocument, deleteDocuments } from "../services/api";
import { ddayLabel } from "../utils/homeData";
import { ddayTone } from "../utils/dday";
import { DOCUMENT_FILTERS, documentCounts, documentStatus, filterDocuments, deadlineLabel } from "../utils/documentList";

const EMPTY = {
  all: "아직 올린 문서가 없어요. 가운데 ➕ 버튼으로 공지를 추가해 보세요.",
  active: "진행 중인 문서가 없어요.",
  overdue: "마감이 지난 문서가 없어요.",
  done: "완료한 문서가 없어요.",
};

export default function DocumentListPanel({ scrollRef }) {
  const navigation = useNavigation();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const initialLoading = loading && !hasLoaded;
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [openingId, setOpeningId] = useState(null);
  const [reload, setReload] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [pendingDelete, setPendingDelete] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleting = useRef(false);

  // 탭에 들어올 때마다 다시 불러온다 (관리 화면에서 진행률이 바뀌어도 반영)
  useFocusEffect(useCallback(() => {
    let active = true;
    setSelectedIds([]);
    setLoading(true);
    setError("");
    listDocuments()
      .then((docs) => { if (active) { setDocuments(docs); setHasLoaded(true); } })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]));

  const counts = useMemo(() => documentCounts(documents, query), [documents, query]);
  const visible = useMemo(() => filterDocuments(documents, { query, filter }), [documents, query, filter]);
  const selectedDocuments = useMemo(() => documents.filter((item) => selectedIds.includes(item.id)), [documents, selectedIds]);

  const toggleSelection = (id) => {
    if (loading || openingId || deleting.current) return;
    setSelectedIds((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
  };

  const changeQuery = (value) => {
    setQuery(value);
    setSelectedIds([]);
  };

  const openDocument = async (item) => {
    if (openingId || deleting.current) return;
    if (item.registered) {
      navigation.navigate("Management", { documentId: item.id, documentTitle: item.title });
      return;
    }
    setOpeningId(item.id);
    setError("");
    try {
      const result = await getDocument(item.id);
      navigation.navigate("AIAnalysis", { ...result, preview: { kind: result.sourceKind } });
    } catch (e) {
      setError(e.message);
    } finally {
      setOpeningId(null);
    }
  };

  const closeDelete = () => {
    if (deleting.current) return;
    setPendingDelete([]);
    setDeleteError("");
  };

  const confirmDelete = async () => {
    if (!pendingDelete.length || deleting.current || loading) return;
    deleting.current = true;
    setIsDeleting(true);
    setDeleteError("");
    try {
      const { deletedIds, failures } = await deleteDocuments(pendingDelete.map((item) => item.id));
      setDocuments((previous) => previous.filter((item) => !deletedIds.includes(item.id)));
      setSelectedIds((previous) => previous.filter((id) => !deletedIds.includes(id)));
      setPendingDelete((previous) => previous.filter((item) => !deletedIds.includes(item.id)));
      if (failures.length) {
        setDeleteError(`${failures.length}개 문서를 삭제하지 못했어요. 다시 시도해 주세요.\n${failures[0].message}`);
      }
    } catch (e) {
      setDeleteError(e.message || "문서를 삭제하지 못했어요. 다시 시도해 주세요.");
    } finally {
      deleting.current = false;
      setIsDeleting(false);
    }
  };

  const renderItem = (item, idx) => {
    const status = documentStatus(item);
    const percent = Math.round((item.progress || 0) * 100);
    const selected = selectedIds.includes(item.id);
    return (
      <View key={item.id} style={[styles.item, idx > 0 && styles.divider, selected && styles.selectedItem]}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={`${item.title} 선택`}
          accessibilityState={{ checked: selected, disabled: loading || !!openingId || isDeleting }}
          aria-checked={selected}
          disabled={loading || !!openingId || isDeleting}
          onPress={() => toggleSelection(item.id)}
          style={({ pressed }) => [styles.checkbox, pressed && styles.pressed]}
        >
          <Ionicons name={selected ? "checkbox" : "square-outline"} size={23} color={selected ? colors.stamp : colors.muted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.title} 문서 열기`}
          disabled={!!openingId || isDeleting}
          onPress={() => openDocument(item)}
          style={({ pressed }) => [styles.itemContent, pressed && styles.pressed]}
        >
          <View style={styles.itemTop}>
            <Text style={[type.bodyStrong, styles.title]} numberOfLines={2}>{item.title}</Text>
            {openingId === item.id ? <ActivityIndicator color={colors.stamp} />
              : status === "done" ? <Badge label="완료" tone="stamp" />
              : <Badge label={ddayLabel(item.dday)} tone={ddayTone(item.dday == null ? null : -item.dday)} />}
          </View>
          <View style={styles.metaRow}>
            <Text style={[styles.meta, status === "overdue" && { color: colors.alert }]}>
              {deadlineLabel(item.deadline)}{status === "overdue" ? " · 마감 지남" : ""}
            </Text>
            <Text style={styles.meta}>{item.registered ? `${percent}%` : "계획 등록 전"}</Text>
          </View>
          {item.registered && (
            <View style={{ marginTop: spacing.xs }}>
              <ProgressBar progress={item.progress || 0} color={status === "done" ? colors.stamp : colors.green} />
            </View>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.panel}>
      <AppHeader title="문서" />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={changeQuery}
            placeholder="문서 제목 검색"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            returnKeyType="search"
            accessibilityLabel="문서 제목 검색"
          />
          {!!query && (
            <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => changeQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>

        <View style={styles.filterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}
            contentContainerStyle={[styles.chips, selectedDocuments.length > 0 && styles.selectionChips]}>
            {DOCUMENT_FILTERS.map(([key, label]) => {
              const on = filter === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => { if (key !== filter) { setFilter(key); setSelectedIds([]); } }}
                  style={[styles.chip, selectedDocuments.length > 0 && styles.selectionChip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{label} {counts[key]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {selectedDocuments.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel={`선택한 문서 ${selectedDocuments.length}개 삭제`}
              disabled={loading || !!openingId || isDeleting} hitSlop={{ top: 6, bottom: 6 }}
              onPress={() => { setDeleteError(""); setPendingDelete(selectedDocuments); }}
              style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
              <Text style={styles.deleteButtonText}>{isDeleting ? "삭제 중…" : `삭제 (${selectedDocuments.length})`}</Text>
            </Pressable>
          )}
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => setReload((n) => n + 1)} hitSlop={8}>
              <Text style={[type.bodyStrong, { color: colors.stamp }]}>다시 불러오기</Text>
            </Pressable>
          </View>
        )}

        {initialLoading && documents.length === 0 ? (
          <Card><ActivityIndicator color={colors.stamp} /></Card>
        ) : documents.length === 0 && !error ? (
          <EmptyStart />
        ) : visible.length === 0 ? (
          <Card><Text style={type.small}>{query ? `‘${query.trim()}’에 맞는 문서가 없어요.` : EMPTY[filter]}</Text></Card>
        ) : (
          <Card style={styles.listCard}>{visible.map(renderItem)}</Card>
        )}
      </ScrollView>

      <Modal visible={pendingDelete.length > 0} transparent animationType="fade" onRequestClose={closeDelete}>
        <View style={styles.backdrop} accessibilityViewIsModal>
          <Card style={styles.deleteDialog}>
            <ScrollView contentContainerStyle={styles.dialogContent}>
              <Text accessibilityRole="header" style={type.h2}>문서 삭제</Text>
              {pendingDelete.length > 1 && <Text style={type.bodyStrong}>선택한 문서 {pendingDelete.length}개</Text>}
              {pendingDelete.map((item) => <Text key={item.id} style={type.bodyStrong} numberOfLines={3}>{item.title}</Text>)}
              <Text style={styles.deleteDescription}>문서와 등록된 할 일이 함께 삭제돼요.{"\n"}삭제한 문서는 되돌릴 수 없어요.</Text>
              {!!deleteError && <Text accessibilityRole="alert" style={styles.deleteError}>{deleteError}</Text>}
              <View style={styles.dialogButtons}>
                <Pressable accessibilityRole="button" disabled={isDeleting} onPress={closeDelete}
                  style={({ pressed }) => [styles.dialogButton, styles.cancelButton, pressed && styles.pressed]}>
                  <Text style={type.bodyStrong}>취소</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="문서 삭제 확인" disabled={isDeleting || loading}
                  onPress={confirmDelete}
                  style={({ pressed }) => [styles.dialogButton, styles.confirmButton, pressed && styles.pressed, isDeleting && styles.pressed]}>
                  {isDeleting && <ActivityIndicator size="small" color={colors.surface} />}
                  <Text style={styles.confirmText}>{isDeleting ? "삭제 중…" : "삭제"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1 },
  container: { ...pageContent, paddingHorizontal: spacing.lg },
  filterBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.md },
  filterScroll: { flexGrow: 0, flexShrink: 1, minWidth: 0 },
  deleteButton: { minHeight: 32, flexShrink: 0, paddingHorizontal: spacing.md, borderRadius: radius.pill, justifyContent: "center", backgroundColor: colors.alertSoft },
  deleteButtonText: { fontSize: 13, fontWeight: "600", color: colors.alert },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 44, marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 0, outlineStyle: "none" },
  chips: { gap: spacing.sm },
  selectionChips: { gap: 6 },
  chip: {
    paddingHorizontal: spacing.md, height: 32, borderRadius: radius.pill, justifyContent: "center",
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  selectionChip: { paddingHorizontal: spacing.sm },
  chipOn: { backgroundColor: colors.stamp, borderColor: colors.stamp },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  chipTextOn: { color: "#FFFFFF" },
  errorBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginBottom: spacing.md },
  errorText: { ...type.small, color: colors.alert, flex: 1 },
  listCard: { paddingVertical: spacing.xs },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  itemContent: { flex: 1, minWidth: 0, paddingVertical: spacing.md },
  checkbox: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  selectedItem: { backgroundColor: colors.stampSoft, borderRadius: radius.sm },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  itemTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  title: { flex: 1 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  meta: { fontSize: 12, color: colors.muted },
  pressed: { opacity: 0.6 },
  backdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg, backgroundColor: colors.overlay },
  deleteDialog: { width: "100%", maxWidth: 420, maxHeight: "85%", padding: spacing.xl },
  dialogContent: { gap: spacing.lg },
  deleteDescription: { ...type.body, color: colors.muted, lineHeight: 22 },
  deleteError: { ...type.small, color: colors.alert },
  dialogButtons: { flexDirection: "row", gap: spacing.sm },
  dialogButton: { flex: 1, minHeight: 46, borderRadius: radius.md, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center" },
  cancelButton: { backgroundColor: colors.subtle },
  confirmButton: { backgroundColor: colors.alert },
  confirmText: { ...type.bodyStrong, color: colors.surface },
});
