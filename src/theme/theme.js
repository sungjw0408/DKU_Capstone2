export const colors = {
  ink: "#202225",
  paper: "#F3F3F4",
  surface: "#FFFFFF",
  hero: "#E8E9EB",
  line: "#E2E3E6",
  muted: "#5B6068",
  subtle: "#EFF0F2",
  overlay: "rgba(32,34,37,0.35)",
  shadow: "#252930",

  stamp: "#2852CB",
  stampSoft: "#EEF2FC",

  alert: "#A23442",
  alertSoft: "#F8E9EA",

  gold: "#936A34", // 진행중
  goldSoft: "#F1EBDD",

  green: "#28766B", // 여유 있음 (초록)
  greenSoft: "#E0EEEA",
};

export const evidenceReviewColors = { ink: "#8D2330", border: "#C34C59", surface: "#FBE0E3" };

export const confidenceColor = (pct) => {
  if (pct >= 90) return colors.stamp;
  if (pct >= 70) return colors.gold;
  return colors.alert;
};

export const type = {
  display: { fontSize: 26, fontWeight: "700", color: colors.ink, letterSpacing: -0.3 },
  h1: { fontSize: 20, fontWeight: "700", color: colors.ink },
  h2: { fontSize: 16, fontWeight: "700", color: colors.ink },
  body: { fontSize: 14, fontWeight: "400", color: colors.ink, lineHeight: 20 },
  bodyStrong: { fontSize: 14, fontWeight: "600", color: colors.ink },
  small: { fontSize: 12, fontWeight: "400", color: colors.muted },
  label: { fontSize: 11, fontWeight: "600", color: colors.muted, letterSpacing: 0.2 },
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const gradients = {
  glass: ["#FFFFFF", "#FFFFFF"],
  header: ["#E8E9EB", "#E8E9EB"],
  action: ["#315DD8", "#2852CB"],
};

export const glass = {
  backgroundColor: colors.surface,
  borderWidth: 1, borderColor: colors.line,
};
export const dialogGlass = { ...glass, backgroundColor: colors.surface };
export const inputSurface = "#F7F7F8";
export const pageContent = {
  width: "100%", maxWidth: 960, alignSelf: "center", paddingBottom: 112,
};
