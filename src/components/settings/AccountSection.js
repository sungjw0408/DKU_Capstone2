import { Text } from "../Typography";
import React, { useState } from "react";
import { Pressable, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../Card";
import GoogleAccountButton from "../GoogleAccountButton";
import { useAuth } from "../../contexts/AuthContext";
import { googleSignInAvailable } from "../../services/auth";
import { authErrorMessage } from "../../utils/authForm";
import { colors, spacing, type } from "../../theme/theme";

export default function AccountSection() {
  const { user, profile, busy, upgradeGuestToGoogle } = useAuth();
  const navigation = useNavigation();
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
      <Pressable accessibilityRole="button" accessibilityLabel="계정 관리 열기" disabled={busy}
        onPress={() => navigation.navigate("AccountSettings")} style={({ pressed }) => [styles.row, pressed && { opacity: 0.65 }]}>
        <View style={styles.avatar}>
          <Ionicons name={guest ? "person-outline" : "person"} size={20} color={colors.stamp} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong} numberOfLines={1}>{guest ? "게스트로 이용 중" : user?.email || "로그인한 사용자"}</Text>
          <Text style={type.small}>
            {guest ? "계정 연결과 이용 정보를 확인해요." : profile?.departmentName ? `${profile.departmentName} · 계정 관리` : "비밀번호와 학과 소속을 관리해요."}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>

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
