import React, { useEffect, useRef, useState } from "react";
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import PrimaryButton from "./PrimaryButton";
import AccountDeletionForm from "./AccountDeletionForm";
import GoogleAccountButton from "./GoogleAccountButton";
import { useAuth } from "../contexts/AuthContext";
import { googleSignInAvailable } from "../services/auth";
import { authErrorMessage } from "../utils/authForm";
import { colors, spacing, type } from "../theme/theme";

export default function AccountSidebar({ visible, onClose, onNavigate }) {
  const { logout, upgradeGuestToGoogle, busy, user } = useAuth();
  const guest = !!user?.isAnonymous;
  const [mounted, setMounted] = useState(visible);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmGuestLogout, setConfirmGuestLogout] = useState(false);
  const [googleLinking, setGoogleLinking] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(width * 0.84, 320);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setError("");
      setDeleting(false);
      setConfirmGuestLogout(false);
    }
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start(({ finished }) => { if (finished && !visible) setMounted(false); });
    return () => animation.stop();
  }, [visible, progress]);

  const close = () => {
    if (busy) return;
    if (deleting) setDeleting(false);
    else if (confirmGuestLogout) { setConfirmGuestLogout(false); setError(""); }
    else onClose();
  };
  const handleLogout = async () => {
    if (busy) return;
    setError("");
    try { await logout(); }
    catch (failure) { setError(authErrorMessage(failure)); }
  };
  const handleGoogleLink = async () => {
    if (busy) return;
    setError("");
    setGoogleLinking(true);
    try { await upgradeGuestToGoogle(); onClose(); }
    catch (failure) { setError(authErrorMessage(failure)); }
    finally { setGoogleLinking(false); }
  };

  return <Modal visible={mounted} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
    <View style={styles.overlay}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.shade, { opacity: progress }]} />
      <Pressable accessibilityRole="button" accessibilityLabel="메뉴 바깥 영역 닫기" disabled={busy}
        onPress={close} style={StyleSheet.absoluteFillObject} />
      <Animated.View accessibilityViewIsModal style={[styles.panel, { width: panelWidth,
        transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [panelWidth, 0] }) }] }]}>
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={type.h1}>{deleting ? (guest ? "게스트 데이터 삭제" : "회원 탈퇴") : confirmGuestLogout ? "게스트 로그아웃" : "메뉴"}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="메뉴 닫기" disabled={busy}
              onPress={close} hitSlop={8} style={styles.close}>
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
          </View>
          {deleting ? <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
            <AccountDeletionForm onCancel={() => setDeleting(false)} />
          </ScrollView> : confirmGuestLogout ? <ScrollView style={styles.body} contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xl }}>
            <Text style={type.bodyStrong}>로그아웃할까요?</Text>
            <Text style={type.body}>게스트는 다시 로그인할 이메일과 비밀번호가 없어 로그아웃하면 저장한 문서와 일정에 다시 접근할 수 없어요.</Text>
            <Text style={[type.small, { color: colors.muted }]}>데이터까지 삭제하려면 취소한 뒤 메뉴의 ‘게스트 데이터 삭제’를 이용해 주세요.</Text>
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <PrimaryButton label={busy ? "로그아웃 중…" : "로그아웃"} disabled={busy} onPress={handleLogout} />
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setConfirmGuestLogout(false); setError(""); }} style={{ alignItems: "center", padding: spacing.sm }}>
              <Text style={[type.bodyStrong, { color: colors.stamp }]}>취소</Text>
            </Pressable>
          </ScrollView> : <><ScrollView style={styles.body} contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xl }}>
            {!!onNavigate && <View>
              {[{ screen: "Todos", label: "할 일", icon: "checkbox-outline" },
                { screen: "Settings", label: "설정", icon: "settings-outline" }].map((item) => (
                <Pressable key={item.screen} accessibilityRole="button" accessibilityLabel={`${item.label} 열기`}
                  disabled={busy} onPress={() => onNavigate(item.screen)} style={styles.navigationItem}>
                  <Ionicons name={item.icon} size={20} color={colors.ink} />
                  <Text style={[type.bodyStrong, { flex: 1 }]}>{item.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              ))}
            </View>}
            {guest && <View style={{ gap: spacing.sm }}>
              <Text style={type.bodyStrong}>게스트로 이용 중</Text>
              <Text style={[type.small, { color: colors.muted }]}>현재 기기의 로그인 상태가 유지되는 동안 내 문서와 일정을 사용할 수 있어요.</Text>
            </View>}
            {guest && googleSignInAvailable && <View style={styles.googleSection}>
              <Text style={type.bodyStrong}>계정에 연결하기</Text>
              <Text style={[type.small, { color: colors.muted }]}>Google 계정을 연결하면 지금의 문서와 일정을 유지하고 다른 기기에서도 이용할 수 있어요.</Text>
              <GoogleAccountButton label={googleLinking ? "Google 계정 연결 중…" : "Google 계정으로 전환"}
                disabled={busy} onPress={handleGoogleLink} />
            </View>}
          </ScrollView>
          <View style={styles.footer}>
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <PrimaryButton label={busy && !googleLinking ? "로그아웃 중…" : "로그아웃"} disabled={busy} onPress={guest ? () => setConfirmGuestLogout(true) : handleLogout} />
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setError(""); setDeleting(true); }} style={{ alignItems: "center", padding: spacing.sm }}>
              <Text style={[type.bodyStrong, { color: colors.alert }]}>{guest ? "게스트 데이터 삭제" : "회원 탈퇴"}</Text>
            </Pressable>
          </View>
          </>}
        </SafeAreaView>
      </Animated.View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "flex-end" },
  shade: { backgroundColor: "rgba(24, 30, 50, 0.35)" },
  panel: { height: "100%", backgroundColor: colors.surface, borderLeftWidth: 1, borderLeftColor: colors.line },
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.line },
  close: { padding: spacing.xs },
  body: { flex: 1, padding: spacing.xl },
  navigationItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48, paddingVertical: spacing.sm },
  googleSection: { gap: spacing.sm, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line, gap: spacing.md },
  error: { ...type.body, color: colors.alert },
});
