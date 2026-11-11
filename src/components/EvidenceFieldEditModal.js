import React, { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Card from "./Card";
import { CalendarDateField, TimeSelectionField } from "./PlanDateTimeFields";
import PrimaryButton from "./PrimaryButton";
import { Text, TextInput } from "./Typography";
import { colors, inputSurface, radius, spacing, type } from "../theme/theme";
import { formatDeadline, parsePlanDate } from "../utils/preparationPlan";

const DATE_KEYS = new Set(["application_start", "deadline", "announcement_date", "event_date"]);

function FieldForm({ field, busy, onSave, onClose }) {
  const [originalDate, originalTime = ""] = (field.normalized_datetime ?? "").split("T");
  const [date, setDate] = useState(parsePlanDate(originalDate) ? originalDate : "");
  const [time, setTime] = useState(/^([01]\d|2[0-3]):[0-5]\d$/.test(originalTime.slice(0, 5)) ? originalTime.slice(0, 5) : "");
  const [value, setValue] = useState(field.value);
  const [error, setError] = useState("");
  const isDate = DATE_KEYS.has(field.key);
  const useDate = isDate && !!date;

  const save = async () => {
    if (busy) return;
    const text = useDate ? formatDeadline({ date, time }) : value.trim();
    if (!text) {
      setError("수정할 내용을 입력해 주세요.");
      return;
    }
    const patch = { value: text };
    if (isDate) patch.normalized_datetime = useDate ? date + (time ? `T${time}` : "") : null;
    setError("");
    try {
      await onSave(field.id, patch);
    } catch (e) {
      setError(e.message || "수정 내용을 저장하지 못했어요.");
    }
  };

  return <>
    <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      <Text style={styles.fieldLabel}>{field.label}</Text>
      {!!field.evidence?.matched_text && (
        <View style={styles.excerpt}>
          <Text style={type.label}>원문 근거</Text>
          <Text style={type.body}>{field.evidence.matched_text}</Text>
        </View>
      )}
      {isDate && (
        <CalendarDateField value={date} allowClear onChange={(next) => {
          if (!next && date) { setTime(""); setValue(""); }
          setDate(next);
          setError("");
        }} />
      )}
      {useDate ? (
        <TimeSelectionField label="시간 (선택)" value={time} onChange={setTime} />
      ) : (
        <View>
          <Text style={styles.fieldLabel}>{isDate ? "날짜 안내 문구" : "수정 내용"}</Text>
          <TextInput
            accessibilityLabel={isDate ? "날짜 안내 문구" : "수정 내용"}
            value={value} onChangeText={(next) => { setValue(next); setError(""); }}
            editable={!busy} multiline textAlignVertical="top" style={styles.input}
            placeholder={isDate ? "예: 추후 별도 안내" : "올바른 내용을 입력해 주세요"}
            placeholderTextColor={colors.muted}
          />
        </View>
      )}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </ScrollView>
    <View style={styles.buttons}>
      <Pressable accessibilityRole="button" disabled={busy} onPress={onClose} style={styles.cancel}>
        <Text style={type.bodyStrong}>취소</Text>
      </Pressable>
      <PrimaryButton label={busy ? "저장 중…" : "수정 저장"} disabled={busy} onPress={save} tone="stamp" style={styles.save} />
    </View>
  </>;
}

export default function EvidenceFieldEditModal({ fields, busy, onSave, onClose }) {
  const [fieldId, setFieldId] = useState(fields[0].id);
  const field = fields.find((item) => item.id === fieldId) ?? fields[0];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Card style={styles.dialog}>
          <Text accessibilityRole="header" style={type.h1}>항목 직접 수정</Text>
          {fields.length > 1 && <View style={styles.fieldChoices}>
            {fields.map((item) => (
              <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === field.id }}
                disabled={busy} onPress={() => setFieldId(item.id)}
                style={[styles.choice, item.id === field.id && styles.choiceSelected]}>
                <Text style={type.bodyStrong}>{item.label}</Text>
              </Pressable>
            ))}
          </View>}
          <FieldForm key={field.id} field={field} busy={busy} onSave={onSave} onClose={onClose} />
        </Card>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.overlay },
  dialog: { width: "100%", maxWidth: 480, maxHeight: "90%", alignSelf: "center", gap: spacing.md },
  scroll: { flexGrow: 0, flexShrink: 1 },
  fieldChoices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  choice: { minHeight: 40, justifyContent: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md },
  choiceSelected: { backgroundColor: colors.stampSoft, borderColor: colors.stamp },
  fieldLabel: { ...type.bodyStrong, marginBottom: spacing.sm },
  excerpt: { gap: spacing.xs, padding: spacing.md, marginBottom: spacing.md, backgroundColor: colors.goldSoft, borderRadius: radius.sm },
  input: { ...type.body, minHeight: 92, backgroundColor: inputSurface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: spacing.md },
  error: { ...type.small, color: colors.alert, marginTop: spacing.sm },
  buttons: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cancel: { padding: spacing.md },
  save: { flex: 1 },
});
