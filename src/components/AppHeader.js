import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "./Typography";
import { colors, spacing, type } from "../theme/theme";

export default function AppHeader({ title, subtitle }) {
  const navigation = useNavigation();

  if (title) {
    return <View style={[styles.header, styles.pageHeader]}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    </View>;
  }

  return <View style={[styles.header, styles.brandHeader]}>
    <View style={styles.brandRow}>
      <Text style={styles.brand}>똑독</Text>
      {!!subtitle && <Text style={styles.brandSubtitle}>{subtitle}</Text>}
    </View>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel="알림함" hitSlop={8}
        onPress={() => navigation.navigate("Notifications")}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
        <Ionicons name="notifications-outline" size={22} color={colors.ink} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="설정" hitSlop={8}
        onPress={() => navigation.navigate("Settings")}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
        <Ionicons name="settings-outline" size={22} color={colors.ink} />
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.hero, width: "100%", maxWidth: 960,
    alignSelf: "center", flexShrink: 0, flexDirection: "row",
    justifyContent: "space-between", alignItems: "center",
    minHeight: 68, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  pageHeader: { marginBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.line },
  brandHeader: { borderBottomWidth: 1, borderBottomColor: "#CDD0D5" },
  heading: { flex: 1, gap: 2 },
  title: { ...type.display, fontSize: 22, lineHeight: 26 },
  subtitle: { ...type.small, lineHeight: 16 },
  brandRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingRight: spacing.sm },
  brand: { ...type.display, fontSize: 26, fontWeight: "800", letterSpacing: -1.5 },
  brandSubtitle: { ...type.small, fontSize: 11, lineHeight: 14, fontWeight: "600", flexShrink: 1, minWidth: 0 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexShrink: 0 },
  iconButton: { padding: 8, borderRadius: 14,
    minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.7 },
});
