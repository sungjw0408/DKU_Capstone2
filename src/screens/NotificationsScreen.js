import { pageContent } from "../theme/theme";
import { Text } from "../components/Typography";
// 알림함 (홈 오른쪽 위 🔔): 실제로 받은 마감 알림을 최신순으로 보여 준다.
// 누르면 그 문서의 관리 화면으로 간다. 알림이 꺼져 있으면 설정으로 안내한다.
import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { View, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import ScreenSurface from "../components/ScreenSurface";
import { Ionicons } from "@expo/vector-icons";
import Card from "../components/Card";
import { colors, spacing, type } from "../theme/theme";
import { getNotificationHistory, onNotificationHistoryChanged, isNotificationEnabled, notificationsSupported, permissionStatus } from "../services/notifications";
import { notificationRoute } from "../navigation/routes";

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function dayLabel(date) {
  const today = new Date();
  const diff = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate())
    - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  const base = `${date.getMonth() + 1}월 ${date.getDate()}일 (${"일월화수목금토"[date.getDay()]})`;
  return diff === 0 ? `오늘 · ${base}` : diff === -1 ? `어제 · ${base}` : `${date.getFullYear()}년 ${base}`;
}
const timeLabel = (d) => `${d.getHours() < 12 ? "오전" : "오후"} ${d.getHours() % 12 || 12}:${pad(d.getMinutes())}`;

export default function NotificationsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("on"); // on | off | unsupported
  const [reload, setReload] = useState(0);

  useFocusEffect(useCallback(() => onNotificationHistoryChanged(() => setReload((value) => value + 1)), []));

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const [list, enabled, permission] = await Promise.all([
          getNotificationHistory(),
          isNotificationEnabled(),
          notificationsSupported ? permissionStatus() : "unsupported",
        ]);
        if (!active) return;
        setItems(list);
        setStatus(!notificationsSupported ? "unsupported" : enabled && permission === "granted" ? "on" : "off");
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [reload]));

  // 날짜별로 묶기
  const groups = [];
  for (const item of items) {
    const key = dayKey(item.date);
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, date: item.date, list: [] });
    groups[groups.length - 1].list.push(item);
  }

  const open = (item) => {
    const target = notificationRoute(item.data);
    if (target) navigation.navigate(target.name, target.params);
  };

  return (
    <ScreenSurface style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container}>
        {status !== "on" && !loading && (
          <Card style={styles.notice}>
            <Ionicons name="notifications-off-outline" size={20} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>
                {status === "unsupported" ? "웹에서는 알림이 오지 않아요" : "알림이 꺼져 있어요"}
              </Text>
              <Text style={type.small}>
                {status === "unsupported" ? "받은 알림 내역은 알림을 수신한 휴대폰 앱에 저장돼요." : "이전에 받은 알림은 계속 볼 수 있어요. 새 마감 알림을 받으려면 설정에서 켜 주세요."}
              </Text>
            </View>
            {status === "off" && (
              <Pressable accessibilityRole="button" onPress={() => navigation.navigate("Settings")} hitSlop={8}>
                <Text style={[type.bodyStrong, { color: colors.stamp }]}>설정</Text>
              </Pressable>
            )}
          </Card>
        )}

        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

        {loading ? (
          <Card><ActivityIndicator color={colors.stamp} /></Card>
        ) : items.length === 0 ? (
          <Card style={styles.empty}>
            <Ionicons name="notifications-outline" size={32} color={colors.muted} />
            <Text style={type.bodyStrong}>받은 알림이 없어요</Text>
            <Text style={[type.small, { textAlign: "center" }]}>마감 알림이 도착하면{"\n"}여기에 차곡차곡 모아 드려요.</Text>
          </Card>
        ) : (
          groups.map((group) => (
            <View key={group.key} style={styles.section}>
              <Text style={styles.sectionTitle}>{dayLabel(group.date)}</Text>
              <Card style={styles.listCard}>
                {group.list.map((item, idx) => (
                  <Pressable key={item.id} accessibilityRole="button" onPress={() => open(item)}
                    style={({ pressed }) => [styles.row, idx > 0 && styles.divider, pressed && styles.pressed]}>
                    <Ionicons name="alarm-outline" size={20} color={colors.alert} />
                    <View style={{ flex: 1 }}>
                      <Text style={type.bodyStrong} numberOfLines={2}>{item.title}</Text>
                      <Text style={styles.body} numberOfLines={3}>{item.body}</Text>
                    </View>
                    <Text style={styles.time}>{timeLabel(item.date)}</Text>
                  </Pressable>
                ))}
              </Card>
            </View>
          ))
        )}
      </ScrollView>
    </ScreenSurface>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { ...pageContent, padding: spacing.lg, paddingBottom: 112 },
  notice: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg, backgroundColor: colors.goldSoft, borderColor: colors.goldSoft },
  error: { ...type.small, color: colors.alert, marginBottom: spacing.md },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl },
  section: { marginBottom: spacing.lg },
  sectionTitle: { ...type.label, fontSize: 12, marginBottom: spacing.xs },
  listCard: { paddingVertical: spacing.xs },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingVertical: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  body: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 17 },
  time: { fontSize: 12, fontWeight: "600", color: colors.ink },
  pressed: { opacity: 0.6 },
});
