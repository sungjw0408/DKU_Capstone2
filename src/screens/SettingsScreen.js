import { pageContent } from "../theme/theme";
import { Text } from "../components/Typography";
// 설정 탭: 계정 / 알림 / 앱 정보
// - 계정: components/settings/AccountSection.js (팀원 B가 채울 칸)
// - 알림: 마감 알림 켜기·끄기, 알림 시각 고르기
// - 앱 정보: 버전, 앱 소개 다시 보기
// - 맨 아래: 로그아웃, 회원 탈퇴
import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { AppState, View, ScrollView, Pressable, StyleSheet, Switch } from "react-native";
import ScreenSurface from "../components/ScreenSurface";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import Card from "../components/Card";
import PrimaryButton from "../components/PrimaryButton";
import AccountDeletionForm from "../components/AccountDeletionForm";
import AccountSection from "../components/settings/AccountSection";
import { useAuth } from "../contexts/AuthContext";
import { authErrorMessage } from "../utils/authForm";
import { colors, radius, spacing, type } from "../theme/theme";
import { backOrHome } from "../navigation/routes";
import { REMINDER_HOUR, REMINDER_HOURS, REMINDER_OFFSETS, hourLabel, reminderOffsetLabel } from "../utils/notificationPlan";
import { showOnboarding } from "../services/onboarding";
import {
  getReminderHour, getReminderOffsets, isNotificationEnabled, notificationsSupported, openSystemSettings,
  permissionStatus, setNotificationEnabled, setReminderHour, setReminderOffsets,
} from "../services/notifications";

const APP_VERSION = Constants.expoConfig?.version || "1.0.0";

function noticeText(state, hour, offsets) {
  switch (state) {
    case "unsupported": return "웹에서는 알림을 보낼 수 없어요. 휴대폰 앱에서 켜 주세요.";
    case "blocked": return "휴대폰 설정에서 똑독 알림이 꺼져 있어요.";
    case "off": return "알림을 받지 않아요.";
    case "pending": return "알림을 허용하면 선택한 마감일과 할 일이 있는 날에 알려 드려요.";
    default: return offsets.length
      ? `마감 ${offsets.map(reminderOffsetLabel).join("·")}과 할 일이 있는 날 ${hourLabel(hour)}에 알려 드려요.`
      : `할 일이 있는 날 ${hourLabel(hour)}에만 알려 드려요.`;
  }
}

