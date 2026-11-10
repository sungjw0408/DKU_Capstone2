import React, { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import useAffiliations from "../hooks/useAffiliations";
import { compareNoticeAffiliation, createAffiliationMatcher, hasNoticeEligibility } from "../utils/noticeEligibility";
import { colors, spacing, type } from "../theme/theme";
import Badge from "./Badge";
import { Text } from "./Typography";

const BADGES = {
  yes: { label: "내 소속 해당", tone: "green" },
  no: { label: "내 소속 해당 안 됨", tone: "alert" },
  review: { label: "확인 필요", tone: "gold" },
};

export default function NoticeAffiliation({ fields, collegeOrDepartmentOnly = false, style }) {
  const { profile } = useAuth();
  const enabled = hasNoticeEligibility(fields) && (collegeOrDepartmentOnly || !!profile?.departmentId);
  const { catalog, loading, error, retry } = useAffiliations(enabled);
  const matcher = useMemo(() => catalog && createAffiliationMatcher(catalog), [catalog]);
  const result = compareNoticeAffiliation(fields, profile, matcher, { collegeOrDepartmentOnly });
  if (!result) return null;

  const comparing = enabled && loading && !catalog;
  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Text style={styles.title}>내 소속 비교</Text>
        {!comparing && <Badge {...BADGES[result.status]} />}
      </View>
      <Text style={type.small}>{comparing ? "소속을 비교하고 있어요." : result.reason}</Text>
      {!!error && !catalog && (
        <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}>
          <Text style={[type.small, { color: colors.stamp }]}>소속 목록 다시 불러오기</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  title: { fontSize: 16, fontWeight: "700", color: colors.ink },
  retry: { alignSelf: "flex-start", paddingVertical: 4 },
});
