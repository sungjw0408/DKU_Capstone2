import React from "react";
import { Image, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Typography";
import { colors, spacing } from "../theme/theme";

export default function DocumentHero({ onPress }) {
  const { width } = useWindowDimensions();
  const compact = width < 600;
  return <View style={styles.hero}>
    <View style={[styles.content, width < 360 && styles.narrowContent]}>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={[styles.title, compact && styles.smallTitle, width < 360 && styles.narrowTitle]}>{"문서 한 장으로\n준비를 시작하세요"}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="문서 추가" onPress={onPress}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}>
          <Ionicons name="add" size={20} color={colors.surface} />
          <Text style={styles.label}>문서 추가</Text>
        </Pressable>
      </View>
      <Image accessible={false} source={require("../../assets/illustrations/ttokdoc-mascot.png")}
        resizeMode="contain" style={[styles.art, compact && styles.smallArt]} />
    </View>
  </View>;
}
const styles = StyleSheet.create({
  hero: { backgroundColor: colors.hero,
    paddingVertical: spacing.xl, marginHorizontal: spacing.lg,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#CDD0D5" },
  content: { width: "100%", maxWidth: 600, alignSelf: "center", paddingHorizontal: spacing.lg,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.lg },
  narrowContent: { paddingHorizontal: spacing.sm, gap: spacing.md },
  copy: { flexShrink: 1, alignItems: "flex-start" },
  title: { fontSize: 34, lineHeight: 42, fontWeight: "600", color: colors.ink, letterSpacing: -1.2, textAlign: "left" },
  smallTitle: { fontSize: 26, lineHeight: 33 },
  narrowTitle: { fontSize: 22, lineHeight: 29 },
  button: { backgroundColor: colors.stamp, borderRadius: 12, paddingHorizontal: 15, minHeight: 44,
    marginTop: spacing.lg, flexDirection: "row", alignItems: "center", gap: 6 },
  label: { color: colors.surface, fontSize: 14, fontWeight: "700" },
  art: { width: "32%", maxWidth: 190, height: 180 },
  smallArt: { height: 145 },
});