export default function SettingsScreen({ navigation }) {
  const { logout, busy, user } = useAuth();
  const guest = !!user?.isAnonymous;
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmGuestLogout, setConfirmGuestLogout] = useState(false);
  const [notice, setNotice] = useState({ enabled: false, state: notificationsSupported ? "pending" : "unsupported" });
  const [hour, setHour] = useState(REMINDER_HOUR);
  const [offsets, setOffsets] = useState(REMINDER_OFFSETS);
  const [noticeBusy, setNoticeBusy] = useState(false);
  const [noticeError, setNoticeError] = useState("");

  // 설정 탭에 올 때마다 알림 상태를 다시 확인 (휴대폰 설정에서 바꾸고 돌아와도 반영)
  const loadNotice = useCallback(async () => {
    const [savedHour, savedOffsets] = await Promise.all([getReminderHour(), getReminderOffsets()]);
    setHour(savedHour);
    setOffsets(savedOffsets);
    if (!notificationsSupported) return;
    const [enabled, permission] = await Promise.all([isNotificationEnabled(), permissionStatus()]);
    const state = permission === "blocked" ? "blocked"
      : !enabled ? "off" : permission === "granted" ? "on" : "pending";
    setNotice({ enabled: enabled && permission === "granted", state });
  }, []);
  useFocusEffect(useCallback(() => {
    const refresh = () => loadNotice().catch(() => setNoticeError("알림 설정을 불러오지 못했어요."));
    refresh();
    if (!notificationsSupported) return;
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") refresh(); });
    return () => subscription.remove();
  }, [loadNotice]));

  const updateNotice = async (save) => {
    if (noticeBusy) return;
    setNoticeBusy(true);
    setNoticeError("");
    try { await save(); await loadNotice(); }
    catch { setNoticeError("알림 설정을 저장하지 못했어요. 다시 시도해 주세요."); }
    finally { setNoticeBusy(false); }
  };
  const toggleOffset = (offset) => updateNotice(() => setReminderOffsets(
    offsets.includes(offset) ? offsets.filter((value) => value !== offset) : [...offsets, offset],
  ));

  const handleLogout = async () => {
    if (busy) return;
    setError("");
    try { await logout(); }
    catch (failure) { setError(authErrorMessage(failure)); }
  };

  // 알림이 꺼져 있으면 시각 고르기는 흐리게 (웹은 알림함 미리보기용으로 고를 수 있게 둔다)
  const hourDisabled = notificationsSupported && !notice.enabled;

  return (
    <ScreenSurface style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.back}>
          <Pressable accessibilityRole="button" accessibilityLabel={deleting ? "설정으로 돌아가기" : "이전 화면으로 돌아가기"} disabled={busy}
            onPress={() => deleting ? setDeleting(false) : backOrHome(navigation)} hitSlop={8} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <Text accessibilityRole="header" style={type.display}>{deleting ? (guest ? "게스트 데이터 삭제" : "회원 탈퇴") : "설정"}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {deleting ? (
          <Card><AccountDeletionForm onCancel={() => setDeleting(false)} /></Card>
        ) : (
          <>
            {/* 계정 */}
            <Text style={styles.sectionTitle}>계정</Text>
            <AccountSection />

            {/* 알림 */}
            <Text style={styles.sectionTitle}>알림</Text>
            <Card style={styles.card}>
              <View style={styles.row}>
                <Ionicons name="notifications-outline" size={20} color={colors.ink} />
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong}>마감 알림</Text>
                  <Text style={type.small}>{noticeText(notice.state, hour, offsets)}</Text>
                </View>
                {notificationsSupported && ["on", "off"].includes(notice.state) && (
                  <Switch accessibilityLabel="마감 알림" value={notice.enabled} disabled={noticeBusy}
                    onValueChange={(next) => updateNotice(() => setNotificationEnabled(next))}
                    trackColor={{ true: colors.stamp, false: colors.line }} />
                )}
              </View>
              {notice.state === "pending" && (
                <Pressable accessibilityRole="button" disabled={noticeBusy} style={styles.settingsLink}
                  onPress={() => updateNotice(() => setNotificationEnabled(true))}>
                  <Text style={[type.bodyStrong, { color: colors.stamp }]}>알림 허용하기</Text>
                </Pressable>
              )}
              {notice.state === "blocked" && (
                <Pressable accessibilityRole="button" onPress={openSystemSettings} style={styles.settingsLink}>
                  <Text style={[type.bodyStrong, { color: colors.stamp }]}>휴대폰 설정 열기</Text>
                </Pressable>
              )}

              <View style={[styles.hourBlock, hourDisabled && styles.dim]}>
                <View style={styles.row}>
                  <Ionicons name="time-outline" size={20} color={colors.ink} />
                  <Text style={[type.bodyStrong, { flex: 1 }]}>알림 시각</Text>
                  <Text style={[type.bodyStrong, { color: colors.stamp }]}>{hourLabel(hour)}</Text>
                </View>
                <View style={styles.chips}>
                  {REMINDER_HOURS.map((h) => {
                    const on = h === hour;
                    return (
                      <Pressable key={h} accessibilityRole="button" accessibilityState={{ selected: on, disabled: hourDisabled }}
                        disabled={hourDisabled || noticeBusy} onPress={() => { if (h !== hour) updateNotice(() => setReminderHour(h)); }}
                        style={[styles.chip, on && styles.chipOn]}>
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>{hourLabel(h)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={[styles.hourBlock, hourDisabled && styles.dim]}>
                <View style={styles.row}>
                  <Ionicons name="calendar-outline" size={20} color={colors.ink} />
                  <Text style={type.bodyStrong}>마감 알림 시점</Text>
                </View>
                <View style={styles.chips}>
                  {REMINDER_OFFSETS.map((offset) => {
                    const selected = offsets.includes(offset);
                    return (
                      <Pressable key={offset} accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected, disabled: hourDisabled || noticeBusy }}
                        disabled={hourDisabled || noticeBusy} onPress={() => toggleOffset(offset)}
                        style={[styles.chip, selected && styles.chipOn]}>
                        <Text style={[styles.chipText, selected && styles.chipTextOn]}>{reminderOffsetLabel(offset)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              {!!noticeError && <Text accessibilityRole="alert" style={styles.error}>{noticeError}</Text>}
            </Card>

            {/* 앱 정보 */}
            <Text style={styles.sectionTitle}>앱 정보</Text>
            <Card style={[styles.card, styles.listCard]}>
              <View style={styles.infoRow}>
                <Text style={type.body}>버전</Text>
                <Text style={[type.body, { color: colors.muted }]}>{APP_VERSION}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={showOnboarding}
                style={({ pressed }) => [styles.infoRow, styles.divider, pressed && styles.pressed]}>
                <Text style={type.body}>앱 소개 다시 보기</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
              <View style={[styles.infoRow, styles.divider]}>
                <Text style={type.body}>만든 사람</Text>
                <Text style={[type.body, { color: colors.muted }]}>단국대 캡스톤디자인2 똑독 팀</Text>
              </View>
            </Card>

            {/* 로그아웃 · 탈퇴 */}
            {confirmGuestLogout ? (
              <Card style={[styles.card, { gap: spacing.md }]}>
                <Text style={type.bodyStrong}>로그아웃할까요?</Text>
                <Text style={type.body}>게스트는 다시 로그인할 이메일과 비밀번호가 없어 로그아웃하면 저장한 문서와 일정에 다시 접근할 수 없어요.</Text>
                {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                <PrimaryButton label={busy ? "로그아웃 중…" : "로그아웃"} disabled={busy} onPress={handleLogout} />
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setConfirmGuestLogout(false); setError(""); }} style={styles.link}>
                  <Text style={[type.bodyStrong, { color: colors.stamp }]}>취소</Text>
                </Pressable>
              </Card>
            ) : (
              <View style={styles.actions}>
                {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
                <PrimaryButton label={busy ? "로그아웃 중…" : "로그아웃"} disabled={busy}
                  onPress={guest ? () => setConfirmGuestLogout(true) : handleLogout} />
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setError(""); setDeleting(true); }} style={styles.link}>
                  <Text style={[type.bodyStrong, { color: colors.alert }]}>{guest ? "게스트 데이터 삭제" : "회원 탈퇴"}</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: { width: "100%", maxWidth: 1120, alignSelf: "center", paddingHorizontal: spacing.lg, paddingTop: 24, paddingBottom: 24 },
  back: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  backButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  container: { ...pageContent, padding: spacing.lg, paddingTop: 0, paddingBottom: 112 },
  sectionTitle: { ...type.label, fontSize: 12, marginBottom: spacing.xs, marginTop: spacing.sm },
  card: { marginBottom: spacing.lg },
  listCard: { paddingVertical: spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  hourBlock: { marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line, gap: spacing.md },
  dim: { opacity: 0.45 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, height: 32, borderRadius: radius.pill, justifyContent: "center",
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.stamp, borderColor: colors.stamp },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  chipTextOn: { color: "#FFFFFF" },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  pressed: { opacity: 0.6 },
  actions: { gap: spacing.md, marginTop: spacing.sm },
  link: { alignItems: "center", padding: spacing.sm },
  settingsLink: { marginTop: spacing.md, alignSelf: "flex-start" },
  error: { ...type.body, color: colors.alert },
});
