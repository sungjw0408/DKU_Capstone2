import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Keyboard, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "./Typography";
import GlassTint from "./GlassTint";
import useReducedMotion from "../hooks/useReducedMotion";
import { colors, glass, gradients } from "../theme/theme";

const items = {
  Home: ["홈", "home-outline", "home"],
  Calendar: ["캘린더", "calendar-outline", "calendar"],
  AddDocument: ["문서 추가", "add", "add"],
  Todos: ["할 일", "checkbox-outline", "checkbox"],
  Documents: ["문서", "documents-outline", "documents"],
};
const nativeDriver = Platform.OS !== "web";

function TabButton({ route, selected, navigation, reducedMotion }) {
  const [label, icon, selectedIcon] = items[route.name];
  const add = route.name === "AddDocument";
  const selection = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducedMotion) { selection.setValue(selected ? 1 : 0); return; }
    const animation = Animated.timing(selection, {
      toValue: selected ? 1 : 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver,
    });
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, selected, selection]);

  const animatePress = (value) => {
    pressScale.stopAnimation();
    if (reducedMotion) { pressScale.setValue(1); return; }
    Animated.spring(pressScale, {
      toValue: value, damping: 22, stiffness: 320, mass: 0.65, overshootClamping: true, useNativeDriver: nativeDriver,
    }).start();
  };
  const onPress = () => {
    if (add) return navigation.navigate("DocumentAdd");
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!selected && !event.defaultPrevented) navigation.navigate(route.name);
  };

  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={add ? undefined : { selected }} aria-current={selected && !add ? "page" : undefined} onPress={onPress}
    onPressIn={() => animatePress(0.94)} onPressOut={() => animatePress(1)}
    onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
    style={({ pressed }) => [styles.item, reducedMotion && pressed && { opacity: 0.7 }]}>
    <Animated.View style={[styles.itemContent, {
      opacity: selection.interpolate({ inputRange: [0, 1], outputRange: [0.83, 1] }),
      transform: [{ scale: Animated.multiply(pressScale, selection.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] })) }],
    }]}>
      {add ? <LinearGradient colors={gradients.action} style={styles.add}>
        <Ionicons name="add" size={30} color="#FFFFFF" />
      </LinearGradient> : <>
        <Ionicons name={selected ? selectedIcon : icon} size={23} color={selected ? colors.stamp : colors.ink} />
        <Text style={[styles.label, { color: selected ? colors.stamp : colors.ink }]}>{label}</Text>
      </>}
    </Animated.View>
  </Pressable>;
}

export default function FloatingTabs({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [barWidth, setBarWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const positioned = useRef(false);
  const itemWidth = Math.max(0, (barWidth - 16 - (state.routes.length - 1) * 4) / state.routes.length);

  useEffect(() => {
    if (!barWidth) return;
    const target = 7 + state.index * (itemWidth + 4);
    indicatorX.stopAnimation();
    if (!positioned.current || reducedMotion) {
      positioned.current = true;
      indicatorX.setValue(target);
      return;
    }
    const animation = Animated.spring(indicatorX, {
      toValue: target, damping: 26, stiffness: 250, mass: 0.85,
      overshootClamping: true, useNativeDriver: nativeDriver,
    });
    animation.start();
    return () => animation.stop();
  }, [barWidth, indicatorX, itemWidth, reducedMotion, state.index]);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  if (keyboardOpen) return null;
  return <View pointerEvents="box-none" style={[styles.dock, { bottom: Math.max(insets.bottom, 14) }]}>
    <View style={styles.bar} onLayout={event => setBarWidth(event.nativeEvent.layout.width)}>
      <GlassTint radius={32} />
      {barWidth > 0 && <Animated.View pointerEvents="none" style={[styles.indicator, {
        width: itemWidth, transform: [{ translateX: indicatorX }],
      }]} />}
      {state.routes.map((route, index) => <TabButton key={route.key} route={route}
        selected={state.index === index} navigation={navigation} reducedMotion={reducedMotion} />)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  dock: { position: "absolute", left: 0, right: 0, alignItems: "center", paddingHorizontal: 16 },
  bar: { ...glass, width: "100%", maxWidth: 600, borderRadius: 32, padding: 7, flexDirection: "row", gap: 4,
    backgroundColor: "#FAFAFB", shadowColor: colors.shadow, shadowOpacity: 0.1, shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  item: { flex: 1, minHeight: 55, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  itemContent: { width: "100%", minHeight: 55, alignItems: "center", justifyContent: "center", gap: 4 },
  indicator: { position: "absolute", top: 7, bottom: 7, left: 0, borderRadius: 25,
    backgroundColor: colors.stampSoft },
  add: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.stamp, shadowColor: colors.stamp, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  label: { fontSize: 11, fontWeight: "600" },
});
