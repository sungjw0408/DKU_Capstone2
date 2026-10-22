import React, { useState } from "react";
import { Text, View } from "react-native";
import { AuthError, AuthInput, AuthLink } from "./AuthFields";
import PrimaryButton from "./PrimaryButton";
import { useAuth } from "../contexts/AuthContext";
import { usesGoogleAccount } from "../services/auth";
import { authErrorMessage } from "../utils/authForm";
import { colors, spacing, type } from "../theme/theme";

export default function AccountDeletionForm({ onCancel }) {
  const { deleteAccount, busy, pendingDeletion, user, error: sessionError } = useAuth();
  const guest = !!user?.isAnonymous;
  const google = usesGoogleAccount(user);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async () => {
    if (busy) return;
    if (!guest && !google && !password) { setError("본인 확인을 위해 현재 비밀번호를 입력해 주세요."); return; }
    setError("");
    try { await deleteAccount(password); }
    catch (failure) { setError(authErrorMessage(failure)); }
    finally { setPassword(""); }
  };
  return <View style={{ gap: spacing.lg }}>
    <Text style={[type.bodyStrong, { color: colors.alert }]}>{guest ? "게스트 계정과 모든 데이터를 삭제해요." : "탈퇴하면 모든 데이터가 삭제돼요."}</Text>
    <Text style={type.body}>이 계정의 문서, 추출 원문, 분석 결과, 준비 계획, 일정과 소속 정보를 모두 삭제합니다. 삭제한 계정과 데이터는 복구할 수 없습니다.</Text>
    {pendingDeletion && <Text style={[type.body, { color: colors.muted }]}>{guest ? "이전에 요청한 삭제를 마무리하고 있어요. 다시 시도할 수 있습니다." : google ? "이전에 요청한 삭제를 마무리하고 있어요. Google 계정으로 본인 확인 후 다시 시도할 수 있습니다." : "이전에 요청한 삭제를 마무리하고 있어요. 비밀번호를 확인해 다시 시도할 수 있습니다."}</Text>}
    {google && <Text style={[type.body, { color: colors.muted }]}>아래 버튼을 누르면 Google 계정으로 본인 확인 후 탈퇴합니다. 현재 로그인한 Google 계정을 선택해 주세요.</Text>}
    {!guest && !google && <AuthInput label="현재 비밀번호" placeholder="본인 확인을 위한 비밀번호" password autoComplete="current-password"
      textContentType="password" value={password} onChangeText={setPassword} editable={!busy} onSubmitEditing={submit} />}
    <AuthError message={error || (pendingDeletion ? sessionError : "")} />
    <PrimaryButton label={busy ? "삭제 중…" : guest ? (pendingDeletion ? "게스트 삭제 마무리하기" : "게스트 계정과 모든 데이터 삭제") : google ? "Google로 확인하고 탈퇴하기" : pendingDeletion ? "탈퇴 마무리하기" : "탈퇴하고 모든 데이터 삭제"}
      disabled={busy} onPress={submit} style={!busy && { backgroundColor: colors.alert }} />
    <AuthLink label={pendingDeletion ? "로그인 화면으로 돌아가기" : "취소"} disabled={busy} onPress={async () => {
      try { await onCancel(); } catch (failure) { setError(authErrorMessage(failure)); }
    }} />
  </View>;
}
