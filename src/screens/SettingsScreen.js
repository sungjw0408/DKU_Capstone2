// 설정 탭: 계정 정보, 로그아웃, 회원 탈퇴 (홈 화면 오른쪽 위 메뉴에 있던 기능을 옮김)
import React, { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Card from "../components/Card";
import Badge from "../components/Badge";
import PrimaryButton from "../components/PrimaryButton";
import AccountDeletionForm from "../components/AccountDeletionForm";
import { useAuth } from "../contexts/AuthContext";
import { authErrorMessage } from "../utils/authForm";
import { colors, spacing, type } from "../theme/theme";

export default function SettingsScreen() {
  const { logout, busy, user } = useAuth();
  const guest = !!user?.isAnonymous;
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmGuestLogout, setConfirmGuestLogout] = useState(false);

  const handleLogout = async () => {
    if (busy) return;
    setError("");
    try { await logout(); }
    catch (failure) { setError(authErrorMessage(failure)); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        {deleting ? (
          <Pressable accessibilityRole="button" accessibilityLabel="설정으로 돌아가기" disabled={busy}
            onPress={() => setDeleting(false)} hitSlop={8} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
            <Text style={type.display}>{guest ? "게스트 데이터 삭제" : "회원 탈퇴"}</Text>
          </Pressable>
        ) : (
          <Text style={type.display}>설정</Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {deleting ? (
          <Card><AccountDeletionForm onCancel={() => setDeleting(false)} /></Card>
        ) : (
          <>
            <Text style={styles.sectionTitle}>계정</Text>
            <Card style={styles.card}>
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Ionicons name={guest ? "person-outline" : "person"} size={20} color={colors.stamp} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong} numberOfLines={1}>
                    {guest ? "게스트로 이용 중" : user?.displayName || user?.email || "로그인한 사용자"}
                  </Text>
                  {!guest && !!user?.email && !!user?.displayName && <Text style={type.small} numberOfLines={1}>{user.email}</Text>}
                  {guest && <Text style={type.small}>이 기기의 로그인 상태가 유지되는 동안 문서와 일정을 쓸 수 있어요.</Text>}
                </View>
              </View>
            </Card>

            <Text style={styles.sectionTitle}>알림</Text>
            <Card style={styles.card}>
              <View style={styles.row}>
                <Ionicons name="notifications-outline" size={20} color={colors.ink} />
                <View style={{ flex: 1 }}>
                  <Text style={type.bodyStrong}>마감 알림</Text>
                  <Text style={type.small}>D-3, D-1, 당일에 알려 드릴 예정이에요.</Text>
                </View>
                <Badge label="준비 중" />
              </View>
            </Card>

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
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.stampSoft, alignItems: "center", justifyContent: "center" },
  actions: { gap: spacing.md, marginTop: spacing.sm },
  link: { alignItems: "center", padding: spacing.sm },
  error: { ...type.body, color: colors.alert },
});
