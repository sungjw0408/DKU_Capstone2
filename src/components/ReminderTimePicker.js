import React, { useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "./Typography";
import PrimaryButton from "./PrimaryButton";
import useReducedMotion from "../hooks/useReducedMotion";
import { reminderTimeLabel } from "../utils/notificationPlan";
import { colors, radius, spacing, type } from "../theme/theme";

const ROW_HEIGHT = 44;
const PERIODS = [0, 1];
const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const pad = (value) => String(value).padStart(2, "0");

function WheelColumn({ label, values, value, format, onChange, disabled, reducedMotion }) {
  const scroll = useRef(null);
  const index = values.indexOf(value);
  const lastIndex = useRef(index);
  const select = (next) => {
    const selected = Math.max(0, Math.min(values.length - 1, next));
    lastIndex.current = selected;
    onChange(values[selected]);
    scroll.current?.scrollTo({ y: selected * ROW_HEIGHT, animated: !reducedMotion });
  };
  const position = () => scroll.current?.scrollTo({ y: index * ROW_HEIGHT, animated: false });

  return <View style={styles.column}>
    <Text style={styles.columnLabel}>{label}</Text>
    <View style={styles.wheel} accessible accessibilityRole="adjustable" accessibilityLabel={`${label} 다이얼`}
      accessibilityValue={{ min: 0, max: values.length - 1, now: index, text: format(value) }}
      aria-valuemin={0} aria-valuemax={values.length - 1} aria-valuenow={index} aria-valuetext={format(value)}
      accessibilityActions={[{ name: "increment", label: "다음 값" }, { name: "decrement", label: "이전 값" }]}
      onAccessibilityAction={(event) => {
        const action = event.nativeEvent.actionName;
        if (!disabled && ["increment", "decrement"].includes(action)) select(index + (action === "increment" ? 1 : -1));
      }}
      {...(Platform.OS === "web" ? { tabIndex: disabled ? -1 : 0, onKeyDown: (event) => {
        if (disabled || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault();
        select(index + (event.key === "ArrowDown" ? 1 : -1));
      } } : {})}>
      <View pointerEvents="none" style={styles.selection} />
      <ScrollView ref={scroll} style={styles.wheelScroll} contentContainerStyle={styles.wheelContent}
        onLayout={position} onContentSizeChange={position} scrollEnabled={!disabled}
        snapToInterval={ROW_HEIGHT} decelerationRate="fast" showsVerticalScrollIndicator={false}
        nestedScrollEnabled scrollEventThrottle={16} keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          if (disabled) return;
          const next = Math.max(0, Math.min(values.length - 1, Math.round(event.nativeEvent.contentOffset.y / ROW_HEIGHT)));
          if (next !== lastIndex.current) { lastIndex.current = next; onChange(values[next]); }
        }}>
        {values.map((item, itemIndex) => <Pressable key={item} accessibilityRole="button"
          accessibilityLabel={`${format(item)} 선택`} accessibilityState={{ selected: item === value, disabled }}
          aria-pressed={item === value} disabled={disabled} onPress={() => select(itemIndex)}
          style={[styles.option, { opacity: item === value ? 1 : Math.abs(itemIndex - index) > 2 ? 0.2 : 0.5 }]}>
          <Text style={[styles.optionText, item === value && styles.optionSelected]}>{format(item)}</Text>
        </Pressable>)}
      </ScrollView>
    </View>
  </View>;
}

export default function ReminderTimePicker({ value, busy, error, onSave, onClose }) {
  const [draft, setDraft] = useState(value);
  const reducedMotion = useReducedMotion();
  const setHour = (hour) => setDraft((previous) => ({ ...previous, hour: hour % 12 + Math.floor(previous.hour / 12) * 12 }));
  const setPeriod = (period) => setDraft((previous) => ({ ...previous, hour: previous.hour % 12 + period * 12 }));

  return <Modal visible transparent animationType={reducedMotion ? "none" : "fade"} onRequestClose={() => { if (!busy) onClose(); }}>
    <Pressable style={styles.overlay} disabled={busy} onPress={onClose}>
      <Pressable accessibilityViewIsModal style={styles.dialog} onPress={(event) => event.stopPropagation()}>
        <Text accessibilityRole="header" style={type.h1}>알림 시각</Text>
        <Text accessibilityLiveRegion="polite" style={styles.preview}>{reminderTimeLabel(draft.hour, draft.minute)}</Text>
        <View style={styles.wheels}>
          <WheelColumn label="오전·오후" values={PERIODS} value={Math.floor(draft.hour / 12)} format={(period) => period === 0 ? "오전" : "오후"}
            onChange={setPeriod} disabled={busy} reducedMotion={reducedMotion} />
          <WheelColumn label="시" values={HOURS} value={draft.hour % 12 || 12} format={(hour) => `${hour}시`}
            onChange={setHour} disabled={busy} reducedMotion={reducedMotion} />
          <WheelColumn label="분" values={MINUTES} value={draft.minute} format={(minute) => `${pad(minute)}분`}
            onChange={(minute) => setDraft((previous) => ({ ...previous, minute }))} disabled={busy} reducedMotion={reducedMotion} />
        </View>
        {!!error && <Text accessibilityRole="alert" style={[type.small, { color: colors.alert }]}>{error}</Text>}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={styles.cancel}>
            <Text style={type.bodyStrong}>취소</Text>
          </Pressable>
          <PrimaryButton label={busy ? "저장 중…" : "저장"} tone="stamp" disabled={busy} onPress={() => onSave(draft)} style={styles.save} />
        </View>
      </Pressable>
    </Pressable>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.lg, backgroundColor: colors.overlay },
  dialog: { width: "100%", maxWidth: 380, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  preview: { fontSize: 24, fontWeight: "700", color: colors.stamp, textAlign: "center", paddingVertical: spacing.sm },
  wheels: { flexDirection: "row", gap: spacing.sm },
  column: { flex: 1, minWidth: 0 },
  columnLabel: { ...type.small, textAlign: "center", marginBottom: spacing.sm },
  wheel: { height: ROW_HEIGHT * 5, overflow: "hidden", borderRadius: radius.md },
  selection: { position: "absolute", top: ROW_HEIGHT * 2, left: 0, right: 0, height: ROW_HEIGHT, backgroundColor: colors.stampSoft, borderRadius: radius.sm },
  wheelScroll: { height: ROW_HEIGHT * 5, ...Platform.select({ web: { scrollSnapType: "y mandatory" }, default: {} }) },
  wheelContent: { paddingVertical: ROW_HEIGHT * 2 },
  option: { height: ROW_HEIGHT, alignItems: "center", justifyContent: "center", ...Platform.select({ web: { scrollSnapAlign: "center" }, default: {} }) },
  optionText: { color: colors.muted, fontSize: 18, fontWeight: "500" },
  optionSelected: { color: colors.stamp, fontSize: 20, fontWeight: "700" },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  cancel: { flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  save: { flex: 1 },
});
