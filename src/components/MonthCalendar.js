// 월 달력 (계획 수정 화면의 날짜 선택 달력과 같은 모양) + 날짜별 마감·할 일 점 표시
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, type } from "../theme/theme";
import { monthWeeks } from "../utils/calendarData";

export const CALENDAR_ACCENT = colors.stamp;
const pad = (value) => String(value).padStart(2, "0");

export default function MonthCalendar({ month, onMonthChange, selected, onSelect, today, events = {} }) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const weeks = monthWeeks(year, monthIndex);
  const moveMonth = (offset) => onMonthChange(new Date(year, monthIndex + offset, 1));

  return (
    <View style={styles.panel}>
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
        <View key={index} style={styles.weekRow}>
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
                  style={({ pressed }) => [styles.dayButton, isToday && !isSelected && styles.today,
                    isSelected && styles.selected, pressed && styles.pressed]}>
                  <Text style={[styles.dayText, weekday === 0 && styles.sunday, weekday === 6 && styles.saturday,
                    isToday && styles.todayText, isSelected && styles.selectedText]}>{day}</Text>
                  <View style={styles.dots}>
                    {hasDeadline && <View style={[styles.dot, { backgroundColor: isSelected ? "#fff" : colors.alert }]} />}
                    {hasTodo && <View style={[styles.dot, { backgroundColor: isSelected ? "#fff" : CALENDAR_ACCENT }]} />}
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}

      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.alert }]} /><Text style={styles.legendText}>마감</Text></View>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: CALENDAR_ACCENT }]} /><Text style={styles.legendText}>준비 할 일</Text></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface },
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
  selected: { backgroundColor: CALENDAR_ACCENT },
  selectedText: { color: colors.surface, fontWeight: "700" },
  pressed: { opacity: 0.65 },
  dots: { flexDirection: "row", gap: 3, height: 6, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  legend: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.md, paddingTop: spacing.sm, paddingHorizontal: spacing.xs },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendText: { ...type.small },
});
