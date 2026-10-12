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


export default function TodoEditModal({
  todo,
  maxDate,
  onSave,
  onClose,
}) {
  const [title, setTitle] = useState(
    todo?.title ?? ""
  );

  const [date, setDate] = useState(
    todo?.date ?? ""
  );

  const [time, setTime] = useState(
    todo?.time ?? ""
  );

  const [notes, setNotes] = useState(
    todo?.notes ?? ""
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");


  const handleSave = async () => {
    const trimmedTitle = title.trim();

    // 제목은 필수
    if (!trimmedTitle) {
      setError("할 일 이름을 입력해 주세요.");
      return;
    }

    // 날짜가 없는데 시간만 설정되는 상황 방지
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
        date,
        time,
        notes: notes.trim(),
      });
    } catch (e) {
      setError(
        e.message ?? "수정에 실패했습니다."
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
        if (!saving) {
          onClose();
        }
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

            {/* 상단 제목 + 닫기 버튼 */}
            <View style={styles.header}>
              <Text style={type.h1}>
                할 일 수정
              </Text>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="수정 창 닫기"
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


            {/* 입력 영역 */}
            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >

              {/* 할 일 이름 */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  할 일 이름
                </Text>

                <TextInput
                  accessibilityLabel="할 일 이름"
                  value={title}
                  onChangeText={(value) => {
                    setTitle(value);
                    setError("");
                  }}
                  placeholder="할 일 이름을 입력하세요"
                  placeholderTextColor={colors.muted}
                  maxLength={500}
                  autoCorrect={false}
                  style={styles.input}
                />
              </View>


              {/* 날짜 */}
              <CalendarDateField
                value={date}
                onChange={(value) => {
                  setDate(value);

                  // 날짜를 지우면 시간도 함께 제거
                  if (!value) {
                    setTime("");
                  }

                  setError("");
                }}
                maxDate={maxDate}
                allowClear
              />


              {/* 시간 */}
              <TimeSelectionField
                label="시간 (선택)"
                value={time}
                onChange={(value) => {
                  setTime(value);
                  setError("");
                }}
              />


              {/* 메모 */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  메모·필요 서류 (선택)
                </Text>

                <TextInput
                  accessibilityLabel="메모"
                  value={notes}
                  onChangeText={(value) => {
                    setNotes(value);
                    setError("");
                  }}
                  placeholder="예: 신청서, 성적증명서, 통장 사본"
                  placeholderTextColor={colors.muted}
                  multiline
                  maxLength={4000}
                  textAlignVertical="top"
                  style={[
                    styles.input,
                    styles.notesInput,
                  ]}
                />
              </View>


              {/* 오류 메시지 */}
              {!!error && (
                <Text
                  accessibilityRole="alert"
                  style={styles.error}
                >
                  {error}
                </Text>
              )}

            </ScrollView>


            {/* 취소 / 저장 버튼 */}
            <View style={styles.buttons}>
              <Pressable
                accessibilityRole="button"
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

  scrollArea: {
    flexShrink: 1,
  },

  content: {
    paddingBottom: spacing.sm,
  },

  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
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

  notesInput: {
    minHeight: 88,
  },

  error: {
    ...type.small,
    color: colors.alert,
    lineHeight: 18,
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