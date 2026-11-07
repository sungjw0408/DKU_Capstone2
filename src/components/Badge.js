import { Text } from "./Typography";
import React from "react";
import { View, StyleSheet } from "react-native";
import { colors, radius, spacing } from "../theme/theme";

const TONES = {
  alert: { bg: colors.alertSoft, fg: colors.alert },
  stamp: { bg: colors.stampSoft, fg: colors.stamp },
  gold: { bg: colors.goldSoft, fg: colors.gold },
  green: { bg: colors.greenSoft, fg: colors.green },
  neutral: { bg: colors.line, fg: colors.muted },
};

export default function Badge({ label, tone = "neutral", style }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]}>
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    height: 22,
    justifyContent: "center",
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  text: { fontSize: 12, lineHeight: 16, fontWeight: "700", includeFontPadding: false },
});
