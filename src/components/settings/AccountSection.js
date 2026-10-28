// 설정 > 계정 칸
// TODO(팀원 B · 로그인/보안 담당): 이 파일을 채워 주세요.
//   예) 프로필(이름·소속) 보기와 수정, 비밀번호 변경, 연결된 Google 계정 표시
//   로그아웃과 회원 탈퇴 버튼은 SettingsScreen 맨 아래에 이미 있어서, 필요하면 이쪽으로 옮겨도 됩니다.
// 지금은 화면 틀만 잡아 두려고 로그인한 계정만 보여 줍니다.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Card from "../Card";
import { useAuth } from "../../contexts/AuthContext";
import { colors, spacing, type } from "../../theme/theme";

export default function AccountSection() {
  const { user } = useAuth();
  const guest = !!user?.isAnonymous;
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Ionicons name={guest ? "person-outline" : "person"} size={20} color={colors.stamp} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.bodyStrong} numberOfLines={1}>{guest ? "게스트로 이용 중" : user?.email || "로그인한 사용자"}</Text>
          <Text style={type.small}>계정 설정은 준비 중이에요.</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.stampSoft, alignItems: "center", justifyContent: "center" },
});
