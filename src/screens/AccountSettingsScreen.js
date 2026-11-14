import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenSurface from "../components/ScreenSurface";
import Card from "../components/Card";
import Badge from "../components/Badge";
import PrimaryButton from "../components/PrimaryButton";
import AffiliationPicker from "../components/AffiliationPicker";
import GoogleAccountButton from "../components/GoogleAccountButton";
import { AuthError, AuthInput, AuthLink } from "../components/AuthFields";
import { Text } from "../components/Typography";
import { useAuth } from "../contexts/AuthContext";
import useAffiliations from "../hooks/useAffiliations";
import { googleSignInAvailable, usesGoogleAccount, usesPasswordAccount } from "../services/auth";
import { authErrorMessage, validatePasswordChange } from "../utils/authForm";
import { backOrHome } from "../navigation/routes";
import { colors, pageContent, spacing, type } from "../theme/theme";

function Feedback({ value }) {
  return <>
    <AuthError message={value.error} />
    {!!value.message && <Text accessibilityLiveRegion="polite" style={[type.small, { color: colors.green }]}>{value.message}</Text>}
  </>;
}

export default function AccountSettingsScreen({ navigation }) {
  const { user, profile, busy, completeProfile, changePassword, sendPasswordReset, sendVerification, refreshAccount, upgradeGuestToGoogle } = useAuth();
  const guest = !!user?.isAnonymous;
  const passwordAccount = usesPasswordAccount(user);
  const google = usesGoogleAccount(user);
  const affiliation = useAffiliations(!guest);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [affiliationError, setAffiliationError] = useState("");
  const [affiliationMessage, setAffiliationMessage] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordFeedback, setPasswordFeedback] = useState({});
  const [accountFeedback, setAccountFeedback] = useState({});

  const perform = async (action, feedback, message) => {
    if (busy) return false;
    feedback({});
    try {
      await action();
      feedback({ message });
      return true;
    } catch (error) {
      feedback({ error: authErrorMessage(error) });
      return false;
    }
  };
  const submitPassword = async () => {
    if (busy) return;
    const error = validatePasswordChange({ currentPassword, newPassword, confirmation });
    if (error) { setPasswordFeedback({ error }); return; }
    const saved = await perform(() => changePassword(currentPassword, newPassword), setPasswordFeedback, "비밀번호를 변경했어요. 다음 로그인부터 새 비밀번호를 사용해 주세요.");
    if (saved) { setCurrentPassword(""); setNewPassword(""); setConfirmation(""); }
  };
  const saveAffiliation = async (selection) => {
    if (busy) return;
    setAffiliationError("");
    try {
      await completeProfile(selection);
      setPickerOpen(false);
      setAffiliationMessage("소속을 저장했어요. 공지의 신청 대상 비교에 바로 반영돼요.");
    } catch (error) { setAffiliationError(authErrorMessage(error)); }
  };

  return <ScreenSurface edges={["top"]}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="설정으로 돌아가기" disabled={busy}
        onPress={() => backOrHome(navigation)} style={styles.back}>
        <Ionicons name="chevron-back" size={22} color={colors.ink} />
      </Pressable>
      <Text accessibilityRole="header" style={type.display}>계정 관리</Text>
    </View>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>로그인 정보</Text>
        <Card style={styles.card}>
          <View style={styles.row}>
            <View style={styles.avatar}><Ionicons name="person-outline" size={24} color={colors.stamp} /></View>
            <View style={styles.flex}>
              <Text style={type.bodyStrong} selectable>{guest ? "게스트로 이용 중" : user?.email}</Text>
              <Text style={type.small}>{guest ? "현재 기기에 연결된 게스트 계정" : [google && "Google", passwordAccount && "이메일"].filter(Boolean).join(" · ") + " 로그인"}</Text>
            </View>
          </View>
          {!guest && <View style={[styles.divider, styles.verification]}>
            <View style={styles.row}>
              <Text style={[type.bodyStrong, styles.flex]}>이메일 인증</Text>
              <Badge label={user?.emailVerified ? "인증 완료" : "인증 필요"} tone={user?.emailVerified ? "green" : "gold"} />
            </View>
            {!user?.emailVerified && <>
              <Text style={type.small}>가입한 이메일에서 인증을 완료하면 계정 소유를 확인할 수 있어요.</Text>
              <AuthLink label="인증 메일 보내기" disabled={busy}
                onPress={() => perform(sendVerification, setAccountFeedback, "인증 메일을 보냈어요. 메일함을 확인해 주세요.")} />
              <AuthLink label="인증 상태 새로고침" disabled={busy}
                onPress={() => perform(refreshAccount, setAccountFeedback, "이메일 인증 상태를 새로 확인했어요.")} />
            </>}
          </View>}
          {guest && <>
            <Text style={[type.small, styles.guestNote]}>Google 계정을 연결하면 문서와 일정을 유지하며 다른 기기에서도 사용할 수 있어요.</Text>
            {googleSignInAvailable && <GoogleAccountButton label={busy ? "연결 중…" : "Google 계정으로 전환"} disabled={busy}
              onPress={() => perform(upgradeGuestToGoogle, setAccountFeedback, "Google 계정을 연결했어요.")} />}
          </>}
          <Feedback value={accountFeedback} />
        </Card>

        <Text style={styles.sectionTitle}>학교 · 학과 소속</Text>
        <Card style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel="학과 소속 수정" disabled={busy || guest || affiliation.loading || !affiliation.catalog}
            onPress={() => { setAffiliationError(""); setAffiliationMessage(""); setPickerOpen(true); }} style={styles.row}>
            <Ionicons name="school-outline" size={23} color={colors.stamp} />
            <View style={styles.flex}>
              <Text style={type.small}>{[profile?.universityName, profile?.campusName].filter(Boolean).join(" · ") || "학교 소속"}</Text>
              <Text style={type.bodyStrong}>{guest ? "계정을 연결한 뒤 소속을 설정해 주세요." : [profile?.collegeName, profile?.departmentName].filter(Boolean).join(" · ") || "소속을 선택해 주세요."}</Text>
              {!guest && <Text style={[type.small, styles.editText]}>{affiliation.loading ? "소속 목록을 불러오는 중…" : "소속 수정"}</Text>}
            </View>
            {!guest && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
          </Pressable>
          {!!affiliation.error && <>
            <AuthError message={affiliation.error} />
            <AuthLink label="소속 목록 다시 불러오기" disabled={busy || affiliation.loading} onPress={affiliation.retry} />
          </>}
          {!!affiliationMessage && <Text accessibilityLiveRegion="polite" style={[type.small, styles.saved]}>{affiliationMessage}</Text>}
        </Card>

        <Text style={styles.sectionTitle}>비밀번호</Text>
        <Card style={[styles.card, styles.passwordForm]}>
          {passwordAccount ? <>
            <Text accessibilityRole="header" style={type.h2}>비밀번호 변경</Text>
            <Text style={type.small}>현재 비밀번호를 확인한 뒤 새 비밀번호로 변경해요.</Text>
            <AuthInput label="현재 비밀번호" password value={currentPassword} onChangeText={setCurrentPassword}
              autoComplete="current-password" textContentType="password" editable={!busy} />
            <AuthInput label="새 비밀번호" password placeholder="6자 이상 입력" value={newPassword} onChangeText={setNewPassword}
              autoComplete="new-password" textContentType="newPassword" editable={!busy} />
            <AuthInput label="새 비밀번호 확인" password value={confirmation} onChangeText={setConfirmation}
              autoComplete="new-password" textContentType="newPassword" editable={!busy} onSubmitEditing={submitPassword} />
            <Feedback value={passwordFeedback} />
            <PrimaryButton label={busy ? "처리 중…" : "비밀번호 변경하기"} tone="stamp" disabled={busy} onPress={submitPassword} />
            <AuthLink label="비밀번호 재설정 메일 보내기" disabled={busy}
              onPress={() => perform(sendPasswordReset, setPasswordFeedback, "재설정 메일을 보냈어요. 이메일에서 새 비밀번호를 설정해 주세요.")} />
          </> : <Text style={type.body}>{google ? "Google 계정으로 로그인 중이에요. 비밀번호는 Google 계정 설정에서 변경할 수 있어요." : "게스트 계정에는 비밀번호가 없어요. Google 계정을 연결해 계정을 유지할 수 있어요."}</Text>}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
    <AffiliationPicker visible={pickerOpen} catalog={affiliation.catalog} value={profile} onConfirm={saveAffiliation}
      onClose={() => setPickerOpen(false)} busy={busy} error={affiliationError} confirmLabel="소속 저장" />
  </ScreenSurface>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { width: "100%", maxWidth: 960, alignSelf: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.lg,
    flexDirection: "row", alignItems: "center", gap: spacing.xs },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  container: { ...pageContent, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  sectionTitle: { ...type.label, fontSize: 12, marginBottom: spacing.sm },
  card: { marginBottom: spacing.xl, gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.stampSoft, alignItems: "center", justifyContent: "center" },
  divider: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: spacing.sm, paddingTop: spacing.md },
  verification: { gap: spacing.sm },
  guestNote: { marginVertical: spacing.sm },
  editText: { color: colors.stamp, marginTop: 4 },
  saved: { color: colors.green, marginTop: spacing.sm },
  passwordForm: { gap: spacing.lg },
});
