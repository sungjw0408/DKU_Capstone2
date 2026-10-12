import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import Card from "./Card";
import PrimaryButton from "./PrimaryButton";

import {
  CalendarDateField,
  TimeSelectionField,
} from "./PlanDateTimeFields";

import {
  colors,
  spacing,
  radius,
  type,
} from "../theme/theme";


export default function DocumentEditModal({
  document,
  onSave,
  onClose,
}) {
  const [title, setTitle] = useState(
    document?.title ?? ""
  );

  const [date, setDate] = useState(
    document?.deadline?.split("T")[0] ?? ""
  );

  const [time, setTime] = useState(
    document?.deadline?.includes("T")
      ? document.deadline.split("T")[1]
      : ""
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setError("프로젝트 제목을 입력해 주세요.");
      return;
    }

    if (time && !date) {
      setError(
        "시간을 지정하려면 날짜를 먼저 선택해 주세요."
      );
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onSave({
        title: trimmedTitle,
        deadline_date: date,
        deadline_time: time,
      });
    } catch (e) {
      setError(
        e.message ?? "프로젝트 수정에 실패했습니다."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!saving) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : "height"
        }
      >
        <SafeAreaView
          style={styles.safe}
          edges={["top", "bottom"]}
        >
          <Card style={styles.dialog}>
            <View style={styles.header}>
              <Text style={type.h1}>
                프로젝트 수정
              </Text>

              <Pressable
                disabled={saving}
                onPress={onClose}
                hitSlop={8}
                style={styles.closeButton}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color={colors.ink}
                />
              </Pressable>
            </View>

            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.field}>
                <Text style={styles.label}>
                  프로젝트 제목
                </Text>

                <TextInput
                  value={title}
                  onChangeText={(value) => {
                    setTitle(value);
                    setError("");
                  }}
                  placeholder="프로젝트 제목"
                  placeholderTextColor={colors.muted}
                  maxLength={500}
                  style={styles.input}
                />
              </View>

              <CalendarDateField
                value={date}
                onChange={(value) => {
                  setDate(value);

                  if (!value) {
                    setTime("");
                  }

                  setError("");
                }}
                allowClear
              />

              <TimeSelectionField
                label="마감 시간 (선택)"
                value={time}
                onChange={(value) => {
                  setTime(value);
                  setError("");
                }}
              />

              {!!error && (
                <Text style={styles.error}>
                  {error}
                </Text>
              )}
            </ScrollView>

            <View style={styles.buttons}>
              <Pressable
                disabled={saving}
                onPress={onClose}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>
                  취소
                </Text>
              </Pressable>

              <View style={styles.saveButton}>
                <PrimaryButton
                  label={
                    saving
                      ? "저장 중…"
                      : "수정 저장"
                  }
                  disabled={saving}
                  onPress={handleSave}
                />
              </View>
            </View>
          </Card>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}


const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(20, 24, 48, 0.35)",
  },
  safe: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  dialog: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "90%",
    alignSelf: "center",
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollArea: {
    flexShrink: 1,
  },
  content: {
    paddingBottom: spacing.sm,
  },
  field: {
    marginBottom: spacing.lg,
  },
  label: {
    ...type.bodyStrong,
    marginBottom: spacing.sm,
  },
  input: {
    ...type.body,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    backgroundColor: colors.paper,
    padding: spacing.md,
  },
  error: {
    ...type.small,
    color: colors.alert,
    marginBottom: spacing.md,
  },
  buttons: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelButton: {
    padding: spacing.md,
  },
  cancelText: {
    ...type.bodyStrong,
    color: colors.muted,
  },
  saveButton: {
    flex: 1,
  },
});