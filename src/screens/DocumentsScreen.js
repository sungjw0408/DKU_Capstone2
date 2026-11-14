import React, { useRef } from "react";
import { StyleSheet } from "react-native";
import { useScrollToTop } from "@react-navigation/native";
import ScreenSurface from "../components/ScreenSurface";
import DocumentListPanel from "../components/DocumentListPanel";
import { colors } from "../theme/theme";

export default function DocumentsScreen() {
  const scroll = useRef(null);
  useScrollToTop(scroll);

  return <ScreenSurface style={styles.safe} edges={["top"]}>
    <DocumentListPanel scrollRef={scroll} />
  </ScreenSurface>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
});
