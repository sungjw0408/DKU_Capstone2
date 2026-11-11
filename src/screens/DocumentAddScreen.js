import { requireOptionalNativeModule } from "expo";
import AndroidDocumentCamera from "../components/AndroidDocumentCamera";

import { glass } from "../theme/theme";
import GlassTint from "../components/GlassTint";
import { pageContent } from "../theme/theme";
import { Text, TextInput } from "../components/Typography";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { View, Pressable, StyleSheet, ActivityIndicator, Alert, Platform, KeyboardAvoidingView, ScrollView, Image } from "react-native";
import ScreenSurface from "../components/ScreenSurface";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import PrimaryButton from "../components/PrimaryButton";
import { colors, spacing, type, radius } from "../theme/theme";
import {
  analyzeFile,
  analyzeImages,
  analyzeText,
  analyzeWithAttachments,
  attachmentMimeType,
  retryDocument,
  listDocuments,
} from "../services/api";

const INPUT_METHODS = [
  { id: "camera", label: "사진 촬영", desc: "공지문을 바로 찍어서 추가해요",
    icon: "camera", color: colors.stamp, bg: colors.stampSoft, mobileOnly: true },
  { id: "library", label: "앨범에서 선택", desc: "저장해 둔 캡처나 사진을 골라요",
    icon: "images", color: colors.green, bg: colors.greenSoft },
  { id: "pdf", label: "PDF 업로드", desc: "공지 PDF 파일을 올려요",
    icon: "document-text", color: colors.alert, bg: colors.alertSoft },
  { id: "text", label: "텍스트 붙여넣기", desc: "복사한 공지 내용을 붙여넣어요",
    icon: "clipboard", color: colors.gold, bg: colors.goldSoft },
];

// 백엔드 파이프라인 단계에 맞춘 로딩 문구 (실제 진행률이 아니라 대기 중 안내용)
const STAGES = ["문서를 읽고 있어요…", "해야 할 일을 찾고 있어요…", "원문과 한 줄씩 대조하고 있어요…"];
const IMAGE_STAGES = ["사진 속 글자를 읽고 있어요…", ...STAGES.slice(1)];
const IS_WEB = Platform.OS === "web";

const SAMPLE_NOTICE = `2026학년도 2학기 SW인재 장학금 신청 안내

본교 재학생을 대상으로 2026학년도 SW인재 장학금 신청을 아래와 같이 안내합니다.

1. 신청 대상
- 2026학년도 재학생
- 직전 학기 평균 평점 3.5 이상인 자

2. 신청 기간: 2026년 9월 15일(화) ~ 9월 25일(금) 17:00까지
3. 제출 서류: 신청서, 성적증명서, 통장 사본
4. 제출 방법: 학생포털 > 장학 > 온라인 신청 후 서류 업로드
5. 선발 결과 발표: 2026년 10월 2일(금) 학생포털 공지

문의: 장학팀 031-8005-1234`;

function showError(message) {
  if (Platform.OS === "web") window.alert(message);
  else Alert.alert("분석하지 못했어요", message);
}

function MethodRow({ m, onPress }) {
  const off = m.mobileOnly && IS_WEB;
  const desc = off ? "휴대폰 앱에서만 사용할 수 있어요" : m.desc;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, off && styles.rowUnavailable, pressed && styles.rowPressed]}
    >
      {!off && <GlassTint radius={24} />}
      <View style={[styles.iconBox, { backgroundColor: off ? colors.line : m.bg }]}>
        <Ionicons name={m.icon} size={22} color={off ? colors.muted : m.color} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, off && { color: colors.muted }]}>{m.label}</Text>
        <Text style={styles.rowDesc}>{desc}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

