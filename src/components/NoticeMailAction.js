import React, { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../contexts/AuthContext";
import { createNoticeMailDraft, getNoticeMailOptions } from "../services/api";
import { colors, dialogGlass, inputSurface, radius, spacing, type } from "../theme/theme";
import { gmailComposeUrl, signedInWithGoogle } from "../utils/noticeMail";
import Card from "./Card";
import PrimaryButton from "./PrimaryButton";
import { Text, TextInput } from "./Typography";

const MAIL_TYPES = [
  { kind: "inquiry", label: "문의 메일", description: "궁금한 점을 짧고 정중한 메일로 작성해요.", icon: "chatbubble-outline" },
  { kind: "application", label: "신청 메일", description: "공지 양식에 맞춰 이메일 접수용 초안을 작성해요.", icon: "paper-plane-outline" },
];

function MailField({ label, style, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={type.bodyStrong}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted}
        style={[styles.input, props.multiline && styles.multiline, style]} {...props} />
    </View>
  );
}

function Instructions({ label, items }) {
  if (!items.length) return null;
  return (
    <View style={styles.instructions}>
      <Text style={type.bodyStrong}>{label}</Text>
      {items.map((item) => <Text key={item} style={type.small}>{item}</Text>)}
    </View>
  );
}

function NoticeMailModal({ documentId, options, user, onClose }) {
  const [kind, setKind] = useState(null);
  const [recipient, setRecipient] = useState("");
  const [question, setQuestion] = useState("");
  const [subject, setSubject] = useState("");
  const [answers, setAnswers] = useState({});
  const [details, setDetails] = useState("");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const application = kind === "application" ? options.application : null;
  const recipients = kind ? options[kind].recipients : [];
  const attachments = application?.attachments ?? [];
  const choose = (nextKind) => {
    setKind(nextKind);
    setRecipient(options[nextKind].recipients[0]);
    setError("");
  };

  const generate = async () => {
    if (sending.current) return;
    if (!application && !question.trim()) return setError("문의 내용을 한 줄로 적어 주세요.");
    if (application?.subjectFormats.length && !subject.trim()) {
      return setError("공지의 제목 형식에 맞춰 메일 제목을 입력해 주세요.");
    }
    if (application?.requiredFields.some((field) => !answers[field]?.trim())) {
      return setError("공지에서 요구하는 신청 정보를 모두 입력해 주세요.");
    }
    if (application && !application.requiredFields.length && !details.trim()) {
      return setError("메일에 넣을 신청 정보를 입력해 주세요.");
    }
    sending.current = true;
    setSaving(true);
    setError("");
    try {
      const input = application ? { kind, recipient, subject, answers, details } : { kind, recipient, question };
      setDraft(await createNoticeMailDraft(documentId, input, user));
    } catch (e) {
      setError(e.message || "메일 초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      sending.current = false;
      setSaving(false);
    }
  };

  const openGmail = async () => {
    if (!draft.subject.trim() || !draft.body.trim()) return setError("제목과 본문을 모두 입력해 주세요.");
    setError("");
    const url = gmailComposeUrl(draft.recipient, draft.subject, draft.body);
    try {
      if (Platform.OS === "web") window.open(url, "_blank", "noopener,noreferrer");
      else await Linking.openURL(url);
    } catch {
      setError("Gmail을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
  };

  const back = () => {
    setError("");
    if (draft) setDraft(null);
    else setKind(null);
  };
  const close = () => { if (!sending.current) onClose(); };
  const title = draft ? "메일 초안 확인" : MAIL_TYPES.find((item) => item.kind === kind)?.label ?? "메일 작성";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
          <Card style={styles.dialog}>
            <View style={styles.header}>
              <Text style={type.h1}>{title}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="메일 작성 닫기" hitSlop={8}
                disabled={saving} onPress={close}>
                <Ionicons name="close" size={24} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {!kind ? MAIL_TYPES.filter((item) => options[item.kind]).map((item) => (
                <Pressable key={item.kind} accessibilityRole="button" onPress={() => choose(item.kind)} style={styles.choice}>
                  <Ionicons name={item.icon} size={20} color={colors.stamp} />
                  <View style={styles.choiceText}>
                    <Text style={type.bodyStrong}>{item.label}</Text>
                    <Text style={type.small}>{item.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                </Pressable>
              )) : (
                <>
                  {draft || recipients.length === 1 ? (
                    <View style={styles.field}>
                      <Text style={type.bodyStrong}>받는 사람</Text>
                      <Text selectable style={type.body}>{draft?.recipient ?? recipient}</Text>
                    </View>
                  ) : (
                    <View style={styles.field}>
                      <Text style={type.bodyStrong}>받는 사람</Text>
                      {recipients.map((address) => (
                        <Pressable key={address} accessibilityRole="radio" accessibilityState={{ checked: recipient === address }}
                          disabled={saving} onPress={() => setRecipient(address)} style={styles.choice}>
                          <Ionicons name={recipient === address ? "radio-button-on" : "radio-button-off"}
                            size={18} color={colors.stamp} />
                          <Text style={[type.body, styles.choiceText]}>{address}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {kind === "inquiry" && options.inquiry.usesSubmissionRecipient && (
                    <Text style={type.small}>별도 문의 이메일이 없어 공지의 접수 이메일을 사용해요.</Text>
                  )}
                  {application && <Instructions label="공지의 메일 제목 형식" items={application.subjectFormats} />}
                  {draft ? (
                    <>
                      <MailField label="제목" value={draft.subject} maxLength={500}
                        onChangeText={(value) => setDraft((current) => ({ ...current, subject: value }))} />
                      <MailField label="본문" value={draft.body} multiline style={styles.body}
                        onChangeText={(value) => setDraft((current) => ({ ...current, body: value }))} />
                    </>
                  ) : application ? (
                    <>
                      {application.subjectFormats.length > 0 && (
                        <MailField label="제목" value={subject} maxLength={500} editable={!saving}
                          onChangeText={setSubject} placeholder="공지의 제목 형식에 맞춰 입력해 주세요." />
                      )}
                      <Instructions label="본문 작성 안내" items={application.bodyInstructions} />
                      {application.requiredFields.map((field) => (
                        <MailField key={field} label={field} value={answers[field] ?? ""} maxLength={200} editable={!saving}
                          onChangeText={(value) => setAnswers((current) => ({ ...current, [field]: value }))} />
                      ))}
                      <MailField label={application.requiredFields.length ? "추가 신청 정보 (선택)" : "신청 정보"}
                        value={details} maxLength={1200} editable={!saving} onChangeText={setDetails} multiline
                        placeholder="메일에 넣을 정보를 입력해 주세요." />
                    </>
                  ) : (
                    <MailField label="문의 내용" value={question} maxLength={600} editable={!saving}
                      onChangeText={setQuestion} placeholder="예: 재학증명서도 제출해야 하나요?" />
                  )}

                  {attachments.length > 0 && (
                    <Instructions label="Gmail에서 첨부할 서류" items={attachments.map((item) => "□ " + item)} />
                  )}
                </>
              )}
              {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            </ScrollView>
            {kind && (
              <View style={styles.footer}>
                <Pressable accessibilityRole="button" onPress={back} disabled={saving} style={styles.back}>
                  <Text style={type.bodyStrong}>이전</Text>
                </Pressable>
                <PrimaryButton label={draft ? "Gmail에서 열기" : saving ? "초안 작성 중…" : "초안 만들기"}
                  onPress={draft ? openGmail : generate} disabled={saving} tone="stamp" style={styles.footerButton} />
              </View>
            )}
          </Card>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function NoticeMailAction({ documentId }) {
  const { user } = useAuth();
  const [result, setResult] = useState(null);
  const [composer, setComposer] = useState(null);
  const [reload, setReload] = useState(0);

  useFocusEffect(useCallback(() => {
    if (!user) return;
    let active = true;
    async function load() {
      try {
        if (!await signedInWithGoogle(user) || !active) return;
      } catch {
        return;
      }
      try {
        const options = await getNoticeMailOptions(documentId, user);
        if (active) setResult({ user, options });
      } catch {
        if (active) setResult({ user, error: true });
      }
    }
    load();
    return () => { active = false; };
  }, [documentId, reload, user]));

  if (!user || result?.user !== user) return null;
  if (result.error) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setReload((count) => count + 1)} style={styles.action}>
        <Text style={styles.actionText}>메일 작성 정보 다시 불러오기</Text>
      </Pressable>
    );
  }
  if (!result.options.inquiry && !result.options.application) return null;

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setComposer({ user, options: result.options })} style={styles.action}>
        <Ionicons name="mail-outline" size={17} color={colors.stamp} />
        <Text style={styles.actionText}>메일 작성</Text>
      </Pressable>
      {composer?.user === user && (
        <NoticeMailModal documentId={documentId} options={composer.options} user={user} onClose={() => setComposer(null)} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  action: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.stamp,
    borderRadius: radius.sm, backgroundColor: colors.surface },
  actionText: { ...type.bodyStrong, color: colors.stamp },
  overlay: { flex: 1, backgroundColor: "rgba(17,35,66,0.42)" },
  safe: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing.md },
  dialog: { ...dialogGlass, width: "100%", maxWidth: 560, maxHeight: "96%", padding: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  scroll: { flexShrink: 1 },
  content: { gap: spacing.md, paddingBottom: spacing.sm },
  field: { gap: spacing.xs },
  input: { ...type.body, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm,
    padding: spacing.sm, minHeight: 42, backgroundColor: inputSurface },
  multiline: { minHeight: 76, textAlignVertical: "top" },
  body: { minHeight: 150 },
  choice: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.surface },
  choiceText: { flex: 1 },
  instructions: { gap: spacing.xs, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.surface },
  error: { ...type.small, color: colors.alert },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  back: { padding: spacing.md },
  footerButton: { flex: 1 },
});
