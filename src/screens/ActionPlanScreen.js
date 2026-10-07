// 담당자 3 (AI 행동 계획 / 검증→계획 흐름) 소유
// 문서 분석 결과로 준비 항목을 표시하고, 날짜와 소요시간은 사용자가 지정한다.
import React, { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { View, Text, ScrollView, Pressable, StyleSheet, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Card from "../components/Card";
import PrimaryButton from "../components/PrimaryButton";
import PlanEditorModal from "../components/PlanEditorModal";
import { colors, spacing, type, radius } from "../theme/theme";
import { actionPlan } from "../data/mockData";
import { getDocument, savePlan, registerPlan } from "../services/api";
import { createDocumentPlan, formatStepDate, formatDeadline, formatDuration, getDday, sortPlanSteps } from "../utils/preparationPlan";

// 첨부 화면의 색상은 이 화면에만 적용하고 앱 공통 디자인 토큰은 유지한다.
const planColors = {
  ink: "#181C43", accent: "#5B50D6", soft: "#F0EFFF", border: "#DAD6FF",
  green: "#50AE83", alert: "#E34B60", alertSoft: "#FCECF0",
};

export default function ActionPlanScreen({ navigation, route }) {
  const { documentId, view, analysis } = route?.params || {};
  const id = documentId || view?.id || analysis?.document_id;
  const preview = __DEV__ && process.env.EXPO_PUBLIC_PREVIEW_SCREEN === "action-plan" && !id;
  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError("");
    const load = async () => {
      if (preview) return { ...actionPlan, isMock: true, hasAnalysis: true, requiredDocs: [], revision: 0 };
      if (!id) return createDocumentPlan();
      const result = await getDocument(id);
      const base = createDocumentPlan(result);
      let saved = result.plan;
      if (!saved) {
        try { saved = (await savePlan(id, base.steps, 0)).plan; }
        catch (e) {
          if (e.status !== 409) throw e;
          saved = (await getDocument(id)).plan;
          if (!saved) throw e;
        }
      }
      return { ...base, steps: saved.steps, revision: saved.revision, registered: saved.registered };
    };
    load().then((plan) => { if (active) setResource(plan); })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, preview, reload]));

  if (loading || error || !resource) return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={[type.body, { marginVertical: spacing.lg }]}>{error || "저장된 준비 계획을 불러오는 중…"}</Text>
        {!!error && <PrimaryButton label="다시 불러오기" onPress={() => setReload((prev) => prev + 1)} />}
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" style={styles.backButton}
          onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace("Home")}>
          <Ionicons name="chevron-back" size={24} color={planColors.ink} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
  return <ActionPlanContent key={`${resource.id}:${resource.revision || 0}`} navigation={navigation}
    plan={resource} onReload={() => setReload((prev) => prev + 1)} />;
}

