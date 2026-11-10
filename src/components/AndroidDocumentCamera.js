import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, Modal, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import PrimaryButton from "./PrimaryButton";
import { Text } from "./Typography";
import { colors, radius, spacing, type } from "../theme/theme";

export default function AndroidDocumentCamera({ CameraView, onClose, onUsePhoto }) {
  const camera = useRef(null);
  const capturing = useRef(false);
  const [active, setActive] = useState(AppState.currentState === "active");
  const [ready, setReady] = useState(false);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [facing, setFacing] = useState("back");
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const updateAppState = (state) => {
      if (state !== "active") setReady(false);
      setActive(state === "active");
    };
    const subscription = AppState.addEventListener("change", updateAppState);
    updateAppState(AppState.currentState);
    return () => subscription.remove();
  }, []);

  const takePhoto = async () => {
    const view = camera.current;
    if (!active || !ready || !view || capturing.current) return;
    capturing.current = true;
    setTakingPhoto(true);
    try {
      const picture = await view.takePictureAsync({ quality: 0.8 });
      if (camera.current !== view || AppState.currentState !== "active") return;
      if (!picture?.uri) throw new Error("Camera returned no photo");
      setReady(false);
      setPhoto(picture);
    } catch {
      if (camera.current === view && AppState.currentState === "active") {
        setReady(false);
        setError("사진을 찍지 못했어요. 카메라를 다시 열어 주세요.");
      }
    } finally {
      capturing.current = false;
      setTakingPhoto(false);
    }
  };

  const switchCamera = () => {
    setReady(false);
    setFacing((current) => current === "back" ? "front" : "back");
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="카메라 닫기" onPress={onClose} style={styles.iconButton}>
            <Ionicons name="close" size={24} color={colors.ink} />
          </Pressable>
          <Text style={type.h2}>{photo ? "촬영한 사진 확인" : "문서 촬영"}</Text>
          <View style={styles.iconButton}>
            {!photo && !error && (
              <Pressable accessibilityRole="button" accessibilityLabel="앞뒤 카메라 전환" disabled={!ready || takingPhoto}
                onPress={switchCamera} style={styles.iconButton}>
                <Ionicons name="camera-reverse-outline" size={24} color={ready && !takingPhoto ? colors.ink : colors.muted} />
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.preview}>
          {photo ? (
            <Image accessibilityLabel="촬영한 문서 사진" source={{ uri: photo.uri }} resizeMode="contain" style={StyleSheet.absoluteFill} />
          ) : active && !error ? (
            <>
              <CameraView ref={camera} facing={facing} mode="picture" style={StyleSheet.absoluteFill}
                onCameraReady={() => setReady(true)}
                onMountError={() => { setReady(false); setError("카메라를 열지 못했어요. 권한을 확인하고 다시 시도해 주세요."); }} />
              {!ready && <ActivityIndicator accessibilityLabel="카메라 준비 중" color="#FFFFFF" />}
            </>
          ) : null}
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </View>

        {photo ? (
          <View style={styles.actions}>
            <PrimaryButton label="다시 찍기" onPress={() => setPhoto(null)} style={styles.flex} />
            <PrimaryButton label="사진 사용하기" tone="stamp" onPress={() => onUsePhoto(photo)} style={styles.flex} />
          </View>
        ) : (
          <PrimaryButton label={error ? "카메라 다시 열기" : takingPhoto ? "촬영 중…" : "촬영하기"}
            tone="stamp" disabled={!active || (!error && (!ready || takingPhoto))}
            onPress={error ? () => setError("") : takePhoto} />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, padding: spacing.md, gap: spacing.md },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  preview: { flex: 1, backgroundColor: colors.ink, borderRadius: radius.lg, overflow: "hidden", justifyContent: "center" },
  error: { ...type.body, color: "#FFFFFF", textAlign: "center", padding: spacing.lg },
  actions: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
});
