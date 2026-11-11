import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Typography";
import MonthCalendar from "./MonthCalendar";
import { dateKeyOf, parseDateKey } from "../utils/calendarData";
import { colors, radius, spacing, type } from "../theme/theme";

const weekdays = ["월", "화", "수", "목", "금", "토", "일"];

export default function WeekDatePicker({ selected, onSelect, today }) {
  const date = parseDateKey(selected);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(date);
  const monday = new Date(date);
  monday.setDate(date.getDate() - (date.getDay() + 6) % 7);

  const chooseDate = (key) => {
    onSelect(key);
    setOpen(false);
  };

  return <View style={styles.picker}>
    <View style={styles.toolbar}>
      <Pressable accessibilityRole="button" accessibilityLabel="날짜 선택" accessibilityState={{ expanded: open }}
        onPress={() => { setMonth(date); setOpen(true); }} style={styles.monthButton}>
        <Text style={styles.monthText}>{date.getFullYear()}.{String(date.getMonth() + 1).padStart(2, "0")}</Text>
        <Ionicons name="chevron-down" size={15} color={colors.muted} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="오늘 날짜로 돌아가기" onPress={() => chooseDate(today)} style={styles.todayButton}>
        <Ionicons name="refresh-outline" size={14} color={colors.ink} />
        <Text style={styles.todayText}>오늘</Text>
      </Pressable>
    </View>
    <View style={styles.week}>
      {weekdays.map((label, index) => {
        const day = new Date(monday);
        day.setDate(monday.getDate() + index);
        const key = dateKeyOf(day);
        const active = key === selected;
        const isToday = key === today;
        return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: active }} aria-pressed={active}
          accessibilityLabel={`${day.getFullYear()}년 ${day.getMonth() + 1}월 ${day.getDate()}일 ${label}요일${isToday ? ", 오늘" : ""}`}
          onPress={() => chooseDate(key)} style={styles.day}>
          <Text style={styles.weekday}>{label}</Text>
          <View style={[styles.number, isToday && !active && styles.todayNumber, active && styles.selected]}>
            <Text style={[styles.dayText, isToday && !active && styles.todayNumberText, active && styles.selectedText]}>{day.getDate()}</Text>
          </View>
        </Pressable>;
      })}
    </View>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
        <Pressable style={styles.calendar} onPress={(event) => event.stopPropagation()}>
          <View style={styles.calendarHeader}>
            <Text accessibilityRole="header" style={type.h2}>날짜 선택</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="날짜 선택 닫기" style={styles.close} onPress={() => setOpen(false)}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </Pressable>
          </View>
          <MonthCalendar month={month} onMonthChange={setMonth} selected={selected} onSelect={chooseDate} today={today} />
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  picker: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  monthButton: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface,
    flexDirection: "row", alignItems: "center", gap: 6 },
  monthText: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  todayButton: { minHeight: 40, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: "#CDD0D5",
    flexDirection: "row", alignItems: "center", gap: 5 },
  todayText: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  week: { flexDirection: "row" },
  day: { flex: 1, alignItems: "center", gap: 6, paddingVertical: 4 },
  weekday: { fontSize: 11, color: colors.muted },
  number: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dayText: { fontSize: 16, fontWeight: "600", color: colors.ink },
  selected: { backgroundColor: colors.ink },
  selectedText: { color: colors.surface },
  todayNumber: { backgroundColor: colors.stampSoft },
  todayNumberText: { color: colors.stamp },
  backdrop: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg, backgroundColor: colors.overlay },
  calendar: { width: "100%", maxWidth: 420, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  calendarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
