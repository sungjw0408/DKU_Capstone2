// 설정 화면 (홈 오른쪽 위 메뉴 → 설정): 계정 / 알림 / 앱 정보
// - 계정: components/settings/AccountSection.js (팀원 B가 채울 칸)
// - 알림: 마감 알림 켜기·끄기, 알림 시각 고르기
// - 앱 정보: 버전, 앱 소개 다시 보기
// - 맨 아래: 로그아웃, 회원 탈퇴
import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { View, Text, ScrollView, Pressable, StyleSheet, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import Card from "../components/Card";
import PrimaryButton from "../components/PrimaryButton";
import AccountDeletionForm from "../components/AccountDeletionForm";
import AccountSection from "../components/settings/AccountSection";
import { useAuth } from "../contexts/AuthContext";
import { backOrHome } from "../navigation/routes";
import { authErrorMessage } from "../utils/authForm";
import { colors, radius, spacing, type } from "../theme/theme";
import { REMINDER_HOURS, hourLabel } from "../utils/notificationPlan";
import { showOnboarding } from "../services/onboarding";
import {
  getReminderHour, isNotificationEnabled, notificationsSupported, openSystemSettings,
  permissionStatus, setNotificationEnabled, setReminderHour,
} from "../services/notifications";

const APP_VERSION = Constants.expoConfig?.version || "1.0.0";

function noticeText(state, hour) {
  switch (state) {
    case "unsupported": return "웹에서는 알림을 보낼 수 없어요. 휴대폰 앱에서 켜 주세요.";
    case "blocked": return "휴대폰 설정에서 똑독 알림이 꺼져 있어요.";
    case "off": return "알림을 받지 않아요.";
    case "pending": return "켜면 알림 권한을 물어봐요.";
    default: return `마감 D-3, D-1, 당일과 할 일이 있는 날 ${hourLabel(hour)}에 알려 드려요.`;
  }
}

export default function SettingsScreen({ navigation }) {
  const { logout, busy, user } = useAuth();
  const guest = !!user?.isAnonymous;
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmGuestLogout, setConfirmGuestLogout] = useState(false);
  const [notice, setNotice] = useState({ enabled: false, state: notificationsSupported ? "pending" : "unsupported" });
  const [hour, setHour] = useState(9);
  const [noticeBusy, setNoticeBusy] = useState(false);

  // 설정 탭에 올 때마다 알림 상태를 다시 확인 (휴대폰 설정에서 바꾸고 돌아와도 반영)
  const loadNotice = useCallback(async () => {
    setHour(await getReminderHour());
    if (!notificationsSupported) return;
    const [enabled, permission] = await Promise.all([isNotificationEnabled(), permissionStatus()]);
    const state = permission === "blocked" || permission === "denied" ? "blocked"
      : !enabled ? "off" : permission === "granted" ? "on" : "pending";
    setNotice({ enabled: enabled && permission === "granted", state });
  }, []);
  useFocusEffect(useCallback(() => { loadNotice(); }, [loadNotice]));

  const toggleNotice = async (next) => {
    if (noticeBusy) return;
    setNoticeBusy(true);
    try { await setNotificationEnabled(next); await loadNotice(); }
    finally { setNoticeBusy(false); }
  };

  const chooseHour = async (next) => {
    if (noticeBusy || next === hour) return;
    setHour(next);
    setNoticeBusy(true);
    try { await setReminderHour(next); }
    finally { setNoticeBusy(false); }
  };

  const handleLogout = async () => {
    if (busy) return;
    setError("");
    try { await logout(); }
    catch (failure) { setError(authErrorMessage(failure)); }
  };

  // 알림이 꺼져 있으면 시각 고르기는 흐리게 (웹은 알림함 미리보기용으로 고를 수 있게 둔다)
  const hourDisabled = notificationsSupported && !notice.enabled;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        {deleting ? (
          <Pressable accessibilityRole="button" accessibilityLabel="설정으로 돌아가기" disabled={busy}
            onPress={() => setDeleting(false)} hitSlop={8} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
            <Text style={type.display}>{guest ? "게스트 데이터 삭제" : "회원 탈퇴"}</Text>
          </Pressable>
        ) : (
          <View style={styles.back}>
            <Pressable accessibilityRole="button" accessibilityLabel="뒤로가기" disabled={busy}
              onPress={() => backOrHome(navigation)} hitSlop={8}>
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </Pressable>
            <Text style={type.display}>설정</Text>
          </View>
        )}
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
                  <Text style={type.small}>{noticeText(notice.state, hour)}</Text>
                </View>
                {notificationsSupported && notice.state !== "blocked" && (
                  <Switch accessibilityLabel="마감 알림" value={notice.enabled} disabled={noticeBusy}
                    onValueChange={toggleNotice} trackColor={{ true: colors.stamp, false: colors.line }} />
                )}
              </View>
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
                        disabled={hourDisabled || noticeBusy} onPress={() => chooseHour(h)}
                        style={[styles.chip, on && styles.chipOn]}>
                        <Text style={[styles.chipText, on && styles.chipTextOn]}>{hourLabel(h)}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  back: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  container: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl },
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
