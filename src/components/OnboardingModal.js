// 첫 실행 안내 (3장). 처음 로그인했을 때 한 번 뜨고, 설정 → 앱 소개 다시 보기로 다시 볼 수 있다.
import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, ScrollView, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import PrimaryButton from "./PrimaryButton";
import { colors, radius, spacing, type } from "../theme/theme";
import { finishOnboarding, onShowOnboarding, shouldShowOnboarding } from "../services/onboarding";

const PAGES = [
  {
    icon: "document-text-outline",
    title: "공지를 넣으면\n해야 할 일이 보여요",
    body: "PDF, 사진, 복사한 글 무엇이든 가운데 ➕로 올리면 신청 대상, 마감일, 제출 서류를 정리해 드려요.",
  },
  {
    icon: "search-outline",
    title: "원문에서\n근거를 확인해요",
    body: "AI가 찾은 정보가 원문 어디에 있는지 형광펜으로 보여 주고, 확실하지 않으면 ‘확인 필요’로 알려 드려요.",
  },
  {
    icon: "notifications-outline",
    title: "마감까지\n챙겨 드려요",
    body: "마감일에서 거꾸로 준비 계획을 세우고, D-3·D-1·당일에 알림을 보내 드려요.",
  },
];

export default function OnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [page, setPage] = useState(0);
  const scroll = useRef(null);
  const { width } = useWindowDimensions();
  const pageWidth = Math.min(width, 480);

  useEffect(() => {
    let active = true;
    shouldShowOnboarding().then((show) => { if (active && show) setVisible(true); });
    const off = onShowOnboarding(() => { setPage(0); setVisible(true); });
    return () => { active = false; off(); };
  }, []);

  const close = () => {
    finishOnboarding();
    setVisible(false);
    setPage(0);
  };

  const goTo = (index) => {
    setPage(index);
    scroll.current?.scrollTo({ x: index * pageWidth, animated: true });
  };

  const last = page === PAGES.length - 1;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={close}>
      <SafeAreaView style={styles.safe}>
        <View style={[styles.frame, { width: pageWidth }]}>
          <View style={styles.topRow}>
            {!last ? (
              <Pressable accessibilityRole="button" onPress={close} hitSlop={8}>
                <Text style={styles.skip}>건너뛰기</Text>
              </Pressable>
            ) : <View />}
          </View>

          <ScrollView
            ref={scroll}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / pageWidth))}
            scrollEventThrottle={16}
            style={{ flexGrow: 0 }}
          >
            {PAGES.map((item) => (
              <View key={item.title} style={[styles.page, { width: pageWidth }]}>
                <View style={styles.iconCircle}>
                  <Ionicons name={item.icon} size={44} color={colors.stamp} />
                </View>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.dots}>
            {PAGES.map((item, index) => (
              <Pressable key={item.title} accessibilityRole="button" accessibilityLabel={`${index + 1}번째 안내`}
                onPress={() => goTo(index)} hitSlop={6}>
                <View style={[styles.dot, page === index && styles.dotOn]} />
              </Pressable>
            ))}
          </View>

          <View style={styles.bottom}>
            <PrimaryButton tone="stamp" label={last ? "시작하기" : "다음"} onPress={() => (last ? close() : goTo(page + 1))} />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper, alignItems: "center" },
  frame: { flex: 1 },
  topRow: { height: 48, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", paddingHorizontal: spacing.lg },
  skip: { ...type.bodyStrong, color: colors.muted },
  page: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, alignItems: "center" },
  iconCircle: {
    width: 104, height: 104, borderRadius: 52, backgroundColor: colors.stampSoft,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.xl,
  },
  title: { ...type.display, textAlign: "center", lineHeight: 34, marginBottom: spacing.md },
  body: { ...type.body, color: colors.muted, textAlign: "center", fontSize: 15, lineHeight: 22 },
  dots: { flexDirection: "row", justifyContent: "center", gap: spacing.sm, marginTop: spacing.xl },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: colors.line },
  dotOn: { width: 22, backgroundColor: colors.stamp },
  bottom: { marginTop: "auto", padding: spacing.lg },
});
