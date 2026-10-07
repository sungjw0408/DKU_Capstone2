import React, { useState } from "react";
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Card from "./Card";
import PrimaryButton from "./PrimaryButton";
import { CalendarDateField, TimeSelectionField } from "./PlanDateTimeFields";
import { colors, spacing, radius, type } from "../theme/theme";
import { durationFromParts, formatStepDate, validatePlanStep } from "../utils/preparationPlan";

const accent = "#5B50D6";

function makeForm(step, defaultDate) {
  return {
    label: step?.label ?? "", date: step?.date ?? defaultDate, time: step?.time ?? "",
    durationHours: step?.durationMinutes == null ? "" : String(Math.floor(step.durationMinutes / 60)),
    durationMinutes: step?.durationMinutes == null ? "" : String(step.durationMinutes % 60), notes: step?.notes ?? "",
  };
}

function Field({ label, value, onChangeText, placeholder, keyboardType = "default", multiline = false, maxLength = 120 }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText}
        placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType}
        multiline={multiline} maxLength={maxLength} autoCorrect={false}
        style={[styles.input, multiline && styles.multiline]} />
    </View>
  );
}

// 부모가 표시할 때 새로 마운트하므로 취소한 입력은 다음 편집에 남지 않는다.
export default function PlanEditorModal({ mode, steps, onSave, onClose, allowUndated = false }) {
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(() => makeForm(null, allowUndated ? "" : steps[0]?.date ?? ""));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedStep = steps.find((step) => step.id === selectedId);
  const deadline = steps.find((step) => step.isDeadline);
  const lastPreparationDate = steps.filter((step) => !step.isDeadline && step.date).map((step) => step.date).sort().pop();
  const showList = mode === "edit" && !selectedId;
  const update = (key) => (value) => { setForm((prev) => ({ ...prev, [key]: value })); setError(""); };
  const selectStep = (step) => { setSelectedId(step.id); setForm(makeForm(step, "")); setError(""); };
  const backToList = () => { setSelectedId(null); setError(""); };
  const save = async () => {
    if (saving) return;
    const message = validatePlanStep(form, steps, selectedId, allowUndated);
    if (message) return setError(message);
    setSaving(true);
    try { await onSave({
      ...selectedStep, id: selectedId, label: form.label.trim(), date: form.date.trim(), time: form.time.trim(),
      deadlineText: selectedStep?.isDeadline && form.date.trim() !== selectedStep.date ? "" : selectedStep?.deadlineText,
      durationMinutes: durationFromParts(form.durationHours, form.durationMinutes),
      notes: form.notes.trim(), done: selectedStep?.done ?? false,
    }); }
    catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (!saving) onClose(); }}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <SafeAreaView style={styles.modalSafe} edges={["top", "bottom"]}>
          <Card style={styles.dialog}>
            <View style={styles.header}>
              <Text style={styles.title}>{showList ? "준비 계획 수정" : mode === "add" ? "일정 추가" : "일정 수정"}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="편집 닫기" disabled={saving} onPress={onClose} hitSlop={8} style={styles.iconButton}>
                <Ionicons name="close" size={24} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
              {showList ? (
                <>
                  <Text style={styles.hint}>수정할 일정을 선택해 주세요.</Text>
                  {steps.map((step) => (
                    <Pressable key={step.id} accessibilityRole="button" accessibilityLabel={`${step.label} 수정`}
                      onPress={() => selectStep(step)} style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}>
                      <View style={styles.listText}>
                        <Text style={styles.listDate}>{formatStepDate(step.date)}{step.isDeadline ? " · 최종 마감" : ""}</Text>
                        <Text style={type.bodyStrong}>{step.label}</Text>
                      </View>
                      <Ionicons name="create-outline" size={20} color={accent} />
                    </Pressable>
                  ))}
                </>
              ) : (
                <>
                  <Field label="일정 이름" value={form.label} onChangeText={update("label")} placeholder="예: 제출 서류 최종 확인" />
                  <CalendarDateField key={selectedId ?? "new"} value={form.date} onChange={update("date")}
                    allowClear={allowUndated}
                    minDate={selectedStep?.isDeadline ? lastPreparationDate : undefined}
                    maxDate={selectedStep?.isDeadline ? undefined : deadline?.date} />
                  <TimeSelectionField label={selectedStep?.isDeadline ? "마감 시간 (선택)" : "시간 (선택)"} value={form.time} onChange={update("time")} />
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>예상 소요시간 (선택)</Text>
                    <View style={styles.durationRow}>
                      <TextInput accessibilityLabel="예상 소요시간 시간" value={form.durationHours} onChangeText={update("durationHours")}
                        placeholder="0" placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={2} style={[styles.input, styles.durationInput]} />
                      <Text style={type.body}>시간</Text>
                      <TextInput accessibilityLabel="예상 소요시간 분" value={form.durationMinutes} onChangeText={update("durationMinutes")}
                        placeholder="0" placeholderTextColor={colors.muted} keyboardType="number-pad" maxLength={2} style={[styles.input, styles.durationInput]} />
                      <Text style={type.body}>분</Text>
                    </View>
                  </View>
                  <Field label="메모·필요 서류 (선택)" value={form.notes} onChangeText={update("notes")} placeholder="예: 신청서, 성적증명서, 통장 사본" multiline maxLength={500} />
                  {!!error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
                </>
              )}
            </ScrollView>
            {!showList && (
              <View style={styles.footer}>
                <Pressable accessibilityRole="button" disabled={saving} onPress={mode === "edit" ? backToList : onClose} style={styles.cancelButton}>
                  <Text style={styles.cancelText}>{mode === "edit" ? "목록으로" : "취소"}</Text>
                </Pressable>
                <View style={styles.saveButton}>
                  <PrimaryButton disabled={saving} label={saving ? "저장 중…" : mode === "add" ? "일정 추가하기" : "수정 저장하기"} onPress={save} style={styles.primary} />
                </View>
              </View>
            )}
          </Card>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(20, 24, 48, 0.35)", justifyContent: "center" },
  modalSafe: { flex: 1, justifyContent: "center", padding: spacing.lg },
  dialog: { width: "100%", maxWidth: 480, maxHeight: "100%", alignSelf: "center", padding: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  title: { ...type.h1, flex: 1 },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { paddingBottom: spacing.sm },
  hint: { ...type.body, color: colors.muted, marginBottom: spacing.md },
  listRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line },
  listText: { flex: 1, gap: spacing.xs }, listDate: { ...type.small }, pressed: { opacity: 0.65 },
  field: { marginBottom: spacing.lg }, fieldLabel: { ...type.bodyStrong, marginBottom: spacing.sm },
  input: { ...type.body, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, backgroundColor: colors.paper, padding: spacing.md, minHeight: 46 },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  durationRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  durationInput: { flex: 1, minWidth: 0, textAlign: "center" },
  error: { ...type.small, color: colors.alert, lineHeight: 18, marginBottom: spacing.md },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: spacing.md },
  cancelButton: { padding: spacing.md }, cancelText: { ...type.bodyStrong, color: colors.muted }, saveButton: { flex: 1 },
  primary: { backgroundColor: accent, minHeight: 48, justifyContent: "center" },
});
