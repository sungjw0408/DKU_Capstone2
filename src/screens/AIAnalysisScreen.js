import React, { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Text } from "../components/Typography";
import { Alert, Linking, Platform, View, ScrollView, StyleSheet, Image, Pressable } from "react-native";
import ScreenSurface from "../components/ScreenSurface";
import { Ionicons } from "@expo/vector-icons";
import Card from "../components/Card";
import Badge from "../components/Badge";
import NoticeAffiliation from "../components/NoticeAffiliation";
import { colors, evidenceReviewColors, pageContent, spacing, type, radius } from "../theme/theme";
import { analysisDetail as mockDetail } from "../data/mockData";
import { getDocument } from "../services/api";
import { splitAnalysisItems } from "../utils/evidenceReview";
import { useAuth } from "../contexts/AuthContext";
import { hasNoticeEligibility } from "../utils/noticeEligibility";
import { contactEmails, gmailComposeUrl, signedInWithGoogle } from "../utils/noticeMail";

function Thumbnail({ preview }) {
  if (preview?.kind === "image" && preview.uri) {
    return <Image source={{ uri: preview.uri }} style={styles.thumb} resizeMode="cover" />;
  }
  const isPdf = preview?.kind === "pdf";
  return (
    <View style={[styles.thumb, styles.thumbPlaceholder]}>
      <Ionicons name={isPdf ? "document-text-outline" : "reader-outline"} size={26} color={colors.muted} />
      <Text style={styles.thumbLabel}>{isPdf ? "PDF" : "텍스트"}</Text>
    </View>
  );
}

function parseDeadline(iso) {
  if (!iso) return null;
  const [datePart, timePart] = iso.split("T");
  const [y, m, day] = datePart.split("-").map(Number);
  const [hh, mm] = timePart ? timePart.split(":").map(Number) : [23, 59];
  return { date: new Date(y, m - 1, day, hh, mm), hasTime: !!timePart };
}

function ddayInfo(iso) {
  const parsed = parseDeadline(iso);
  if (!parsed) return null;
  const due = parsed.date;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const days = Math.round((dueDay - today) / 86400000);

  const weekday = "일월화수목금토"[due.getDay()];
  const time = parsed.hasTime
    ? ` ${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`
    : "";
  const dateText = `${due.getMonth() + 1}월 ${due.getDate()}일(${weekday})${time} 마감`;

  if (due < now) return { label: "마감 지남", fg: "#fff", badge: colors.muted, bg: "#EEF0F3", dateText };
  if (days === 0) return { label: "오늘 마감", fg: "#fff", badge: colors.alert, bg: colors.alertSoft, dateText };
  if (days <= 3) return { label: `D-${days}`, fg: "#fff", badge: colors.alert, bg: colors.alertSoft, dateText };
  if (days <= 7) return { label: `D-${days}`, fg: "#3D2A00", badge: "#F5A524", bg: "#FFF6DC", dateText };
  return { label: `D-${days}`, fg: "#fff", badge: colors.stamp, bg: colors.stampSoft, dateText };
}

function chipTone(pct) {
  if (pct >= 90) return { bg: colors.greenSoft, fg: colors.green };
  if (pct >= 80) return { bg: colors.stampSoft, fg: colors.stamp };
  if (pct >= 60) return { bg: colors.goldSoft, fg: colors.gold };
  return { bg: colors.alertSoft, fg: colors.alert };
}

function ConfidenceChip({ pct }) {
  if (pct == null || pct >= 90) return null;   // ← 90% 이상이면 칩을 숨김
  const tone = chipTone(pct);
  return (
    <View style={[styles.chip, { backgroundColor: tone.bg }]}>
      <Text style={[styles.chipText, { color: tone.fg }]}>
        {pct < 80 ? "확인 필요" : "신뢰도"} {pct}%   {/* ← 80 미만이면 "확인 필요" */}
      </Text>
    </View>
  );
}

const SECTION_ICONS = {
  criteria: "person",
  exclusions: "person-remove",
  period: "calendar",
  documents: "document-text",
  method: "send",
  announcement: "megaphone",
  event: "people",
  benefit: "gift",
  contact: "call",
  confirmed: "checkmark-circle",
};

