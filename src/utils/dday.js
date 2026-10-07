// D-day 색 기준 (홈·계획·관리 화면 공통)
// 남은 날짜: 지남 회색 / 6일 이내 빨강 / 13일 이내 노랑 / 그 이상 초록
import { colors } from "../theme/theme";

export function ddayTone(daysLeft) {
  if (daysLeft == null) return "neutral";
  if (daysLeft < 0) return "neutral";
  if (daysLeft <= 6) return "alert";
  if (daysLeft <= 13) return "gold";
  return "green";
}

// 배지 바탕색·글자색 (공통 Badge 부품과 같은 색 조합)
export const DDAY_COLORS = {
  alert: { bg: colors.alertSoft, fg: colors.alert },
  gold: { bg: colors.goldSoft, fg: colors.gold },
  green: { bg: colors.greenSoft, fg: colors.green },
  neutral: { bg: colors.line, fg: colors.muted },
};