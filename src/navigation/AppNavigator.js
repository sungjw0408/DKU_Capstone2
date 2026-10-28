import React, { useEffect } from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "../theme/theme";

import MainTabs from "./MainTabs";
import DocumentAddScreen from "../screens/DocumentAddScreen";
import AIAnalysisScreen from "../screens/AIAnalysisScreen";
import EvidenceCheckScreen from "../screens/EvidenceCheckScreen";
import ActionPlanScreen from "../screens/ActionPlanScreen";
import ManagementScreen from "../screens/ManagementScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import OnboardingModal from "../components/OnboardingModal";
import { startDeadlineNotifications } from "../services/notifications";

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

const screenOptions = {
  headerStyle: { backgroundColor: colors.paper },
  headerShadowVisible: false,
  headerTintColor: colors.ink,
  headerTitleStyle: { fontWeight: "700" },
  contentStyle: { backgroundColor: colors.paper },
};

export default function AppNavigator() {
  // 로그인한 동안 마감 알림을 켜 둔다 (로그아웃하면 이 화면이 사라지면서 예약 알림도 지움)
  useEffect(() => startDeadlineNotifications((data) => {
    // 알림을 누르면 그 문서의 관리 화면으로
    if (data.documentId && navigationRef.isReady()) {
      navigationRef.navigate("Management", { documentId: data.documentId, documentTitle: data.documentTitle });
    }
  }), []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={screenOptions}
        initialRouteName={__DEV__ && process.env.EXPO_PUBLIC_PREVIEW_SCREEN === "action-plan" ? "ActionPlan" : "Tabs"}
      >
        <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
        <Stack.Screen name="DocumentAdd" component={DocumentAddScreen} options={{ title: "문서 추가" }} />
        <Stack.Screen name="AIAnalysis" component={AIAnalysisScreen} options={{ title: "AI 분석 결과" }} />
        <Stack.Screen name="EvidenceCheck" component={EvidenceCheckScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ActionPlan" component={ActionPlanScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Management" component={ManagementScreen} options={{ title: "등록 후 관리" }} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "알림" }} />
      </Stack.Navigator>
      <OnboardingModal />
    </NavigationContainer>
  );
}
