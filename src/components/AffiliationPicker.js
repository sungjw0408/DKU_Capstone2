import React, { useEffect, useState } from "react";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PrimaryButton from "./PrimaryButton";
import { colors, radius, spacing, type } from "../theme/theme";
import { findAffiliation } from "../utils/authForm";

const purple = "#5B50D6";

export default function AffiliationPicker({ visible, catalog, value, onConfirm, onClose }) {
  const [collegeId, setCollegeId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      setCollegeId(value?.collegeId || "");
      setDepartmentId(value?.departmentId || "");
    }
  }, [visible, value?.collegeId, value?.departmentId]);
  const college = catalog?.colleges.find((item) => item.id === collegeId);
  const valid = findAffiliation(catalog, collegeId, departmentId);
  const row = (item, selected, onPress) => (
    <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: selected }} aria-checked={selected}
      accessibilityLabel={item.name} onPress={onPress} style={[styles.option, selected && styles.selected]}>
      <Text style={[type.bodyStrong, selected && styles.selectedText]}>{item.name}</Text>
      {!!item.aliases?.length && <Text style={[styles.alias, selected && styles.selectedText]}>{item.aliases.join(" · ")}</Text>}
    </Pressable>
  );
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View accessibilityViewIsModal style={styles.modal}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={type.h1}>소속 선택</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="소속 선택 닫기" onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
          </View>
          <Text style={[type.body, { color: colors.muted }]}>단국대학교 죽전 캠퍼스의 단과대와 학과를 선택해 주세요.</Text>
          <View style={styles.columns}>
            <View style={styles.column}>
              <Text style={styles.columnTitle}>단과대</Text>
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
                {catalog?.colleges.map((item) => row(item, collegeId === item.id, () => {
                  if (collegeId !== item.id) { setCollegeId(item.id); setDepartmentId(""); }
                }))}
              </ScrollView>
            </View>
            <View style={styles.column}>
              <Text style={styles.columnTitle}>학과</Text>
              <ScrollView key={collegeId} style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
                {college ? college.departments.map((item) => row(item, departmentId === item.id, () => setDepartmentId(item.id)))
                  : <Text style={styles.placeholder}>단과대를 먼저 선택해 주세요.</Text>}
              </ScrollView>
            </View>
          </View>
          <Text style={styles.summary}>{valid ? `${valid.college.name} · ${valid.department.name}` : "단과대와 학과를 모두 선택해 주세요."}</Text>
          <View style={styles.footer}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}><Text style={[type.bodyStrong, { color: colors.muted }]}>취소</Text></Pressable>
            <PrimaryButton label="선택 완료" disabled={!valid} onPress={() => onConfirm({ collegeId, departmentId })} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(24, 30, 50, 0.35)", justifyContent: "center", alignItems: "center", padding: spacing.lg },
  modal: { width: "100%", maxWidth: 600, maxHeight: "90%", backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, gap: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  columns: { flexDirection: "row", gap: spacing.md, flexShrink: 1, minHeight: 160 },
  column: { flex: 1, gap: spacing.sm },
  columnTitle: { ...type.bodyStrong, textAlign: "center" },
  list: { backgroundColor: colors.paper, borderRadius: radius.md, height: 300, flexShrink: 1 },
  listContent: { padding: spacing.xs, gap: spacing.xs },
  option: { minHeight: 48, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, justifyContent: "center", borderRadius: radius.md },
  selected: { backgroundColor: purple },
  selectedText: { color: colors.surface },
  alias: { ...type.small, marginTop: spacing.xs },
  placeholder: { ...type.body, color: colors.muted, padding: spacing.md },
  summary: { ...type.small, lineHeight: 18 },
  footer: { flexDirection: "row", gap: spacing.lg, alignItems: "center" },
  cancel: { padding: spacing.md },
});
