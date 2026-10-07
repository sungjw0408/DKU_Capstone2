import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, TextInput, Alert, Platform,
  KeyboardAvoidingView, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import PrimaryButton from "../components/PrimaryButton";
import { colors, spacing, type, radius } from "../theme/theme";
import { analyzeFile, analyzeText, retryDocument, listDocuments } from "../services/api";

const INPUT_METHODS = [
  { id: "camera", label: "사진 촬영", desc: "공지문을 바로 찍어서 추가해요",
    icon: "camera", color: colors.stamp, bg: colors.stampSoft },
  { id: "library", label: "앨범에서 선택", desc: "저장해 둔 캡처나 사진을 골라요",
    icon: "images", color: colors.green, bg: colors.greenSoft },
  { id: "pdf", label: "PDF 업로드", desc: "공지 PDF 파일을 올려요",
    icon: "document-text", color: colors.alert, bg: colors.alertSoft },
  { id: "text", label: "텍스트 붙여넣기", desc: "복사한 공지 내용을 붙여넣어요",
    icon: "clipboard", color: colors.gold, bg: colors.goldSoft },
  { id: "link", label: "링크 붙여넣기", icon: "link", soon: true },
  { id: "email", label: "이메일 전달", icon: "mail", soon: true },
];

// 백엔드 파이프라인 단계에 맞춘 로딩 문구 (실제 진행률이 아니라 대기 중 안내용)
const STAGES = ["문서를 읽고 있어요…", "해야 할 일을 찾고 있어요…", "원문과 한 줄씩 대조하고 있어요…"];
const SAMPLE_NOTICE = `2026학년도 2학기 SW인재 장학금 신청 안내

본교 재학생을 대상으로 2026학년도 SW인재 장학금 신청을 아래와 같이 안내합니다.

1. 신청 대상
- 2026학년도 재학생
- 직전 학기 평균 평점 3.5 이상인 자

2. 신청 기간: 2026년 9월 15일(화) ~ 9월 25일(금) 17:00까지
3. 제출 서류: 신청서, 성적증명서, 통장 사본
4. 제출 방법: 학생포털 > 장학 > 온라인 신청 후 서류 업로드
5. 선발 결과 발표: 2026년 10월 2일(금) 학생포털 공지

문의: 장학팀 031-8005-1234`;

function showError(message) {
  if (Platform.OS === "web") window.alert(message);
  else Alert.alert("분석하지 못했어요", message);
}

