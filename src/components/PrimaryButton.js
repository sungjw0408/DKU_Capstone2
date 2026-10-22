// 담당자 1 (공통 컴포넌트) 소유
import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { colors, radius, spacing } from "../theme/theme";

export default function PrimaryButton({ label, onPress, tone = "ink", disabled, style }) {
  const bg = disabled ? colors.line : tone === "stamp" ? colors.stamp : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={!!disabled}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
        style,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  label: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
