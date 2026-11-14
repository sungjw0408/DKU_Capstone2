import React, { useCallback, useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors, gradients } from "../theme/theme";

import MainTabs from "./MainTabs";
import DocumentAddScreen from "../screens/DocumentAddScreen";
import AIAnalysisScreen from "../screens/AIAnalysisScreen";
import EvidenceCheckScreen from "../screens/EvidenceCheckScreen";
import ActionPlanScreen from "../screens/ActionPlanScreen";
import ManagementScreen from "../screens/ManagementScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import SettingsScreen from "../screens/SettingsScreen";
import AccountSettingsScreen from "../screens/AccountSettingsScreen";
import OnboardingModal from "../components/OnboardingModal";
import { startDeadlineNotifications } from "../services/notifications";
import useReducedMotion from "../hooks/useReducedMotion";
import { useAuth } from "../contexts/AuthContext";
import { notificationRoute } from "./routes";

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

const screenOptions = {
  headerStyle: { backgroundColor: colors.paper },
  headerBackground: () => <LinearGradient colors={gradients.header} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />,
  headerShadowVisible: false,
  headerTintColor: colors.ink,
  headerTitleStyle: { fontFamily: "WantedSans-Bold", fontWeight: "normal" },
  contentStyle: { backgroundColor: colors.paper },
};

// Native stack reserves space for a custom background even when its header is hidden.
const hiddenHeaderOptions = { headerShown: false, headerBackground: undefined };

export default function AppNavigator() {
  const reducedMotion = useReducedMotion();
  const { user } = useAuth();
  const uid = user?.uid;
  const pendingRoute = useRef(null);
  const openPendingRoute = useCallback(() => {
    if (!pendingRoute.current || !navigationRef.isReady()) return;
    const { name, params } = pendingRoute.current;
    pendingRoute.current = null;
    navigationRef.navigate(name, params);
  }, []);

  useEffect(() => {
    if (!uid) return;
    const stop = startDeadlineNotifications(uid, (data) => {
      pendingRoute.current = notificationRoute(data);
      openPendingRoute();
    });
    return () => { pendingRoute.current = null; stop(); };
  }, [uid, openPendingRoute]);

  return (
    <NavigationContainer ref={navigationRef} onReady={openPendingRoute}>
      <Stack.Navigator
        screenOptions={{ ...screenOptions, animation: reducedMotion ? "none" : "slide_from_right", animationDuration: 280 }}
        initialRouteName={__DEV__ && process.env.EXPO_PUBLIC_PREVIEW_SCREEN === "action-plan" ? "ActionPlan" : "Tabs"}
      >
        <Stack.Screen name="Tabs" component={MainTabs} options={hiddenHeaderOptions} />
        <Stack.Screen name="DocumentAdd" component={DocumentAddScreen} options={{ title: "문서 추가" }} />
        <Stack.Screen name="AIAnalysis" component={AIAnalysisScreen} options={{ title: "AI 분석 결과" }} />
        <Stack.Screen name="EvidenceCheck" component={EvidenceCheckScreen} options={hiddenHeaderOptions} />
        <Stack.Screen name="ActionPlan" component={ActionPlanScreen} options={hiddenHeaderOptions} />
        <Stack.Screen name="Management" component={ManagementScreen} options={{ title: "등록 후 관리" }} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "알림" }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ ...hiddenHeaderOptions, title: "설정" }} />
        <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} options={{ ...hiddenHeaderOptions, title: "계정 관리" }} />
      </Stack.Navigator>
      <OnboardingModal />
    </NavigationContainer>
  );
}
