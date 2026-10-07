// 캘린더: 저장된 문서 마감일과 준비 계획 할 일을 달력에 표시하고, 날짜를 누르면 그날의 마감·할 일을 보여준다.
import React, { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Card from "../components/Card";
import Badge from "../components/Badge";
import MonthCalendar, { CALENDAR_ACCENT } from "../components/MonthCalendar";
import { colors, spacing, type } from "../theme/theme";
import { listDocuments, listTodos, getDocument } from "../services/api";
import { ddayLabel } from "../utils/homeData";
import { buildCalendarEvents, monthDeadlineCount, dateKeyOf, dateLabel, parseDateKey } from "../utils/calendarData";
import { ddayTone } from "../utils/dday";

export default function CalendarScreen({ navigation }) {
  const todayKey = dateKeyOf(new Date());
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(todayKey);
  const [documents, setDocuments] = useState([]);
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState(null);
  const [reload, setReload] = useState(0);

  // 화면에 들어올 때마다 최신 마감·할 일을 다시 불러온다 (계획 수정 후 돌아와도 반영)
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([listDocuments(), listTodos()])
      .then(([docs, items]) => {
        if (!active) return;
        setDocuments(docs);
        setTodos(items);
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [reload]));

  const events = useMemo(() => buildCalendarEvents(documents, todos), [documents, todos]);
  const day = events[selected] ?? { deadlines: [], todos: [] };
  const monthCount = monthDeadlineCount(events, month.getFullYear(), month.getMonth());

  const selectDate = (key) => {
    setSelected(key);
    const date = parseDateKey(key);
    if (date && (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear())) {
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  };
  const goToday = () => { setMonth(new Date()); setSelected(todayKey); };

  const openDocument = async (id) => {
    if (openingId || !id) return;

    // 등록을 마친 문서는 바로 관리 화면으로 (할 일 확인·체크)
    const doc = documents.find((d) => d.id === id);
    if (doc?.registered) {
      navigation.navigate("Management", { documentId: id, documentTitle: doc.title });
      return;
    }

    // 아직 등록 전이면 지금처럼 분석 결과부터
    setOpeningId(id);
    setError("");
    try {
      const result = await getDocument(id);
      navigation.navigate("AIAnalysis", { ...result, preview: { kind: result.sourceKind } });
    } catch (e) {
      setError(e.message);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topRow}>
          <Text style={styles.summary}>
            {loading ? "불러오는 중…" : `${month.getMonth() + 1}월 마감 ${monthCount}개`}
          </Text>
          <Pressable accessibilityRole="button" onPress={goToday} hitSlop={8} style={styles.todayButton}>
            <Text style={styles.todayButtonText}>오늘</Text>
          </Pressable>
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => setReload((n) => n + 1)} hitSlop={8}>
              <Text style={[type.bodyStrong, { color: colors.stamp }]}>다시 불러오기</Text>
            </Pressable>
          </View>
        )}

        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={selectDate}
          today={todayKey}
          events={events}
        />

        <Text style={styles.dayTitle}>{dateLabel(selected)}{selected === todayKey ? " · 오늘" : ""}</Text>

        {loading ? (
          <Card><ActivityIndicator color={CALENDAR_ACCENT} /></Card>
        ) : day.deadlines.length === 0 && day.todos.length === 0 ? (
          <Card><Text style={type.small}>이 날은 마감이나 할 일이 없어요.</Text></Card>
        ) : (
          <>
            {day.deadlines.length > 0 && (
              <>
                <Text style={styles.groupTitle}>마감 {day.deadlines.length}개</Text>
                <Card style={styles.listCard}>
                  {day.deadlines.map((doc, idx) => (
                    <Pressable key={doc.id} accessibilityRole="button" accessibilityLabel={`${doc.title} 문서 열기`}
                      disabled={!!openingId} onPress={() => openDocument(doc.id)}
                      style={({ pressed }) => [styles.item, idx > 0 && styles.divider, pressed && styles.pressed]}>
                      <View style={[styles.bar, { backgroundColor: colors.alert }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={type.bodyStrong} numberOfLines={2}>{doc.title}</Text>
                        <Text style={styles.sub}>{doc.time ? `${doc.time} 마감` : "마감일"}{doc.dday > 0 ? " · 마감 지남" : ""}</Text>
                      </View>
                      {openingId === doc.id ? <ActivityIndicator color={colors.stamp} />
                        : <Badge label={ddayLabel(doc.dday)} tone={ddayTone(-doc.dday)} />}
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </Pressable>
                  ))}
                </Card>
              </>
            )}

            {day.todos.length > 0 && (
              <>
                <Text style={styles.groupTitle}>준비 할 일 {day.todos.length}개</Text>
                <Card style={styles.listCard}>
                  {day.todos.map((todo, idx) => (
                    <Pressable key={todo.id} accessibilityRole="button" accessibilityLabel={`${todo.title}, ${todo.doc_title}`}
                      disabled={!!openingId || !todo.document_id} onPress={() => openDocument(todo.document_id)}
                      style={({ pressed }) => [styles.item, idx > 0 && styles.divider, pressed && styles.pressed]}>
                      <Ionicons name={todo.is_completed ? "checkbox" : "square-outline"} size={20}
                        color={todo.is_completed ? CALENDAR_ACCENT : colors.muted} />
                      <View style={{ flex: 1 }}>
                        <Text style={[type.bodyStrong, todo.is_completed && styles.done]} numberOfLines={2}>{todo.title}</Text>
                        <Text style={styles.sub} numberOfLines={1}>{todo.time ? `${todo.time} · ` : ""}{todo.doc_title}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </Pressable>
                  ))}
                </Card>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  summary: { ...type.bodyStrong, color: colors.muted },
  todayButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.surface },
  todayButtonText: { fontSize: 13, fontWeight: "700", color: CALENDAR_ACCENT },
  errorBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginBottom: spacing.md },
  errorText: { ...type.small, color: colors.alert, flex: 1 },
  dayTitle: { ...type.h2, fontSize: 18, marginTop: spacing.xl, marginBottom: spacing.sm },
  groupTitle: { ...type.label, fontSize: 12, marginTop: spacing.sm, marginBottom: spacing.xs },
  listCard: { paddingVertical: spacing.xs, marginBottom: spacing.sm },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  bar: { width: 4, alignSelf: "stretch", borderRadius: 2 },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  done: { color: colors.muted, textDecorationLine: "line-through" },
  pressed: { opacity: 0.6 },
});
