import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AuthError, AuthInput, AuthLink, AuthScaffold } from "../components/AuthFields";
import AffiliationPicker from "../components/AffiliationPicker";
import PrimaryButton from "../components/PrimaryButton";
import AccountDeletionForm from "../components/AccountDeletionForm";
import GoogleAccountButton from "../components/GoogleAccountButton";
import { useAuth } from "../contexts/AuthContext";
import useAffiliations from "../hooks/useAffiliations";
import { googleSignInAvailable } from "../services/auth";
import { authErrorMessage, findAffiliation, validateCredentials } from "../utils/authForm";
import { colors, radius, spacing, type } from "../theme/theme";

function AffiliationField({ catalogState, selection, setSelection, disabled }) {
  const [open, setOpen] = useState(false);
  const { catalog, loading, error, retry } = catalogState;
  const selected = findAffiliation(catalog, selection?.collegeId, selection?.departmentId);
  return <View style={{ gap: spacing.sm }}>
    <Text style={type.bodyStrong}>소속 단과대·학과</Text>
    <Text style={type.small}>단국대학교 · 죽전 캠퍼스</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="단과대·학과 선택" disabled={disabled || loading || !catalog}
      onPress={() => setOpen(true)} style={styles.selection}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={[type.body, !selected && { color: colors.muted }]}>{selected?.college.name || (loading ? "소속 목록을 불러오는 중…" : "단과대와 학과를 선택해 주세요")}</Text>
        {!!selected && <Text style={type.bodyStrong}>{selected.department.name}</Text>}
      </View>
      <Ionicons name="chevron-down" size={20} color={colors.muted} />
    </Pressable>
    <AuthError message={error} />
    {!!error && <AuthLink label="소속 목록 다시 불러오기" onPress={retry} disabled={disabled || loading} />}
    <AffiliationPicker visible={open} catalog={catalog} value={selection} onClose={() => setOpen(false)}
      onConfirm={(value) => { setSelection(value); setOpen(false); }} />
  </View>;
}

