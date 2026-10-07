import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, type } from "../theme/theme";
import { parsePlanDate } from "../utils/preparationPlan";

const accent = "#5B50D6";
const pad = (value) => String(value).padStart(2, "0");

export function CalendarDateField({ value, onChange, minDate, maxDate, allowClear = false }) {
  const [open, setOpen] = useState(false);
  const selected = parsePlanDate(value);
  const [month, setMonth] = useState(() => selected ?? new Date());
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const weeks = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const day = week * 7 + weekday - firstWeekday + 1;
      return day >= 1 && day <= daysInMonth ? day : null;
    }));
  const moveMonth = (offset) => {
    const next = new Date(year, monthIndex + offset, 1);
    if (next.getFullYear() >= 1000 && next.getFullYear() <= 9999) setMonth(next);
  };
  const toggle = () => {
    if (!open) setMonth(selected ?? new Date());
    setOpen((prev) => !prev);
  };
  return (
    <View style={styles.field}>
      <Text style={styles.label}>날짜</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="날짜 선택" aria-expanded={open}
        onPress={toggle} style={styles.selector}>
        <Text style={type.body}>{selected ? `${selected.getFullYear()}년 ${selected.getMonth() + 1}월 ${selected.getDate()}일` : "달력에서 날짜 선택"}</Text>
        <Ionicons name="calendar-outline" size={20} color={accent} />
      </Pressable>
      {open && (
        <View style={styles.panel}>
          <View style={styles.monthHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="이전 달" onPress={() => moveMonth(-1)} style={styles.monthButton}>
              <Ionicons name="chevron-back" size={20} color={accent} />
            </Pressable>
            <Text style={type.bodyStrong}>{year}년 {monthIndex + 1}월</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="다음 달" onPress={() => moveMonth(1)} style={styles.monthButton}>
              <Ionicons name="chevron-forward" size={20} color={accent} />
            </Pressable>
          </View>
          <View style={styles.weekRow}>
            {Array.from("일월화수목금토").map((day, index) => (
              <View key={day} style={styles.dayCell}><Text style={[styles.weekday, index === 0 && styles.sunday]}>{day}</Text></View>
            ))}
          </View>
          {weeks.map((week, index) => (
            <View key={index} style={styles.weekRow}>
              {week.map((day, weekday) => {
                const date = day ? `${year}-${pad(monthIndex + 1)}-${pad(day)}` : "";
                const disabled = !day || (!!minDate && date < minDate) || (!!maxDate && date > maxDate);
                const isSelected = date === value;
                return (
                  <View key={weekday} style={styles.dayCell}>
                    {day && <Pressable accessibilityRole="button" accessibilityLabel={`${year}년 ${monthIndex + 1}월 ${day}일 선택`}
                      aria-selected={isSelected} disabled={disabled} aria-disabled={disabled}
                      onPress={() => { onChange(date); setOpen(false); }}
                      style={({ pressed }) => [styles.dayButton, isSelected && styles.selected, disabled && styles.disabled, pressed && styles.pressed]}>
                      <Text style={[styles.dayText, weekday === 0 && styles.sunday, isSelected && styles.selectedText]}>{day}</Text>
                    </Pressable>}
                  </View>
                );
              })}
            </View>
          ))}
          {(minDate || maxDate) && <Text style={styles.hint}>{maxDate ? "최종 마감일까지 선택할 수 있어요." : "준비 일정 이후로 선택해 주세요."}</Text>}
          {allowClear && <Pressable accessibilityRole="button" onPress={() => { onChange(""); setOpen(false); }} style={styles.actionButton}>
            <Text style={styles.clearText}>날짜 미정으로 두기</Text>
          </Pressable>}
        </View>
      )}
    </View>
  );
}

export function TimeSelectionField({ label, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ hour: 9, minute: 0 });
  const toggle = () => {
    if (!open) {
      const [hour, minute] = value ? value.split(":").map(Number) : [9, 0];
      setDraft({ hour, minute });
    }
    setOpen((prev) => !prev);
  };
  const choose = (part, value) => {
    const next = { ...draft, [part]: value };
    setDraft(next);
    onChange(`${pad(next.hour)}:${pad(next.minute)}`);
  };
  const displayTime = value ? value.split(":").map(Number) : null;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="시간 선택" aria-expanded={open} onPress={toggle} style={styles.selector}>
        <Text style={[type.body, !value && { color: colors.muted }]}>{displayTime ? `${displayTime[0]}시 ${pad(displayTime[1])}분` : "시·분 선택"}</Text>
        <Ionicons name="time-outline" size={20} color={accent} />
      </Pressable>
      {open && (
        <View style={styles.panel}>
          <Text style={styles.hint}>24시간 기준으로 시와 분을 선택해 주세요.</Text>
          <View style={styles.timeColumns}>
            {[{ key: "hour", count: 24, unit: "시" }, { key: "minute", count: 60, unit: "분" }].map((part) => (
              <View key={part.key} style={styles.timeColumn}>
                <Text style={styles.columnTitle}>{part.key === "hour" ? "시" : "분"}</Text>
                <ScrollView style={styles.timeList} nestedScrollEnabled keyboardShouldPersistTaps="handled"
                  contentOffset={{ x: 0, y: Math.max(0, draft[part.key] * 40 - 40) }}>
                  {Array.from({ length: part.count }, (_, number) => (
                    <Pressable key={number} accessibilityRole="button" accessibilityLabel={`${number}${part.unit} 선택`}
                      aria-selected={draft[part.key] === number} onPress={() => choose(part.key, number)}
                      style={[styles.timeOption, draft[part.key] === number && styles.selected]}>
                      <Text style={[type.bodyStrong, draft[part.key] === number && styles.selectedText]}>{pad(number)}{part.unit}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ))}
          </View>
          <View style={styles.timeActions}>
            <Pressable accessibilityRole="button" onPress={() => { onChange(""); setOpen(false); }} style={styles.actionButton}>
              <Text style={styles.clearText}>시간 선택 해제</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => { onChange(`${pad(draft.hour)}:${pad(draft.minute)}`); setOpen(false); }} style={styles.actionButton}>
              <Text style={styles.doneText}>선택 완료</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: spacing.lg }, label: { ...type.bodyStrong, marginBottom: spacing.sm },
  selector: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, backgroundColor: colors.paper, padding: spacing.md, minHeight: 46 },
  panel: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.sm, backgroundColor: colors.surface },
  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.xs },
  monthButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  weekRow: { flexDirection: "row" }, dayCell: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 36 },
  weekday: { ...type.small, fontWeight: "600" }, sunday: { color: colors.alert },
  dayButton: { width: "100%", maxWidth: 40, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  dayText: { ...type.body }, selected: { backgroundColor: accent }, selectedText: { color: colors.surface },
  disabled: { opacity: 0.25 }, pressed: { opacity: 0.65 }, hint: { ...type.small, lineHeight: 18, padding: spacing.xs },
  timeColumns: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }, timeColumn: { flex: 1 },
  columnTitle: { ...type.bodyStrong, textAlign: "center", marginBottom: spacing.sm },
  timeList: { height: 140, flexGrow: 0, backgroundColor: colors.paper, borderRadius: radius.sm },
  timeOption: { height: 40, justifyContent: "center", alignItems: "center", borderRadius: radius.sm },
  timeActions: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm },
  actionButton: { padding: spacing.sm, minHeight: 40, justifyContent: "center" },
  clearText: { ...type.small }, doneText: { ...type.bodyStrong, color: accent },
});
