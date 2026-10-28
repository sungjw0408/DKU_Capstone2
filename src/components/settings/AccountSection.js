// 설정 > 계정 칸
// TODO(팀원 B · 로그인/보안 담당): 이 파일을 채워 주세요.
//   예) 프로필(이름·소속) 보기와 수정, 비밀번호 변경, 연결된 Google 계정 표시
//   로그아웃과 회원 탈퇴 버튼은 SettingsScreen 맨 아래에 이미 있어서, 필요하면 이쪽으로 옮겨도 됩니다.
// 지금은 로그인한 계정과, 게스트일 때 Google 계정 전환(#16, 예전 홈 메뉴에 있던 기능)만 보여 줍니다.
import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../Card";
import GoogleAccountButton from "../GoogleAccountButton";
import { useAuth } from "../../contexts/AuthContext";
import { googleSignInAvailable } from "../../services/auth";
import { authErrorMessage } from "../../utils/authForm";
import { colors, spacing, type } from "../../theme/theme";

export default function AccountSection() {
  const { user, busy, upgradeGuestToGoogle } = useAuth();
  const guest = !!user?.isAnonymous;
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState("");

  const linkGoogle = async () => {
    if (busy) return;
    setError("");
    setLinking(true);
    try { await upgradeGuestToGoogle(); }
    catch (failure) { setError(authErrorMessage(failure)); }
    finally { setLinking(false); }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Ionicons name={guest ? "person-outline" : "person"} size={20} color={colors.stamp} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong} numberOfLines={1}>{guest ? "게스트로 이용 중" : user?.email || "로그인한 사용자"}</Text>
          <Text style={type.small}>
            {guest ? "이 기기의 로그인 상태가 유지되는 동안 문서와 일정을 쓸 수 있어요." : "계정 설정은 준비 중이에요."}
          </Text>
        </View>
      </View>

      {guest && googleSignInAvailable && (
        <View style={styles.google}>
          <Text style={type.bodyStrong}>계정에 연결하기</Text>
          <Text style={type.small}>Google 계정을 연결하면 지금의 문서와 일정을 유지하고 다른 기기에서도 이용할 수 있어요.</Text>
          <GoogleAccountButton label={linking ? "Google 계정 연결 중…" : "Google 계정으로 전환"}
            disabled={busy} onPress={linkGoogle} />
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.stampSoft, alignItems: "center", justifyContent: "center" },
  google: { gap: spacing.sm, marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line },
  error: { ...type.small, color: colors.alert },
});