export function LoginScreen({ navigation }) {
  const { login, loginGoogle, loginGuest, busy, error: sessionError } = useAuth();
  const [guestStarting, setGuestStarting] = useState(false);
  const [googleStarting, setGoogleStarting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async () => {
    if (busy) return;
    const invalid = validateCredentials({ email, password });
    setError(invalid);
    if (invalid) return;
    try { await login(email, password); } catch (failure) { setError(authErrorMessage(failure)); }
  };
  const startGuest = async () => {
    if (busy) return;
    setError("");
    setGuestStarting(true);
    try { await loginGuest(); }
    catch (failure) { setError(authErrorMessage(failure)); }
    finally { setGuestStarting(false); }
  };
  const startGoogle = async () => {
    if (busy) return;
    setError("");
    setGoogleStarting(true);
    try { await loginGoogle(); }
    catch (failure) { setError(authErrorMessage(failure)); }
    finally { setGoogleStarting(false); }
  };
  return <AuthScaffold title="로그인" subtitle="똑독과 함께 준비할 일을 차근차근 시작해 보세요.">
    <AuthInput label="이메일" placeholder="이메일 주소" keyboardType="email-address" autoComplete="email" textContentType="username" value={email} onChangeText={setEmail} editable={!busy} />
    <AuthInput label="비밀번호" placeholder="비밀번호" password autoComplete="current-password" textContentType="password" value={password} onChangeText={setPassword} editable={!busy} onSubmitEditing={submit} returnKeyType="go" />
    <AuthError message={error || sessionError} />
    <PrimaryButton label={busy && !guestStarting && !googleStarting ? "로그인 중…" : "로그인"} tone="stamp" onPress={submit} disabled={busy} />
    <AuthLink label="처음이신가요? 회원가입" disabled={busy} onPress={() => navigation.navigate("SignUp")} />
    <GoogleAccountButton label={googleStarting ? "Google 로그인 중…" : "Google 계정으로 시작하기"}
      accessibilityHint={googleSignInAvailable ? undefined : "Google 로그인은 현재 웹에서 이용할 수 있어요."}
      disabled={busy || !googleSignInAvailable} onPress={startGoogle} />
    <View style={styles.guestSection}>
      <AuthLink label={guestStarting ? "게스트로 시작하는 중…" : "게스트로 시작하기"} disabled={busy} onPress={startGuest} />
    </View>
  </AuthScaffold>;
}

export function SignUpScreen({ navigation }) {
  const { register, busy } = useAuth();
  const catalogState = useAffiliations();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [selection, setSelection] = useState(null);
  const [error, setError] = useState("");
  const submit = async () => {
    if (busy) return;
    const invalid = validateCredentials({ email, password, confirmation }, true)
      || (!findAffiliation(catalogState.catalog, selection?.collegeId, selection?.departmentId) ? "단과대와 학과를 선택해 주세요." : "");
    setError(invalid);
    if (invalid) return;
    try { await register(email, password, selection); } catch (failure) { setError(authErrorMessage(failure)); }
  };
  return <AuthScaffold title="회원가입" subtitle="계정과 소속 정보를 등록해 주세요.">
    <AuthInput label="이메일" placeholder="이메일 주소" keyboardType="email-address" autoComplete="email" textContentType="username" value={email} onChangeText={setEmail} editable={!busy} />
    <AuthInput label="비밀번호" placeholder="6자 이상 입력해 주세요" password autoComplete="new-password" textContentType="newPassword" value={password} onChangeText={setPassword} editable={!busy} />
    <AuthInput label="비밀번호 확인" placeholder="비밀번호를 다시 입력해 주세요" password autoComplete="new-password" textContentType="newPassword" value={confirmation} onChangeText={setConfirmation} editable={!busy} />
    <AffiliationField catalogState={catalogState} selection={selection} setSelection={setSelection} disabled={busy} />
    <AuthError message={error} />
    <PrimaryButton label={busy ? "가입 중…" : "회원가입"} tone="stamp" onPress={submit} disabled={busy || catalogState.loading || !catalogState.catalog} />
    <AuthLink label="이미 계정이 있나요? 로그인" disabled={busy} onPress={() => navigation.goBack()} />
  </AuthScaffold>;
}

export function CompleteProfileScreen() {
  const { user, profile, draftSelection, completeProfile, backToLogin, retryProfile, busy, error: sessionError } = useAuth();
  const catalogState = useAffiliations();
  const [selection, setSelection] = useState(draftSelection);
  const [error, setError] = useState("");
  const submit = async () => {
    if (busy) return;
    if (!findAffiliation(catalogState.catalog, selection?.collegeId, selection?.departmentId)) {
      setError("단과대와 학과를 선택해 주세요."); return;
    }
    setError("");
    try { await completeProfile(selection); } catch (failure) { setError(authErrorMessage(failure)); }
  };
  const upgradedGuest = !user?.isAnonymous && profile?.accountType === "guest";
  return <AuthScaffold title="소속 정보 확인" subtitle={upgradedGuest
    ? `${user?.email || "Google 계정"}에 연결했어요. 기존 문서와 일정을 유지한 채 소속 정보를 저장해 주세요.`
    : `${user?.email || "계정"}의 소속 정보를 저장하면 홈 화면으로 이동해요.`}>
    <AuthError message={error || sessionError} />
    {!!sessionError && <AuthLink label="저장된 소속 정보 다시 확인" onPress={retryProfile} disabled={busy} />}
    <AffiliationField catalogState={catalogState} selection={selection} setSelection={setSelection} disabled={busy} />
    <PrimaryButton label={busy ? "저장 중…" : "소속 저장하고 시작하기"} tone="stamp" onPress={submit} disabled={busy || catalogState.loading || !catalogState.catalog} />
    <AuthLink label="로그인 화면으로 돌아가기" disabled={busy} onPress={async () => {
      try { await backToLogin(); } catch (failure) { setError(authErrorMessage(failure)); }
    }} />
  </AuthScaffold>;
}

const styles = StyleSheet.create({
  selection: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: spacing.lg, backgroundColor: colors.paper, minHeight: 54 },
  guestSection: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: spacing.md, gap: spacing.xs },
});

export function GuestSetupScreen() {
  const { retryProfile, backToLogin, busy, error: sessionError } = useAuth();
  const [error, setError] = useState("");
  return <AuthScaffold title="게스트 연결 확인" subtitle="게스트 계정은 준비됐어요. 연결을 다시 확인하면 소속 선택 없이 홈으로 이동해요.">
    <AuthError message={error || sessionError} />
    <PrimaryButton label={busy ? "연결 중…" : "다시 연결하기"} tone="stamp" disabled={busy} onPress={retryProfile} />
    <Text style={[type.small, { color: colors.muted }]}>로그인 화면으로 돌아가면 현재 게스트 계정의 데이터에 다시 접근할 수 없어요.</Text>
    <AuthLink label="로그인 화면으로 돌아가기" disabled={busy} onPress={async () => {
      try { await backToLogin(); } catch (failure) { setError(authErrorMessage(failure)); }
    }} />
  </AuthScaffold>;
}

export function AccountDeletionScreen() {
  const { backToLogin, user } = useAuth();
  return <AuthScaffold title={user?.isAnonymous ? "게스트 데이터 삭제 중" : "회원 탈퇴 진행 중"} subtitle="요청한 데이터 삭제를 마무리해 주세요.">
    <AccountDeletionForm onCancel={backToLogin} />
  </AuthScaffold>;
}