function MethodRow({ m, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, m.soon && styles.rowSoon, pressed && styles.rowPressed]}
    >
      <View style={[styles.iconBox, { backgroundColor: m.soon ? colors.line : m.bg }]}>
        <Ionicons name={m.icon} size={22} color={m.soon ? colors.muted : m.color} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, m.soon && { color: colors.muted }]}>{m.label}</Text>
        <Text style={styles.rowDesc}>{m.soon ? "준비 중이에요" : m.desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

export default function DocumentAddScreen({ navigation }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [stage, setStage] = useState(0);
  const [textMode, setTextMode] = useState(false);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [pendingDocumentId, setPendingDocumentId] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);

  useFocusEffect(useCallback(() => {
    let active = true;
    // 새로고침·서버 재시작 뒤에도 분석 실패 문서를 재업로드 없이 다시 시도한다.
    listDocuments().then((documents) => {
      const pending = documents.find((document) => document.status === "analysis_failed");
      if (active && pending) setPendingDocumentId((current) => current || pending.id);
    }).catch(() => { /* 일반 업로드는 그대로 사용할 수 있다. */ });
    return () => { active = false; };
  }, []));

  const run = async (task, preview) => {
    setAnalyzing(true);
    setStage(0);
    timer.current = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 2500);
    try {
      const { documentId, view, analysis, sourceKind } = await task();
      setPendingDocumentId(null);
      setTextMode(false);
      setText("");
      navigation.navigate("AIAnalysis", { documentId, view, analysis, preview: { ...preview, kind: sourceKind || preview?.kind } });
    } catch (e) {
      setPendingDocumentId(e.documentId || null);
      showError(e.message);
    } finally {
      clearInterval(timer.current);
      setAnalyzing(false);
    }
  };

  const pickCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return showError("카메라 권한이 필요해요. 설정에서 허용해 주세요.");
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!r.canceled) run(() => analyzeFile(r.assets[0]), { kind: "image", uri: r.assets[0].uri });
  };

  const pickLibrary = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!r.canceled) run(() => analyzeFile(r.assets[0]), { kind: "image", uri: r.assets[0].uri });
  };

  const pickPdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (!r.canceled) run(() => analyzeFile(r.assets[0]), { kind: "pdf", name: r.assets[0].name });
  };

  const handlePick = (m) => {
    if (m.soon) return showError(`${m.label}는 준비 중이에요. 지금은 사진·PDF·텍스트로 추가해 주세요.`);
    if (m.id === "camera") return pickCamera();
    if (m.id === "library") return pickLibrary();
    if (m.id === "pdf") return pickPdf();
    if (m.id === "text") return setTextMode(true);
  };

  if (analyzing) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator size="large" color={colors.stamp} />
        <Text style={styles.analyzingText}>{STAGES[stage]}</Text>
      </SafeAreaView>
    );
  }

    if (textMode) {
    const len = text.trim().length;
    const ready = len >= 10;
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            {/* 상단: 아이콘 + 제목 */}
            <View style={styles.textHeader}>
              <View style={[styles.iconBox, { backgroundColor: colors.goldSoft }]}>
                <Ionicons name="clipboard" size={22} color={colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.textTitle}>텍스트 붙여넣기</Text>
                <Text style={styles.rowDesc}>공지문을 복사해서 그대로 붙여넣어 주세요</Text>
              </View>
            </View>

            {/* 입력 카드 */}
            <View style={[styles.inputCard, focused && styles.inputCardFocused]}>
              <TextInput
                style={styles.input}
                multiline
                value={text}
                onChangeText={setText}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="여기에 공지 내용을 붙여넣으세요"
                placeholderTextColor={colors.muted}
                textAlignVertical="top"
              />
              <View style={styles.inputFooter}>
                {text.length > 0 ? (
                  <Pressable onPress={() => setText("")} hitSlop={8} style={styles.inlineBtn}>
                    <Ionicons name="close-circle" size={16} color={colors.muted} />
                    <Text style={styles.inlineBtnText}>지우기</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => setText(SAMPLE_NOTICE)} hitSlop={8} style={styles.inlineBtn}>
                    <Ionicons name="sparkles" size={16} color={colors.stamp} />
                    <Text style={[styles.inlineBtnText, { color: colors.stamp }]}>예시 공지로 채우기</Text>
                  </Pressable>
                )}
                <Text style={styles.counter}>{len}자</Text>
              </View>
            </View>

            {/* 도움말 */}
            <View style={styles.tipBox}>
              <Ionicons name="bulb" size={16} color={colors.stamp} />
              <Text style={styles.tipText}>
                신청 기간 · 제출 서류 · 제출 방법이 들어 있으면 더 정확하게 분석해요.
              </Text>
            </View>

            <PrimaryButton
              label={ready ? "분석하기" : "10자 이상 입력해 주세요"}
              tone="stamp"
              disabled={!ready}
              onPress={() => run(() => analyzeText(text), { kind: "text" })}
            />
            {pendingDocumentId && <PrimaryButton label="저장된 원문으로 다시 분석" tone="stamp"
              style={{ marginTop: spacing.sm }}
              onPress={() => run(() => retryDocument(pendingDocumentId), { kind: "text" })} />}
            <Pressable onPress={() => setTextMode(false)} style={styles.backLink} hitSlop={8}>
              <Text style={styles.backLinkText}>다른 방법으로 추가하기</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={type.h1}>문서 추가하기</Text>
        <Text style={styles.subtitle}>다양한 방법으로 문서를 공유할 수 있어요</Text>
        {pendingDocumentId && <View style={{ marginBottom: spacing.lg }}>
          <PrimaryButton label="저장된 원문으로 다시 분석" tone="stamp"
            onPress={() => run(() => retryDocument(pendingDocumentId), { kind: "text" })} />
        </View>}

        <View style={styles.list}>
          {INPUT_METHODS.filter((m) => !m.soon).map((m) => (
            <MethodRow key={m.id} m={m} onPress={() => handlePick(m)} />
          ))}
        </View>

        <Text style={styles.groupTitle}>다른 방법으로 추가하기</Text>
        <View style={styles.list}>
          {INPUT_METHODS.filter((m) => m.soon).map((m) => (
            <MethodRow key={m.id} m={m} onPress={() => handlePick(m)} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  center: { alignItems: "center", justifyContent: "center" },
  container: { padding: spacing.lg },
  subtitle: { ...type.body, color: colors.muted, marginTop: 4, marginBottom: spacing.xl },
  list: { gap: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: "#1F2E2B",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  rowSoon: { backgroundColor: colors.paper, shadowOpacity: 0, elevation: 0 },
  rowPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 16, fontWeight: "700", color: colors.ink },
  rowDesc: { fontSize: 13, color: "#5B6475" },
  groupTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  analyzingText: { ...type.body, marginTop: spacing.md, color: colors.muted },
  textHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
  textTitle: { fontSize: 20, fontWeight: "800", color: colors.ink, letterSpacing: -0.3 },
  inputCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: "#1F2E2B",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  inputCardFocused: { borderColor: colors.stamp },
  input: { fontSize: 15, lineHeight: 22, color: colors.ink, minHeight: 240, padding: 0 },
  inputFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },
  inlineBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  inlineBtnText: { fontSize: 13, fontWeight: "600", color: colors.muted },
  counter: { fontSize: 12, color: colors.muted },
  tipBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.stampSoft,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  tipText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.ink },
  backLink: { alignItems: "center", paddingVertical: spacing.md },
  backLinkText: { fontSize: 14, fontWeight: "600", color: colors.muted, textDecorationLine: "underline" },
});
