// 알림함 (홈 오른쪽 위 🔔): 앞으로 보낼 마감·할 일 알림을 날짜별로 보여 준다.
// 누르면 그 문서의 관리 화면으로 간다. 알림이 꺼져 있으면 설정으로 안내한다.
import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Card from "../components/Card";
import { colors, spacing, type } from "../theme/theme";
import { getUpcomingReminders, isNotificationEnabled, notificationsSupported, permissionStatus } from "../services/notifications";

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function dayLabel(date) {
  const today = new Date();
  const diff = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate())
    - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  const base = `${date.getMonth() + 1}월 ${date.getDate()}일 (${"일월화수목금토"[date.getDay()]})`;
  return diff === 0 ? `오늘 · ${base}` : diff === 1 ? `내일 · ${base}` : base;
}
const timeLabel = (d) => `${d.getHours() < 12 ? "오전" : "오후"} ${d.getHours() % 12 || 12}:${pad(d.getMinutes())}`;

export default function NotificationsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("on"); // on | off | unsupported

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const [list, enabled, permission] = await Promise.all([
          getUpcomingReminders(),
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
  }, []));

  // 날짜별로 묶기
  const groups = [];
  for (const item of items) {
    const key = dayKey(item.date);
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, date: item.date, list: [] });
    groups[groups.length - 1].list.push(item);
  }

  const open = (item) => {
    if (item.data?.documentId) {
      navigation.navigate("Management", { documentId: item.data.documentId, documentTitle: item.data.documentTitle });
    } else {
      navigation.navigate("Tabs", { screen: "Todos" });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container}>
        {status !== "on" && !loading && (
          <Card style={styles.notice}>
            <Ionicons name="notifications-off-outline" size={20} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>
                {status === "unsupported" ? "웹에서는 알림이 오지 않아요" : "알림이 꺼져 있어요"}
              </Text>
              <Text style={type.small}>
                {status === "unsupported" ? "휴대폰 앱에서 아래 일정에 맞춰 알림을 받을 수 있어요." : "설정에서 켜면 아래 일정에 맞춰 알려 드려요."}
              </Text>
            </View>
            {status === "off" && (
              <Pressable accessibilityRole="button" onPress={() => navigation.navigate("Tabs", { screen: "Settings" })} hitSlop={8}>
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
            <Text style={type.bodyStrong}>예정된 알림이 없어요</Text>
            <Text style={[type.small, { textAlign: "center" }]}>문서의 준비 계획을 등록하면{"\n"}마감 전에 알림이 예약돼요.</Text>
          </Card>
        ) : (
          groups.map((group) => (
            <View key={group.key} style={styles.section}>
              <Text style={styles.sectionTitle}>{dayLabel(group.date)}</Text>
              <Card style={styles.listCard}>
                {group.list.map((item, idx) => (
                  <Pressable key={item.id} accessibilityRole="button" onPress={() => open(item)}
                    style={({ pressed }) => [styles.row, idx > 0 && styles.divider, pressed && styles.pressed]}>
                    <Ionicons name={item.data?.kind === "deadline" ? "alarm-outline" : "checkbox-outline"} size={20}
                      color={item.data?.kind === "deadline" ? colors.alert : colors.stamp} />
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
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
