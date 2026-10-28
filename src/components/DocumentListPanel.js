// 문서 목록: 올린 문서 전체를 제목 검색 + 상태 필터(진행 중 / 마감 지남 / 완료)로 본다.
// 누르면 홈 카드와 같은 규칙: 등록한 문서는 관리 화면, 아니면 분석 결과.
import React, { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "./Card";
import Badge from "./Badge";
import ProgressBar from "./ProgressBar";
import EmptyStart from "./EmptyStart";
import { colors, radius, spacing, type } from "../theme/theme";
import { listDocuments, getDocument } from "../services/api";
import { ddayLabel } from "../utils/homeData";
import { ddayTone } from "../utils/dday";
import { DOCUMENT_FILTERS, documentCounts, documentStatus, filterDocuments, deadlineLabel } from "../utils/documentList";

const EMPTY = {
  all: "아직 올린 문서가 없어요. 가운데 ➕ 버튼으로 공지를 추가해 보세요.",
  active: "진행 중인 문서가 없어요.",
  overdue: "마감이 지난 문서가 없어요.",
  done: "완료한 문서가 없어요.",
};

export default function DocumentListPanel() {
  const navigation = useNavigation();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [openingId, setOpeningId] = useState(null);
  const [reload, setReload] = useState(0);

  // 탭에 들어올 때마다 다시 불러온다 (관리 화면에서 진행률이 바뀌어도 반영)
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError("");
    listDocuments()
      .then((docs) => { if (active) setDocuments(docs); })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]));

  const counts = useMemo(() => documentCounts(documents, query), [documents, query]);
  const visible = useMemo(() => filterDocuments(documents, { query, filter }), [documents, query, filter]);

  const openDocument = async (item) => {
    if (openingId) return;
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

  const renderItem = (item, idx) => {
    const status = documentStatus(item);
    const percent = Math.round((item.progress || 0) * 100);
    return (
      <Pressable
        key={item.id}
        accessibilityRole="button"
        accessibilityLabel={`${item.title} 문서 열기`}
        disabled={!!openingId}
        onPress={() => openDocument(item)}
        style={({ pressed }) => [styles.item, idx > 0 && styles.divider, pressed && styles.pressed]}
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
    );
  };

  return (
    <View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="문서 제목 검색"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="문서 제목 검색"
        />
        {!!query && (
          <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {DOCUMENT_FILTERS.map(([key, label]) => {
          const on = filter === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(key)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{label} {counts[key]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {!!error && (
        <View style={styles.errorBox}>
          <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => setReload((n) => n + 1)} hitSlop={8}>
            <Text style={[type.bodyStrong, { color: colors.stamp }]}>다시 불러오기</Text>
          </Pressable>
        </View>
      )}

      {loading && documents.length === 0 ? (
        <Card><ActivityIndicator color={colors.stamp} /></Card>
      ) : documents.length === 0 && !error ? (
        <EmptyStart />
      ) : visible.length === 0 ? (
        <Card><Text style={type.small}>{query ? `‘${query.trim()}’에 맞는 문서가 없어요.` : EMPTY[filter]}</Text></Card>
      ) : (
        <Card style={styles.listCard}>{visible.map(renderItem)}</Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: spacing.md, height: 44, marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 0, outlineStyle: "none" },
  chips: { gap: spacing.sm, paddingBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md, height: 32, borderRadius: radius.pill, justifyContent: "center",
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.stamp, borderColor: colors.stamp },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  chipTextOn: { color: "#FFFFFF" },
  errorBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginBottom: spacing.md },
  errorText: { ...type.small, color: colors.alert, flex: 1 },
  listCard: { paddingVertical: spacing.xs },
  item: { paddingVertical: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  itemTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  title: { flex: 1 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.xs },
  meta: { fontSize: 12, color: colors.muted },
  pressed: { opacity: 0.6 },
});
