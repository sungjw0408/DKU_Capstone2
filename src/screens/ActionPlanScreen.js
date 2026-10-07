// 담당자 3 (AI 행동 계획 / 검증→계획 흐름) 소유
// 준비 계획 API 연결 전까지 목업으로 UI·편집·추가·완료 체크를 확인한다.
import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Modal,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Card from "../components/Card";
import PrimaryButton from "../components/PrimaryButton";
import PlanEditorModal from "../components/PlanEditorModal";
import { colors, spacing, type, radius } from "../theme/theme";
import { actionPlan } from "../data/mockData";
import { formatStepDate, formatDeadline, formatDuration, getDday, sortPlanSteps } from "../utils/preparationPlan";

import { db } from "../services/firebase";
import {
  doc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

import { saveTodosForDocument } from "../services/todoService";


// 첨부 화면의 색상은 이 화면에만 적용하고 앱 공통 디자인 토큰은 유지한다.
const planColors = {
  ink: "#181C43", accent: "#5B50D6", soft: "#F0EFFF", border: "#DAD6FF",
  green: "#50AE83", alert: "#E34B60", alertSoft: "#FCECF0",
};

export default function ActionPlanScreen({ navigation, route }) {
  const params = route.params ?? {};

  const documentId = params.documentId;

  const documentTitle =
    params.view?.title ??
    params.analysis?.title ??
    actionPlan.title;

  const [steps, setSteps] = useState(() => sortPlanSteps(actionPlan.steps.map((step) => ({ ...step, done: step.isDeadline ? false : step.done }))));
  const [editorMode, setEditorMode] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const nextId = useRef(1);
  const deadline = steps.find((step) => step.isDeadline);
  const preparationSteps = steps.filter((step) => !step.isDeadline);
  const completedCount = preparationSteps.filter((step) => step.done).length;

  const toggleStep = (id) => {
    setSteps((prev) => prev.map((step) => step.id === id && !step.isDeadline ? { ...step, done: !step.done } : step));
  };

  const saveStep = (step) => {
    const normalizedStep = step.isDeadline ? { ...step, done: false } : step;
    const savedStep = step.id ? normalizedStep : { ...normalizedStep, id: `custom-step-${nextId.current++}` };
    setSteps((prev) => sortPlanSteps(step.id
      ? prev.map((item) => item.id === step.id ? savedStep : item)
      : [...prev, savedStep]));
    setEditorMode(null);
  };

    const handleRegister = async () => {
      if (!documentId) {
        Alert.alert(
          "등록 실패",
          "원본 문서 ID를 찾을 수 없습니다."
        );
        return;
      }

      try {
        const batch = writeBatch(db);

        const todoSteps = steps.filter(
          (step) => !step.isDeadline
        );

        todoSteps.forEach((step, index) => {
          const todoRef = doc(
            db,
            "todos",
            `${documentId}_${step.id}`
          );

          batch.set(todoRef, {
            document_id: documentId,
            doc_title: documentTitle,
            title: step.label,
            date: step.date ?? null,
            time: step.time ?? null,
            is_completed: step.done ?? false,
            order: index,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
          });
        });

        await batch.commit();

        setShowPreview(false);

        navigation.navigate("Management", {documentId, documentTitle,});
        
      } catch (error) {
        console.error("Todo 등록 실패:", error);

        Alert.alert(
          "등록 실패",
          "할 일을 저장하지 못했습니다."
        );
      }
    };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.backRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" hitSlop={8} onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.replace("Home")} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={planColors.ink} />
        </Pressable>
      </View>
      <View style={styles.heading}>
        <Text style={styles.title}>AI가 만든 준비 계획</Text>
        <Pressable accessibilityRole="button" onPress={() => setEditorMode("edit")} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
          <Ionicons name="pencil-outline" size={16} color={planColors.accent} />
          <Text style={styles.editText}>수정하기</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        <Card style={styles.planCard}>
          <View style={styles.summary}>
            <Text style={styles.documentTitle}>{documentTitle}</Text>
            <View style={styles.deadlineRow}>
              <View style={styles.deadlineInfo}>
                <Text style={styles.deadlineLabel}>최종 마감일</Text>
                <Text style={styles.deadlineValue}>{formatDeadline(deadline)}</Text>
              </View>
              <View style={styles.ddayBadge}>
                <Text style={styles.ddayText}>{getDday(deadline?.date, actionPlan.referenceDate)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.timeline}>
            {steps.map((step, index) => (
              <View key={step.id} style={styles.stepRow}>
                <View style={styles.markerColumn}>
                  <View style={[styles.connector, index === steps.length - 1 && styles.lastConnector]} />
                  {step.isDeadline ? (
                    <View accessible accessibilityLabel={`${step.label} 최종 마감 일정`} style={[styles.marker, styles.deadlineMarker]}>
                      <Ionicons name="time-outline" size={16} color={colors.surface} />
                    </View>
                  ) : <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${step.label} 완료`}
                    aria-checked={step.done}
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

          <Pressable accessibilityRole="button" onPress={() => setEditorMode("add")} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <Ionicons name="add" size={18} color={planColors.accent} />
            <Text style={styles.addText}>일정 추가하기</Text>
          </Pressable>
        </Card>

        <PrimaryButton label="이대로 등록하기" onPress={() => setShowPreview(true)} style={styles.registerButton} />
        <Text style={styles.mockNote}>예시 계획 · 편집 내용은 이 화면에서만 유지됩니다.</Text>
      </ScrollView>

      {editorMode && <PlanEditorModal mode={editorMode} steps={steps} onSave={saveStep} onClose={() => setEditorMode(null)} />}

      <Modal visible={showPreview} transparent animationType="fade" onRequestClose={() => setShowPreview(false)}>
        <SafeAreaView style={styles.previewOverlay}>
          <Card style={styles.previewCard}>
            <Text style={styles.previewTitle}>등록 미리보기</Text>
            <Text style={styles.previewDescription}> {documentTitle}{"\n"} {formatDeadline(deadline)} 마감 · 준비 일정 {completedCount}/{preparationSteps.length} 완료 </Text>
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
            <Text style={styles.previewNote}> 등록하면 준비 일정이 할 일 목록에 저장됩니다. </Text>
            <PrimaryButton label="등록하기" onPress={handleRegister} style={styles.previewButton} />
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
