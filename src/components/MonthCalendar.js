import GlassTint from "./GlassTint";
import { Text } from "./Typography";
// 날짜 선택용 작은 달력과 일정 개수를 보여주는 월 달력.
import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, type, glass } from "../theme/theme";
import { monthWeeks } from "../utils/calendarData";

export const CALENDAR_ACCENT = colors.stamp;
export const CALENDAR_EVENT_COLORS = { deadline: "#A23442", todo: "#34A294" };
const pad = (value) => String(value).padStart(2, "0");

function EventStripe({ kind, compact = false }) {
  return <View style={[styles.eventStripe,
    kind === "deadline" ? styles.deadlineStripe : styles.todoStripe,
    compact && styles.legendStripe]} />;
}

export default function MonthCalendar({ month, onMonthChange, selected, onSelect, today, events = {}, showEventCounts = false }) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const weeks = monthWeeks(year, monthIndex);
  const moveMonth = (offset) => onMonthChange(new Date(year, monthIndex + offset, 1));

  return (
    <View style={styles.panel}>
      <GlassTint radius={24} />
      <View style={styles.monthHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => moveMonth(-1)} style={styles.monthButton}>
          <Ionicons name="chevron-back" size={20} color={CALENDAR_ACCENT} />
        </Pressable>
        <Text style={type.bodyStrong}>{year}년 {monthIndex + 1}월</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="다음 달" onPress={() => moveMonth(1)} style={styles.monthButton}>
          <Ionicons name="chevron-forward" size={20} color={CALENDAR_ACCENT} />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {Array.from("일월화수목금토").map((day, index) => (
          <View key={day} style={styles.dayCell}>
            <Text style={[styles.weekday, index === 0 && styles.sunday, index === 6 && styles.saturday]}>{day}</Text>
          </View>
        ))}
      </View>

      {weeks.map((week, index) => (
        <View key={index} style={[styles.weekRow, showEventCounts && styles.eventWeek]}>
          {week.map((day, weekday) => {
            if (!day) return <View key={weekday} style={styles.dayCell} />;
            const key = `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
            const isSelected = key === selected;
            const isToday = key === today;
            const ev = events[key];
            const hasDeadline = !!ev?.deadlines.length;
            const hasTodo = !!ev?.todos.length;
            const label = `${monthIndex + 1}월 ${day}일${hasDeadline ? `, 마감 ${ev.deadlines.length}개` : ""}${hasTodo ? `, 할 일 ${ev.todos.length}개` : ""}`;
            return (
              <View key={weekday} style={styles.dayCell}>
                <Pressable accessibilityRole="button" accessibilityLabel={label} aria-selected={isSelected}
                  onPress={() => onSelect(key)}
                  style={({ pressed }) => [styles.dayButton, showEventCounts && styles.eventDayButton,
                    !showEventCounts && isToday && !isSelected && styles.today,
                    !showEventCounts && isSelected && styles.selected, pressed && styles.pressed]}>
                  <View style={[showEventCounts && styles.dateNumber,
                    showEventCounts && isToday && !isSelected && styles.today,
                    showEventCounts && isSelected && styles.selected]}>
                    <Text style={[styles.dayText, weekday === 0 && styles.sunday, weekday === 6 && styles.saturday,
                      isToday && styles.todayText, isSelected && styles.selectedText]}>{day}</Text>
                  </View>
                  {showEventCounts ? <View style={styles.eventStripes}>
                    {ev?.deadlines.map((deadline, eventIndex) => (
                      <EventStripe key={`deadline-${deadline.id ?? eventIndex}`} kind="deadline" />
                    ))}
                    {ev?.todos.map((todo, eventIndex) => (
                      <EventStripe key={`todo-${todo.id ?? eventIndex}`} kind="todo" />
                    ))}
                  </View> : <View style={styles.dots}>
                    {hasDeadline && <View style={[styles.dot, { backgroundColor: isSelected ? "#fff" : CALENDAR_EVENT_COLORS.deadline }]} />}
                    {hasTodo && <View style={[styles.dot, { backgroundColor: isSelected ? "#fff" : CALENDAR_EVENT_COLORS.todo }]} />}
                  </View>}
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          {showEventCounts ? <EventStripe kind="deadline" compact /> : <View style={[styles.dot, styles.deadlineStripe]} />}
          <Text style={styles.legendText}>마감</Text>
        </View>
        <View style={styles.legendItem}>
          {showEventCounts ? <EventStripe kind="todo" compact /> : <View style={[styles.dot, styles.todoStripe]} />}
          <Text style={styles.legendText}>할 일</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { ...glass, borderRadius: radius.lg, padding: spacing.lg },
  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  monthButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  weekRow: { flexDirection: "row" },
  dayCell: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 46 },
  weekday: { ...type.small, fontWeight: "600" },
  sunday: { color: colors.alert },
  saturday: { color: colors.stamp },
  dayButton: { width: "100%", maxWidth: 42, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  dayText: { ...type.body },
  today: { borderWidth: 1.5, borderColor: CALENDAR_ACCENT },
  todayText: { fontWeight: "700", color: CALENDAR_ACCENT },
  selected: { backgroundColor: colors.ink },
  selectedText: { color: colors.surface, fontWeight: "700" },
  eventWeek: { borderTopWidth: 1, borderTopColor: colors.line },
  eventDayButton: { maxWidth: 64, minHeight: 82, height: "auto", paddingVertical: 5, paddingHorizontal: 1, justifyContent: "flex-start" },
  dateNumber: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  eventStripes: { width: "100%", gap: 3, marginTop: 4, paddingHorizontal: 3 },
  eventStripe: { height: 6, borderRadius: 3, borderWidth: 1 },
  deadlineStripe: { backgroundColor: CALENDAR_EVENT_COLORS.deadline, borderColor: "#742431" },
  todoStripe: { backgroundColor: CALENDAR_EVENT_COLORS.todo, borderColor: "#216F65" },
  legendStripe: { width: 18 },
  pressed: { opacity: 0.65 },
  dots: { flexDirection: "row", gap: 3, height: 6, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legend: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.md, paddingTop: spacing.sm, paddingHorizontal: spacing.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendText: { ...type.small },
});