function SectionRow({ section, isLast, onCompose }) {
  const multi = section.items.length > 1;
  const usedAddresses = new Set();
  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <View style={styles.rowHeader}>
        <View style={styles.rowTitleWrap}>
          <View style={styles.sectionIcon}>
            <Ionicons name={SECTION_ICONS[section.key] ?? "ellipse"} size={13} color={colors.stamp} />
          </View>
          <Text style={styles.rowTitle}>{section.title}</Text>
        </View>
        <ConfidenceChip pct={section.confidence} />
      </View>
      {section.items.map((it, i) => {
        const addresses = onCompose ? contactEmails(it).filter((address) => !usedAddresses.has(address.toLowerCase())) : [];
        addresses.forEach((address) => usedAddresses.add(address.toLowerCase()));
        return (
          <View key={it.fieldId ?? i} style={styles.itemLine}>
            {multi && <View style={styles.bulletDot} />}
            <View style={styles.itemContent}>
              {addresses.length > 0 ? (
                <View style={styles.contactLine}>
                  <Text style={styles.itemText}>{it.text}</Text>
                  {addresses.map((address) => (
                    <Pressable key={address} accessibilityRole="button" accessibilityLabel={`${address}에 Gmail로 메일 쓰기`}
                      onPress={() => onCompose(address)} hitSlop={6} style={styles.mailLink}>
                      <Ionicons name="mail-outline" size={15} color={colors.stamp} />
                      <Text style={[type.small, { color: colors.stamp }]}>{addresses.length === 1 ? "메일 쓰기" : `${address}에 메일 쓰기`}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : <Text style={styles.itemText}>{it.text}</Text>}
              {it.status === "user_confirmed" && <Badge label="사용자가 직접 확인한 문항" tone="green" />}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// 목업(mockData)에는 sections가 없어서 비슷한 모양으로 만들기
function legacySections(d) {
  const sec = (key, title, items) =>
    items.length
      ? { key, title, items, confidence: Math.min(...items.map((i) => i.confidence ?? 100)) }
      : null;
  return [
    sec("criteria", "신청 대상", d.applicantCriteria.map((c) => ({ text: c.text, confidence: c.confidence }))),
    d.deadline ? sec("period", "신청 마감", [{ text: d.deadline.text, confidence: d.deadline.confidence }]) : null,
    sec("documents", "필요 서류", d.requiredDocs.map((t) => ({ text: t }))),
  ].filter(Boolean);
}

export default function AIAnalysisScreen({ navigation, route }) {
  const { user } = useAuth();
  const [googleSession, setGoogleSession] = useState(null);
  const initialParams = route.params ?? {};
  const documentId = initialParams.documentId;
  const [refreshed, setRefreshed] = useState(null);
  const [refreshError, setRefreshError] = useState("");
  const [reload, setReload] = useState(0);

  // 원문 확인에서 항목을 수정·제외하고 돌아오면 저장된 결과를 다시 보여준다.
  useFocusEffect(useCallback(() => {
    if (!documentId) return;
    let active = true;
    setRefreshError("");
    getDocument(documentId)
      .then((result) => { if (active) setRefreshed(result); })
      .catch((e) => { if (active) setRefreshError(e.message); });
    return () => { active = false; };
  }, [documentId, reload]));

  const params = refreshed?.documentId === documentId ? { ...initialParams, ...refreshed } : initialParams;
  const d = params.view ?? mockDetail;
  const warnings = d.warnings ?? [];
  const isMock = !params.view;
  const summary = d.summary ?? `${d.docType}로 판단했어요.`;
  const tags = d.tags ?? [d.docType];
  const fields = params.analysis?.fields ?? [];
  const { reviewFields, normalSections } = splitAnalysisItems(
    d.sections ?? legacySections(d), fields
  );
  const hasIssues = reviewFields.length > 0;
  const hasUserConfirmed = normalSections.some((section) => section.items.some((item) => item.status === "user_confirmed"));
  const showAffiliation = !isMock && hasNoticeEligibility(fields);
  const hasContactEmail = normalSections.some((section) => section.key === "contact"
    && section.items.some((item) => contactEmails(item).length > 0));
  useEffect(() => {
    if (!hasContactEmail) return;
    let active = true;
    signedInWithGoogle(user).then((allowed) => {
      if (active) setGoogleSession(allowed ? user : null);
    }).catch(() => { if (active) setGoogleSession(null); });
    return () => { active = false; };
  }, [user, hasContactEmail]);

  const composeMail = (address) => {
    const url = gmailComposeUrl(address, d.title ?? d.docType ?? "공지 문의");
    if (Platform.OS === "web") window.open(url, "_blank", "noopener,noreferrer");
    else Linking.openURL(url).catch(() => Alert.alert("Gmail을 열지 못했어요", "잠시 후 다시 시도해 주세요."));
  };

  // 나머지 경고 (경고 띠와 겹치는 문구는 뺌)
  const dday = ddayInfo(d.deadline?.datetime);
  const notes = warnings.filter(
    (w) => !w.includes("근거를 찾지 못한") && !(dday && w.includes("이미 지났습니다"))
      && !(d.deadline && w.includes("마감일을 찾지 못했습니다"))
  );
  const next = { documentId: params.documentId, view: params.view, analysis: params.analysis };
  const openEvidence = (focusFieldId) => navigation.push("EvidenceCheck", {
    ...next, focusFieldId, planRegistered: !!params.plan?.registered,
  });

  return (
    <ScreenSurface style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container}>
        {!!refreshError && <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          <Text accessibilityRole="alert" style={[type.small, { color: colors.alert }]}>{refreshError}</Text>
          <Pressable accessibilityRole="button" onPress={() => setReload((value) => value + 1)}>
            <Text style={[type.bodyStrong, { color: colors.stamp }]}>최신 분석 결과 다시 불러오기</Text>
          </Pressable>
        </View>}
        <View style={styles.header}>
          <View style={styles.donePill}>
            <Ionicons name="checkmark-circle" size={14} color={colors.green} />
            <Text style={styles.doneText}>{isMock ? "예시 데이터" : "분석 완료"}</Text>
          </View>
          <Text style={styles.summaryText}>{summary}</Text>
        </View>
        <Card style={styles.docCardOuter}>
          <View style={styles.docCard}>
            <View style={styles.docInfo}>
              <Text style={styles.docTitle} numberOfLines={3}>
                {d.title ?? d.docType}
              </Text>
              <View style={styles.tagRow}>
                {tags.map((t) => (
                  <Badge key={t} label={t} tone="stamp" />
                ))}
              </View>
            </View>
            <Thumbnail preview={params.preview} />
          </View>

          {/* D-day 띠 */}
          {dday && (
            <View style={[styles.ddayBand, { backgroundColor: dday.bg }]}>
              <View style={[styles.ddayBadge, { backgroundColor: dday.badge }]}>
                <Text style={[styles.ddayBadgeText, { color: dday.fg }]}>{dday.label}</Text>
              </View>
              <Text style={styles.ddayDate}>{dday.dateText}</Text>
            </View>
          )}
        </Card>

        {hasIssues && (
          <View style={styles.reviewGroup}>
            <Pressable accessibilityRole="button"
              style={({ pressed }) => [styles.issueBand, pressed && styles.btnPressed]}
              onPress={() => openEvidence(reviewFields[0].id)}>
              <Ionicons name="alert-circle" size={18} color={evidenceReviewColors.ink} />
              <Text style={styles.issueText}>확인이 필요한 항목 {reviewFields.length}개</Text>
              <Text style={styles.issueLink}>원문 보기</Text>
              <Ionicons name="chevron-forward" size={14} color={evidenceReviewColors.ink} />
            </Pressable>
            {reviewFields.map((field) => (
              <Pressable key={field.id} accessibilityRole="button"
                accessibilityHint="해당 항목의 원문 근거를 열어요"
                style={({ pressed }) => [styles.reviewItem, pressed && styles.btnPressed]}
                onPress={() => openEvidence(field.id)}>
                <View style={styles.reviewItemBody}>
                  <Text style={styles.reviewLabel}>{field.label} · {field.status === "unverified" ? "근거 없음" : "확인 필요"}</Text>
                  <Text style={styles.reviewValue}>{field.value}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={evidenceReviewColors.ink} />
              </Pressable>
            ))}
          </View>
        )}
        {notes.map((w, i) => (
          <View key={i} style={styles.noteLine}>
            <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
            <Text style={styles.noteText}>{w}</Text>
          </View>
        ))}
        {params.analysis && normalSections.length > 0 && (
          <View style={styles.noteLine}>
            <Ionicons name="shield-checkmark" size={14} color={colors.stamp} />
            <Text style={[styles.noteText, { color: colors.stamp, fontWeight: "600" }]}>
              {hasUserConfirmed ? "직접 확인한 문항에는 별도 표시가 있어요"
                : hasIssues ? "표시가 없는 항목은 원문에서 확인했어요" : "모든 항목을 원문에서 확인했어요"}
            </Text>
          </View>
        )}

        {(showAffiliation || !hasIssues || normalSections.length > 0) && (
          <Card style={styles.sectionsCard}>
            {showAffiliation && <NoticeAffiliation fields={fields} style={[styles.row, normalSections.length > 0 && styles.rowDivider]} />}
            {!hasIssues && normalSections.length === 0 && (
              <Text style={styles.itemText}>추출된 정보가 없어요. 원문을 확인해 주세요.</Text>
            )}
            {normalSections.map((s, i) => (
              <SectionRow key={s.key} section={s} isLast={i === normalSections.length - 1}
                onCompose={s.key === "contact" && user && googleSession === user ? composeMail : undefined} />
            ))}
          </Card>
        )}

        <Pressable
          style={({ pressed }) => [styles.outlineBtn, pressed && styles.btnPressed]}
          onPress={() => openEvidence()}
        >
          <Ionicons name="document-text-outline" size={18} color={colors.stamp} />
          <Text style={styles.outlineBtnText}>원문 근거 보기</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.fillBtn, pressed && styles.btnPressed]}
          onPress={() => navigation.navigate("ActionPlan", next)}
        >
          <Text style={styles.fillBtnText}>{params.plan?.registered ? "준비 계획 확인·수정" : "AI 계획 만들기"}</Text>
        </Pressable>
      </ScrollView>
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: { width: "100%", maxWidth: 1120, alignSelf: "center", alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm },
  donePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.greenSoft,
    paddingHorizontal: spacing.sm,
    height: 24,
    borderRadius: radius.pill,
  },
  doneText: { fontSize: 13, lineHeight: 17, fontWeight: "700", color: colors.green, includeFontPadding: false },
  summaryText: { fontSize: 15, fontWeight: "500", color: colors.muted },
  docTitle: { fontSize: 18, fontWeight: "700", color: colors.ink, lineHeight: 25, letterSpacing: -0.3 },
  docCardOuter: {
    padding: 0,
    marginTop: spacing.sm,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  docCard: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, padding: spacing.md },
  docInfo: { flex: 1, gap: spacing.sm },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  thumb: { width: 72, height: 96, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: colors.paper, gap: 2 },
  thumbLabel: { fontSize: 10, fontWeight: "600", color: colors.muted },
  container: { ...pageContent, padding: spacing.lg, paddingTop: spacing.md, paddingBottom: 112 },
  badgeRow: { flexDirection: "row", gap: spacing.sm },
  card: { marginTop: spacing.md, marginBottom: spacing.sm },
  warnCard: { backgroundColor: colors.alertSoft, borderColor: colors.alertSoft },
  label: { ...type.label, marginBottom: spacing.xs, textTransform: "none" },

    warnBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.alertSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  warnTitle: { fontSize: 13, fontWeight: "700", color: colors.alert },
  warnText: { fontSize: 13, lineHeight: 18, color: colors.ink },

  sectionsCard: { marginTop: spacing.md, paddingVertical: spacing.xs },
  row: { paddingVertical: spacing.md, gap: 6 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  rowTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  itemLine: { flexDirection: "row", gap: 8 },
  itemContent: { flex: 1, minWidth: 0, gap: spacing.xs },
  contactLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs },
  mailLink: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  bulletDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.muted, marginTop: 8.5 },
  itemText: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.ink },
  chip: { height: 22, paddingHorizontal: 8, borderRadius: radius.sm, justifyContent: "center" },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: "700", includeFontPadding: false },

  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.stamp,
    backgroundColor: colors.surface,
    marginTop: spacing.lg,
  },
  outlineBtnText: { color: colors.stamp, fontSize: 15, fontWeight: "700" },
  fillBtn: {
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: radius.md,
    backgroundColor: colors.stamp,
    marginTop: spacing.sm,
  },
  fillBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  reviewGroup: { marginTop: spacing.md, gap: spacing.sm },
  issueBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: evidenceReviewColors.surface,
    borderWidth: 1,
    borderColor: evidenceReviewColors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  issueText: { flex: 1, fontSize: 14, fontWeight: "700", color: evidenceReviewColors.ink },
  issueLink: { fontSize: 12, fontWeight: "600", color: evidenceReviewColors.ink },
  reviewItem: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.sm,
    backgroundColor: evidenceReviewColors.surface,
    borderLeftWidth: 4, borderLeftColor: evidenceReviewColors.border,
  },
  reviewItemBody: { flex: 1, gap: spacing.xs },
  reviewLabel: { fontSize: 12, fontWeight: "700", color: evidenceReviewColors.ink },
  reviewValue: { fontSize: 15, lineHeight: 22, fontWeight: "600", color: evidenceReviewColors.ink },
  noteLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: spacing.sm, paddingHorizontal: 2 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.muted },

  ddayBand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  ddayBadge: { height: 22, paddingHorizontal: 8, borderRadius: 6, justifyContent: "center" },
  ddayBadgeText: { fontSize: 13, lineHeight: 17, fontWeight: "800", includeFontPadding: false },
  ddayDate: { fontSize: 13, fontWeight: "600", color: colors.ink },
  rowTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: colors.stampSoft,
    alignItems: "center",
    justifyContent: "center",
  },
});
