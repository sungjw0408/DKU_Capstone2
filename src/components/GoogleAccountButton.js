import React from "react";
import { Image, Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, spacing } from "../theme/theme";

export default function GoogleAccountButton({ label = "Google 계정으로 시작하기", onPress, disabled = false, accessibilityHint }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={accessibilityHint}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 }]}>
    <Image source={require("../../assets/google-g.png")} style={styles.logo} resizeMode="contain" accessible={false} />
    <Text style={styles.label}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { alignSelf: "center", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, minHeight: 40, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface },
  logo: { width: 18, height: 18 },
  label: { flexShrink: 1, fontSize: 13, fontWeight: "500", color: "#1F1F1F" },
});
