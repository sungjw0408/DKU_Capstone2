import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Card from "./Card";
import { colors, radius, spacing, type } from "../theme/theme";

export function AuthScaffold({ title, subtitle, children }) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
          <View style={styles.content}>
            <View style={styles.brandRow}>
              <View style={styles.logo}>
                <Ionicons name="document-text" size={22} color={colors.surface} />
                <View style={styles.check}><Ionicons name="checkmark" size={10} color={colors.stamp} /></View>
              </View>
              <Text style={styles.brand}>똑독</Text>
            </View>
            <Card style={styles.card}>
              <Text accessibilityRole="header" style={type.display}>{title}</Text>
              {!!subtitle && <Text style={[type.body, styles.subtitle]}>{subtitle}</Text>}
              <View style={styles.form}>{children}</View>
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AuthInput({ label, password = false, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={type.bodyStrong}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput {...props} accessibilityLabel={label} secureTextEntry={password && !visible}
          autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.muted}
          style={[styles.input, password && { paddingRight: 48 }]} />
        {password && <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${visible ? "숨기기" : "보기"}`}
          onPress={() => setVisible((value) => !value)} hitSlop={8} style={styles.eye}>
          <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
        </Pressable>}
      </View>
    </View>
  );
}

export function AuthError({ message }) {
  return message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null;
}

export function AuthLink({ label, onPress, disabled }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={styles.link}>
    <Text style={[type.bodyStrong, { color: disabled ? colors.muted : colors.stamp }]}>{label}</Text>
  </Pressable>;
}

export function AuthLoading() {
  return <AuthScaffold title="잠시만 기다려 주세요" subtitle="로그인 정보를 확인하고 있어요.">
    <ActivityIndicator accessibilityLabel="로그인 정보 확인 중" color={colors.stamp} size="large" />
  </AuthScaffold>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { flexGrow: 1, justifyContent: "center", padding: spacing.xl },
  content: { width: "100%", maxWidth: 480, alignSelf: "center" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xl },
  brand: { ...type.display },
  logo: { width: 38, height: 42, borderRadius: radius.md, backgroundColor: colors.stamp, alignItems: "center", justifyContent: "center" },
  check: { position: "absolute", bottom: -3, right: -4, width: 17, height: 17, borderRadius: 9, borderWidth: 1, borderColor: colors.stamp, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  card: { padding: spacing.xl },
  subtitle: { color: colors.muted, marginTop: spacing.sm },
  form: { gap: spacing.lg, marginTop: spacing.xl },
  field: { gap: spacing.sm },
  inputRow: { position: "relative" },
  input: { ...type.body, backgroundColor: colors.paper, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14, minHeight: 50 },
  eye: { position: "absolute", right: spacing.lg, top: 15 },
  error: { ...type.body, color: colors.alert },
  link: { alignItems: "center", paddingVertical: spacing.sm, minHeight: 36 },
});
