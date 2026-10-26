import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing } from "../theme/theme";

export default function BottomNavigation({ activeScreen, onHome, onAddDocument, onDocuments }) {
  const items = [
    { screen: "Home", label: "홈", icon: "home-outline", onPress: onHome },
    { label: "문서 추가", icon: "add-outline", onPress: onAddDocument, action: true },
    { screen: "Documents", label: "내 문서", icon: "documents-outline", onPress: onDocuments },
  ];

  return <SafeAreaView edges={["bottom", "left", "right"]} style={styles.safe}>
    <View style={styles.row}>
      {items.map((item) => {
        const selected = !!item.screen && activeScreen === item.screen;
        return <Pressable key={item.label} accessibilityRole="button" accessibilityLabel={item.label}
          accessibilityState={item.action ? undefined : { selected }} onPress={item.onPress}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
          <View style={styles.icon}>
            <Ionicons name={item.icon} size={item.action ? 32 : 25}
              color={selected || item.action ? colors.stamp : colors.muted} />
          </View>
          <Text style={[styles.label, { color: selected ? colors.stamp : item.action ? colors.ink : colors.muted }]}>
            {item.label}
          </Text>
        </Pressable>;
      })}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  row: { flexDirection: "row" },
  item: { flex: 1, minHeight: 64, alignItems: "center", justifyContent: "center", paddingVertical: spacing.sm, gap: spacing.xs },
  icon: { height: 28, alignItems: "center", justifyContent: "center" },
  label: { fontSize: 11, lineHeight: 16, fontWeight: "600" },
  pressed: { opacity: 0.6 },
});
