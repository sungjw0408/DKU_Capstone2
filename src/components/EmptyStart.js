// 문서가 하나도 없을 때 보여 주는 안내 + 문서 추가 버튼 (홈, 문서 목록 공통)
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import Card from "./Card";
import PrimaryButton from "./PrimaryButton";
import { colors, spacing, type } from "../theme/theme";

export default function EmptyStart({ style }) {
  const navigation = useNavigation();
  return (
    <Card style={[styles.card, style]}>
      <View style={styles.icon}>
        <Ionicons name="document-text-outline" size={32} color={colors.stamp} />
      </View>
      <Text style={type.h1}>첫 공지를 추가해 보세요</Text>
      <Text style={styles.body}>
        학교 공지 PDF나 사진, 복사한 글을 올리면{"\n"}해야 할 일과 마감일을 정리해 드려요.
      </Text>
      <PrimaryButton tone="stamp" label="공지 추가하기" onPress={() => navigation.navigate("DocumentAdd")} style={styles.button} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.sm },
  icon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.stampSoft,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.xs,
  },
  body: { ...type.body, color: colors.muted, textAlign: "center" },
  button: { alignSelf: "stretch", marginTop: spacing.sm },
});