function ActionPlanContent({ navigation, plan, onReload }) {
  const [steps, setSteps] = useState(() => sortPlanSteps(plan.steps.map((step) => ({ ...step, done: step.isDeadline ? false : step.done }))));
  const [editorMode, setEditorMode] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(plan.revision || 0);
  const busy = useRef(false);
  const deadline = steps.find((step) => step.isDeadline);
  const preparationSteps = steps.filter((step) => !step.isDeadline);
  const completedCount = preparationSteps.filter((step) => step.done).length;

  const persist = async (nextSteps, register = false) => {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    setError("");
    const previous = steps;
    setSteps(nextSteps);
    try {
      if (!plan.isMock) {
        const result = await (register ? registerPlan : savePlan)(plan.id, nextSteps, revision.current);
        revision.current = result.plan.revision;
        setSteps(result.plan.steps);
      }
      return true;
    } catch (e) {
      setSteps(previous);
      setError(e.message);
      throw e;
    } finally { busy.current = false; setSaving(false); }
  };

  const toggleStep = async (id) => {
    if (busy.current) return;
    try { await persist(steps.map((step) => step.id === id && !step.isDeadline ? { ...step, done: !step.done } : step)); }
    catch (_) { /* persist가 오류와 이전 체크 상태를 화면에 반영한다. */ }
  };

  const saveStep = async (step) => {
    const normalizedStep = step.isDeadline ? { ...step, done: false } : step;
    const savedStep = step.id ? normalizedStep : { ...normalizedStep,
      id: `custom-step-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
    const next = sortPlanSteps(step.id ? steps.map((item) => item.id === step.id ? savedStep : item) : [...steps, savedStep]);
    if (await persist(next)) setEditorMode(null);
  };

  const register = async () => {
    if (plan.isMock) return setShowPreview(true);
    try {
      if (await persist(steps, true)) navigation.navigate("Management", { documentId: plan.id, documentTitle: plan.title });
    } catch (_) { /* 저장 실패 시 계획 화면에 머문다. */ }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.backRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" disabled={saving} hitSlop={8} onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace("Home")} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={planColors.ink} />
        </Pressable>
      </View>
      <View style={styles.heading}>
        <Text style={styles.title}>AI가 만든 준비 계획</Text>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => setEditorMode("edit")} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
          <Ionicons name="pencil-outline" size={16} color={planColors.accent} />
          <Text style={styles.editText}>수정하기</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Card style={styles.planCard}>
          <View style={styles.summary}>
            <Text style={styles.documentTitle}>{plan.title}</Text>
            <View style={styles.deadlineRow}>
              <View style={styles.deadlineInfo}>
                <Text style={styles.deadlineLabel}>최종 마감일</Text>
                <Text style={styles.deadlineValue}>{formatDeadline(deadline)}</Text>
              </View>
              <View style={styles.ddayBadge}>
                <Text style={styles.ddayText}>{getDday(deadline?.date, plan.referenceDate)}</Text>
              </View>
            </View>
            {plan.requiredDocs.length > 0 && <Text style={styles.requiredDocs}>필요 서류: {plan.requiredDocs.join(", ")}</Text>}
          </View>

          <View style={styles.timeline}>
            {!plan.hasAnalysis && <Text style={styles.emptyNote}>문서 분석 결과가 없습니다. 이전 화면에서 문서를 분석해 주세요.</Text>}
            {plan.hasAnalysis && !preparationSteps.length && <Text style={styles.emptyNote}>문서에서 확인된 할 일이 없습니다. 필요한 일정을 직접 추가해 주세요.</Text>}
            {steps.map((step, index) => (
              <View key={step.id} style={styles.stepRow}>
                <View style={styles.markerColumn}>
                  <View style={[styles.connector, index === steps.length - 1 && styles.lastConnector]} />
                  {step.isDeadline ? (
                    <View accessible accessibilityLabel={step.label === "최종 마감" ? "최종 마감 일정" : `${step.label} 최종 마감 일정`} style={[styles.marker, styles.deadlineMarker]}>
                      <Ionicons name="time-outline" size={16} color={colors.surface} />
                    </View>
                  ) : <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${step.label} 완료`}
                    aria-checked={step.done}
                    disabled={saving}
                    hitSlop={8}
                    onPress={() => toggleStep(step.id)}
                    style={[styles.marker, step.done ? styles.completedMarker : styles.pendingMarker]}
                  >
                    {step.done && <Ionicons name="checkmark" size={18} color={colors.surface} />}
                  </Pressable>}
                  {index < steps.length - 1 && <View style={styles.connectorDot} />}
                </View>
                <View style={styles.stepBody}>
                  <Text style={[styles.stepDate, step.isDeadline && styles.deadlineDate]}>{formatStepDate(step.date)}</Text>
                  <Text style={styles.stepTitle}>{step.label}</Text>
                  {step.durationMinutes != null && <Text style={styles.stepDetail}>예상 소요시간 {formatDuration(step.durationMinutes)}</Text>}
                  {!!step.notes && <Text style={styles.stepDetail}>{step.notes}</Text>}
                  {!!step.time && <Text style={[styles.stepDetail, step.isDeadline && styles.deadlineTime]}>{step.isDeadline ? "마감 " : "예정 "}{step.time}</Text>}
                </View>
              </View>
            ))}
          </View>

          <Pressable accessibilityRole="button" disabled={saving} onPress={() => setEditorMode("add")} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <Ionicons name="add" size={18} color={planColors.accent} />
            <Text style={styles.addText}>일정 추가하기</Text>
          </Pressable>
        </Card>

        {!!error && <View>
          <Text accessibilityRole="alert" style={[type.small, { color: colors.alert, marginTop: spacing.md }]}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={onReload}><Text style={styles.editText}>다시 불러오기</Text></Pressable>
        </View>}
        <PrimaryButton label={saving ? "저장 중…" : "이대로 등록하기"} disabled={saving || !plan.hasAnalysis}
          onPress={register} style={styles.registerButton} />
        <Text style={styles.mockNote}>{plan.isMock ? "예시 계획 · 편집 내용은 이 화면에서만 유지됩니다." : "문서 분석 결과 · 날짜와 소요시간은 직접 지정해 주세요.\n수정한 준비 계획은 자동 저장됩니다."}</Text>
      </ScrollView>

      {editorMode && <PlanEditorModal mode={editorMode} steps={steps} allowUndated={!plan.isMock} onSave={saveStep} onClose={() => setEditorMode(null)} />}

      <Modal visible={showPreview} transparent animationType="fade" onRequestClose={() => setShowPreview(false)}>
        <SafeAreaView style={styles.previewOverlay}>
          <Card style={styles.previewCard}>
            <Text style={styles.previewTitle}>등록 미리보기</Text>
            <Text style={styles.previewDescription}>{plan.title}{"\n"}{formatDeadline(deadline)} · 준비 일정 {completedCount}/{preparationSteps.length} 완료</Text>
            {plan.requiredDocs.length > 0 && <Text style={styles.previewNote}>필요 서류: {plan.requiredDocs.join(", ")}</Text>}
            <ScrollView style={styles.previewList}>
              {steps.map((step) => (
                <View key={step.id} style={styles.previewRow}>
                  <Ionicons name={step.isDeadline ? "time-outline" : step.done ? "checkmark-circle" : "ellipse-outline"} size={20} color={step.isDeadline ? planColors.alert : step.done ? planColors.green : colors.muted} />
                  <View style={styles.previewItem}>
                    <Text style={type.bodyStrong}>{step.label}</Text>
                    <Text style={type.small}>{formatStepDate(step.date)}{step.time ? ` ${step.time}` : ""}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            <Text style={styles.previewNote}>{plan.isMock ? "목업" : "등록 전"} 미리보기입니다. 실제 할 일·캘린더 저장은 아직 연결되지 않았습니다.</Text>
            <PrimaryButton label="확인" onPress={() => setShowPreview(false)} style={styles.previewButton} />
          </Card>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  backRow: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  backButton: { width: 44, height: 36, justifyContent: "center" },
  heading: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  title: { ...type.h1, color: planColors.ink, flex: 1, fontSize: 19 },
  editButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, borderWidth: 1, borderColor: planColors.border, borderRadius: radius.sm, paddingHorizontal: spacing.sm, minHeight: 34 },
  editText: { fontSize: 12, fontWeight: "700", color: planColors.accent },
  pressed: { opacity: 0.65 },
  container: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  planCard: { padding: 0, borderColor: "#EFF0F6", overflow: "hidden" },
  summary: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: "#EFF0F6" },
  documentTitle: { ...type.h2, color: planColors.ink, marginBottom: spacing.md },
  deadlineRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  deadlineInfo: { flex: 1, gap: spacing.xs },
  deadlineLabel: { ...type.small, fontWeight: "600" },
  deadlineValue: { ...type.bodyStrong, color: planColors.ink, lineHeight: 21 },
  requiredDocs: { ...type.small, lineHeight: 19, marginTop: spacing.md },
  emptyNote: { ...type.small, lineHeight: 19, paddingVertical: spacing.lg },
  ddayBadge: { backgroundColor: planColors.alertSoft, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md },
  ddayText: { fontSize: 18, fontWeight: "700", color: planColors.alert },
  timeline: { paddingHorizontal: spacing.lg },
  stepRow: { flexDirection: "row", minHeight: 100 },
  markerColumn: { width: 26, alignItems: "center" },
  connector: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "#E9EBF4" },
  lastConnector: { height: 45, bottom: undefined },
  marker: { marginTop: 29, width: 24, height: 24, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  completedMarker: { backgroundColor: planColors.green },
  deadlineMarker: { backgroundColor: planColors.alert },
  pendingMarker: { backgroundColor: colors.surface, borderWidth: 2, borderColor: "#8C94B4", borderRadius: radius.sm },
  connectorDot: { position: "absolute", bottom: 0, width: 3, height: 4, borderRadius: radius.pill, backgroundColor: "#929CC4" },
  stepBody: { flex: 1, paddingLeft: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.xs },
  stepDate: { ...type.bodyStrong, color: planColors.ink, lineHeight: 21 },
  stepTitle: { ...type.bodyStrong, color: planColors.ink, lineHeight: 21, fontWeight: "700" },
  stepDetail: { ...type.small, lineHeight: 19, fontWeight: "500" },
  deadlineDate: { color: "#B33981" },
  deadlineTime: { color: "#E46241", fontWeight: "700", fontSize: 13 },
  addButton: { margin: spacing.lg, marginTop: spacing.sm, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: spacing.xs, minHeight: 50, backgroundColor: planColors.soft, borderWidth: 1, borderColor: "#E9E6FF", borderRadius: radius.md },
  addText: { ...type.bodyStrong, color: planColors.accent },
  registerButton: { backgroundColor: planColors.accent, minHeight: 52, justifyContent: "center", marginTop: spacing.lg },
  mockNote: { ...type.small, fontSize: 10, textAlign: "center", marginTop: spacing.sm, lineHeight: 16 },
  previewOverlay: { flex: 1, justifyContent: "center", backgroundColor: "rgba(20, 24, 48, 0.35)", padding: spacing.xl },
  previewCard: { width: "100%", maxWidth: 480, maxHeight: "100%", alignSelf: "center" },
  previewTitle: { ...type.h1, color: planColors.ink },
  previewDescription: { ...type.body, color: colors.muted, marginVertical: spacing.md },
  previewList: { flexShrink: 1 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: 1, borderTopColor: colors.line },
  previewItem: { flex: 1, gap: spacing.xs },
  previewNote: { ...type.small, lineHeight: 18, marginVertical: spacing.lg },
  previewButton: { backgroundColor: planColors.accent },
});