export default function DocumentAddScreen({ navigation }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [stage, setStage] = useState(0);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [photos, setPhotos] = useState([]);
  const photoIdCounter = useRef(0);
  const [androidCamera, setAndroidCamera] = useState(null);
  const cameraBusy = useRef(false);
  const [textMode, setTextMode] = useState(false);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [focused, setFocused] = useState(false);
  const [pendingDocumentId, setPendingDocumentId] = useState(null);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);
  useFocusEffect(
    useCallback(() => () => setAndroidCamera(null), [])
  );

  const stages = (kind) => (kind === "image" ? IMAGE_STAGES : STAGES);
  const [stageList, setStageList] = useState(STAGES);

  useFocusEffect(useCallback(() => {
    let active = true;

    // 새로고침·서버 재시작 뒤에도 분석 실패 문서를 재업로드 없이 다시 시도한다.
    listDocuments().then((documents) => {
      const pending = documents.find((document) => document.status === "analysis_failed");
      if (active && pending) setPendingDocumentId((current) => current || pending.id);
    }).catch(() => { /* 일반 업로드는 그대로 사용할 수 있다. */ });

    return () => { active = false; };
  }, []));

  const run = async (task, preview) => {
    setStageList(stages(preview?.kind));
    setAnalyzing(true);
    setStage(0);

    timer.current = setInterval(
      () => setStage((s) => Math.min(s + 1, STAGES.length - 1)),
      preview?.kind === "image" ? 4000 : 2500
    );

    try {
      const { documentId, view, analysis, sourceKind } = await task();

      setPendingDocumentId(null);
      setCapturedPhoto(null);
      setPhotos([]);
      setAttachments([]);
      setTextMode(false);
      setText("");

      navigation.navigate("AIAnalysis", {
        documentId,
        view,
        analysis,
        preview: {
          ...preview,
          kind: sourceKind || preview?.kind
        }
      });
    } catch (e) {
      setPendingDocumentId(e.documentId || null);
      showError(e.message);
    } finally {
      clearInterval(timer.current);
      setAnalyzing(false);
    }
  };

  const addPhotos = (assets) => {
    if (!assets?.length) return;

    const newPhotos = assets.map((asset) => ({
      ...asset,
      localId: `photo-${photoIdCounter.current++}`,
    }));

    setPhotos((current) => [...current, ...newPhotos]);
  };

  const useAndroidPhoto = (photo) => {
    setAndroidCamera(null);

    if (!photo?.uri) return;

    addPhotos([
      {
        uri: photo.uri,
        mimeType: "image/jpeg",
        fileName: `camera-${Date.now()}.jpg`,
      },
    ]);
  };

  const movePhoto = (index, direction) => {
    setPhotos((current) => {
      const target = index + direction;

      if (target < 0 || target >= current.length) {
        return current;
      }

      const updated = [...current];

      [updated[index], updated[target]] =
        [updated[target], updated[index]];

      return updated;
    });
  };


  const pickCamera = async () => {
    if (IS_WEB) {
      return showError(
        "사진 촬영은 휴대폰 앱에서만 사용할 수 있어요."
      );
    }

    if (cameraBusy.current) return;

    cameraBusy.current = true;

    try {
      if (Platform.OS === "android") {
        // 기존 개발 빌드에 카메라 모듈이 없다면
        // 다른 문서 추가 기능은 계속 사용할 수 있도록 한다.
        if (!requireOptionalNativeModule("ExpoCamera")) {
          Alert.alert(
            "카메라를 사용할 수 없어요",
            "새 Android 앱 빌드를 설치하거나 앨범에서 사진을 선택해 주세요."
          );
          return;
        }

        const camera = require("expo-camera");

        const permission =
          await camera.Camera.requestCameraPermissionsAsync();

        if (!permission.granted) {
          Alert.alert(
            "카메라 권한이 필요해요",
            "설정에서 카메라 권한을 허용해 주세요."
          );
          return;
        }

        if (navigation.isFocused()) {
          setAndroidCamera({
            View: camera.CameraView,
          });
        }

        return;
      }

      // Android 이외 환경에서는 기존 사진 촬영 흐름 유지
      const permission =
        await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        return showError("카메라 권한이 필요해요.");
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.length > 0) {
        setCapturedPhoto(result.assets[0]);
      }
    } catch (error) {
      Alert.alert(
        "카메라를 열지 못했어요",
        "다시 시도하거나 앨범에서 사진을 선택해 주세요."
      );
    } finally {
      cameraBusy.current = false;
    }
  };


  const pickLibrary = async () => {
    if (!IS_WEB) {
      const perm =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!perm.granted) {
        return showError("사진 접근 권한이 필요해요.");
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.length > 0) {
      addPhotos(result.assets);
    }
  };

  const pickPdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true
    });

    if (!r.canceled) {
      run(
        () => analyzeFile(r.assets[0]),
        {
          kind: "pdf",
          name: r.assets[0].name
        }
      );
    }
  };

  const addAttachments = (selected) => {
    if (selected.some((asset) => !attachmentMimeType(asset.name))) {
      showError("PDF, JPG, PNG, WebP 파일만 첨부할 수 있습니다.");
      return;
    }

    const next = [...attachments, ...selected];

    if (next.length > 3) {
      showError("첨부 파일은 최대 3개까지 선택할 수 있습니다.");
      return;
    }

    const totalSize = next.reduce(
      (sum, asset) => sum + (asset.size ?? 0),
      0
    );

    if (totalSize > 15 * 1024 * 1024) {
      showError("전체 첨부 파일 용량은 15MB 이하이어야 합니다.");
      return;
    }

    setAttachments(next);
  };

  const pickAttachments = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
      ],
      multiple: true,
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    addAttachments(result.assets);
  };

  const pickAttachmentPhotos = async () => {
    if (!IS_WEB) {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showError("사진 접근 권한이 필요합니다.");
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const selected = result.assets.map((asset) => {
      const originalName =
        asset.fileName ?? asset.file?.name ?? asset.name;

      let name = originalName;

      if (!attachmentMimeType(name) && asset.mimeType === "image/jpeg") {
        name = `attachment-photo-${++photoIdCounter.current}.jpg`;
      }

      if (!name) {
        const extension =
          asset.mimeType === "image/png" ? "png" :
          asset.mimeType === "image/webp" ? "webp" : "jpg";

        name = `attachment-photo-${++photoIdCounter.current}.${extension}`;
      }

      return { ...asset, name };
    });

    addAttachments(selected);
  };

  const handlePick = (m) => {
    if (m.id === "camera") return pickCamera();
    if (m.id === "library") return pickLibrary();
    if (m.id === "pdf") return pickPdf();
    if (m.id === "text") return setTextMode(true);
  };

  if (analyzing) {
    return (
      <ScreenSurface style={[styles.safe, styles.center]}>
        <ActivityIndicator size="large" color={colors.stamp} />
        <Text style={styles.analyzingText}>
          {stageList[stage]}
        </Text>
      </ScreenSurface>
    );
  }

  if (capturedPhoto) {
    return (
      <ScreenSurface style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.container}>

          <Text style={type.h1}>촬영한 사진 확인</Text>

          <Text style={styles.subtitle}>
            공지 내용이 잘 보이는지 확인해주세요.
          </Text>

          <Image
            source={{ uri: capturedPhoto.uri }}
            style={{
              width: "100%",
              height: 420,
              borderRadius: 16,
              backgroundColor: "#F0F0F0",
              marginBottom: 20,
            }}
            resizeMode="contain"
          />

          <PrimaryButton
            label="사진 목록에 추가하기"
            tone="stamp"
            onPress={() => {
              addPhotos([capturedPhoto]);
              setCapturedPhoto(null);
            }}
          />

          <View style={{ height: 12 }} />

          <PrimaryButton
            label="다시 찍기"
            onPress={pickCamera}
          />

          <Pressable
            onPress={() => setCapturedPhoto(null)}
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>
              취소하고 돌아가기
            </Text>
          </Pressable>

        </ScrollView>
      </ScreenSurface>
    );
  }

  if (photos.length > 0) {
    return (
      <ScreenSurface style={styles.safe} edges={["top"]}>
        {androidCamera && (
          <AndroidDocumentCamera
            CameraView={androidCamera.View}
            onClose={() => setAndroidCamera(null)}
            onUsePhoto={useAndroidPhoto}
          />
        )}
        <ScrollView contentContainerStyle={styles.container}>

          <Text style={type.h1}>사진 순서 확인</Text>

          <Text style={styles.subtitle}>
            위에서부터 1페이지, 2페이지 순서로 분석됩니다.
          </Text>

          {photos.map((photo, index) => (
            <View key={photo.localId} style={styles.photoRow}>

              <Image
                source={{ uri: photo.uri }}
                style={styles.photoThumbnail}
                resizeMode="cover"
              />

              <View style={styles.photoInfo}>

                <Text style={styles.photoTitle}>
                  {index + 1}페이지
                </Text>

                <View style={styles.photoActions}>
                  <Pressable
                    disabled={index === 0}
                    onPress={() => movePhoto(index, -1)}
                  >
                    <Text
                      style={[
                        styles.photoActionText,
                        index === 0 && { color: colors.muted },
                      ]}
                    >
                      ↑ 앞으로
                    </Text>
                  </Pressable>

                  <Pressable
                    disabled={index === photos.length - 1}
                    onPress={() => movePhoto(index, 1)}
                  >
                    <Text
                      style={[
                        styles.photoActionText,
                        index === photos.length - 1 &&
                          { color: colors.muted },
                      ]}
                    >
                      ↓ 뒤로
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() =>
                      setPhotos((current) =>
                        current.filter(
                          (item) => item.localId !== photo.localId
                        )
                      )
                    }
                  >
                    <Text style={{ color: colors.alert }}>
                      삭제
                    </Text>
                  </Pressable>
                </View>

              </View>
            </View>
          ))}

          <View style={{ height: 12 }} />

          <PrimaryButton
            label="사진 촬영하여 추가"
            tone="stamp"
            onPress={pickCamera}
          />

          <View style={{ height: 12 }} />

          <PrimaryButton
            label="앨범에서 사진 추가"
            onPress={pickLibrary}
          />

          <View style={{ height: 24 }} />

          {/* 사진 1장과 여러 장 모두 분석할 수 있도록 수정 */}
          <PrimaryButton
            label={
              photos.length === 1
                ? "이 사진으로 분석하기"
                : `${photos.length}장의 사진 분석하기`
            }
            tone="stamp"
            disabled={photos.length > 5}
            onPress={() =>
              run(
                () =>
                  photos.length === 1
                    ? analyzeFile(photos[0])
                    : analyzeImages(photos),
                {
                  kind: "image",
                  uri: photos[0].uri,
                }
              )
            }
          />

          <Pressable
            onPress={() => setPhotos([])}
            style={styles.backLink}
          >
            <Text style={styles.backLinkText}>
              사진 목록 비우고 돌아가기
            </Text>
          </Pressable>

        </ScrollView>
      </ScreenSurface>
    );
  }

  if (textMode) {
    const len = text.trim().length;
    const ready = len >= 10;

    return (
      <ScreenSurface style={styles.safe} edges={["top"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
          >
            {/* 상단: 아이콘 + 제목 */}
            <View style={styles.textHeader}>
              <View style={[styles.iconBox, { backgroundColor: colors.goldSoft }]}>
                <Ionicons
                  name="clipboard"
                  size={22}
                  color={colors.gold}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.textTitle}>
                  텍스트 붙여넣기
                </Text>
                <Text style={styles.rowDesc}>
                  공지문을 복사해서 그대로 붙여넣어 주세요
                </Text>
              </View>
            </View>

            {/* 입력 카드 */}
            <View
              style={[
                styles.inputCard,
                focused && styles.inputCardFocused
              ]}
            >
              <GlassTint radius={24} />

              <TextInput
                style={styles.input}
                multiline
                value={text}
                onChangeText={setText}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="여기에 공지 내용을 붙여넣으세요"
                placeholderTextColor={colors.muted}
                textAlignVertical="top"
              />

              <View style={styles.inputFooter}>
                {text.length > 0 ? (
                  <Pressable
                    onPress={() => setText("")}
                    hitSlop={8}
                    style={styles.inlineBtn}
                  >
                    <Ionicons
                      name="close-circle"
                      size={16}
                      color={colors.muted}
                    />
                    <Text style={styles.inlineBtnText}>
                      지우기
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => setText(SAMPLE_NOTICE)}
                    hitSlop={8}
                    style={styles.inlineBtn}
                  >
                    <Ionicons
                      name="sparkles"
                      size={16}
                      color={colors.stamp}
                    />
                    <Text
                      style={[
                        styles.inlineBtnText,
                        { color: colors.stamp }
                      ]}
                    >
                      예시 공지로 채우기
                    </Text>
                  </Pressable>
                )}

                <Text style={styles.counter}>
                  {len}자
                </Text>
              </View>
            </View>

            <View style={{ marginBottom: spacing.lg }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: colors.ink,
                  marginBottom: spacing.sm,
                }}
              >
                첨부 파일 ({attachments.length}/3)
              </Text>

              {attachments.map((asset, index) => (
                <View
                  key={`${asset.name}-${index}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: spacing.md,
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: radius.md,
                    marginBottom: spacing.sm,
                  }}
                >
                  <Ionicons
                    name={
                      attachmentMimeType(asset.name) === "application/pdf"
                        ? "document-text-outline"
                        : "image-outline"
                    }
                    size={22}
                    color={colors.stamp}
                  />

                  <Text
                    numberOfLines={2}
                    style={{
                      flex: 1,
                      marginHorizontal: spacing.sm,
                      color: colors.ink,
                    }}
                  >
                    {asset.name}
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${asset.name} 삭제`}
                    onPress={() =>
                      setAttachments((current) =>
                        current.filter((_, i) => i !== index)
                      )
                    }
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={24}
                      color={colors.alert}
                    />
                  </Pressable>
                </View>
              ))}

              <PrimaryButton
                label="PDF·사진 파일 첨부하기"
                disabled={attachments.length >= 3}
                onPress={pickAttachments}
              />

              <PrimaryButton
                label="앨범에서 사진 추가하기"
                disabled={attachments.length >= 3}
                onPress={pickAttachmentPhotos}
                style={{ marginTop: spacing.sm }}
              />
            </View>

            {/* 도움말 */}
            <View style={styles.tipBox}>
              <Ionicons
                name="bulb"
                size={16}
                color={colors.stamp}
              />
              <Text style={styles.tipText}>
                신청 기간 · 제출 서류 · 제출 방법이 들어 있으면 더 정확하게 분석해요.
              </Text>
            </View>

            <PrimaryButton
              label={
                !ready
                  ? "10자 이상 입력해 주세요"
                  : attachments.length > 0
                    ? "본문 및 첨부 파일 분석하기"
                    : "분석하기"
              }
              tone="stamp"
              disabled={!ready}
              onPress={() =>
                run(
                  () =>
                    attachments.length > 0
                      ? analyzeWithAttachments(text, attachments)
                      : analyzeText(text),
                  { kind: "text" }
                )
              }
            />

            {pendingDocumentId && (
              <PrimaryButton
                label="저장된 원문으로 다시 분석"
                tone="stamp"
                style={{ marginTop: spacing.sm }}
                onPress={() =>
                  run(
                    () => retryDocument(pendingDocumentId),
                    { kind: "text" }
                  )
                }
              />
            )}

            <Pressable
              onPress={() => setTextMode(false)}
              style={styles.backLink}
              hitSlop={8}
            >
              <Text style={styles.backLinkText}>
                다른 방법으로 추가하기
              </Text>
            </Pressable>

          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenSurface>
    );
  }

  return (
    <ScreenSurface style={styles.safe} edges={["top"]}>
      {androidCamera && (
        <AndroidDocumentCamera
          CameraView={androidCamera.View}
          onClose={() => setAndroidCamera(null)}
          onUsePhoto={useAndroidPhoto}
        />
      )}

      <ScrollView contentContainerStyle={styles.container}>

        <Text style={type.h1}>문서 추가하기</Text>

        <Text style={styles.subtitle}>
          사진·PDF·텍스트로 문서를 추가할 수 있어요
        </Text>

        {pendingDocumentId && (
          <View style={{ marginBottom: spacing.lg }}>
            <PrimaryButton
              label="저장된 원문으로 다시 분석"
              tone="stamp"
              onPress={() =>
                run(
                  () => retryDocument(pendingDocumentId),
                  { kind: "text" }
                )
              }
            />
          </View>
        )}

        <View style={styles.list}>
          {INPUT_METHODS.map((m) => (
            <MethodRow
              key={m.id}
              m={m}
              onPress={() => handlePick(m)}
            />
          ))}
        </View>

      </ScrollView>
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
  },

  center: {
    alignItems: "center",
    justifyContent: "center",
  },

  container: {
    ...pageContent,
    padding: spacing.lg,
  },

  subtitle: {
    ...type.body,
    color: colors.muted,
    marginTop: 4,
    marginBottom: spacing.xl,
  },

  list: {
    gap: spacing.sm,
  },

  row: {
    ...glass,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: glass.backgroundColor,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: glass.borderColor,
  },

  rowUnavailable: {
    backgroundColor: colors.paper,
    shadowOpacity: 0,
    elevation: 0,
  },

  rowPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },

  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },

  rowText: {
    flex: 1,
    gap: 2,
  },

  rowLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },

  rowDesc: {
    fontSize: 13,
    color: colors.muted,
  },

  analyzingText: {
    ...type.body,
    marginTop: spacing.md,
    color: colors.muted,
  },

  textHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },

  textTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.3,
  },

  inputCard: {
    ...glass,
    backgroundColor: glass.backgroundColor,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: glass.borderColor,
    padding: spacing.md,
    marginBottom: spacing.md,
  },

  inputCardFocused: {
    borderColor: colors.stamp,
  },

  input: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
    minHeight: 240,
    padding: 0,
  },

  inputFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
  },

  inlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  inlineBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.muted,
  },

  counter: {
    fontSize: 12,
    color: colors.muted,
  },

  tipBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    backgroundColor: colors.stampSoft,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },

  tipText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.ink,
  },

  backLink: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },

  backLinkText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
    textDecorationLine: "underline",
  },

  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    marginBottom: 12,
  },

  photoThumbnail: {
    width: 80,
    height: 105,
    borderRadius: 8,
    backgroundColor: "#F0F0F0",
  },

  photoInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "center",
    gap: 16,
  },

  photoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },

  photoActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
  },

  photoActionText: {
    fontSize: 13,
    color: colors.stamp,
  },
});
