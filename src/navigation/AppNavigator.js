import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { colors } from "../theme/theme";

import MainTabs from "./MainTabs";
import DocumentAddScreen from "../screens/DocumentAddScreen";
import AIAnalysisScreen from "../screens/AIAnalysisScreen";
import EvidenceCheckScreen from "../screens/EvidenceCheckScreen";
import ActionPlanScreen from "../screens/ActionPlanScreen";
import ManagementScreen from "../screens/ManagementScreen";

const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: colors.paper },
  headerShadowVisible: false,
  headerTintColor: colors.ink,
  headerTitleStyle: { fontWeight: "700" },
  contentStyle: { backgroundColor: colors.paper },
};

// 구조
// 루트 Stack
//  ├─ Tabs (하단 탭: 홈 / 캘린더 / ➕ / 할 일 / 설정)
//  └─ 문서 추가 → AI 분석 → 원문 근거 → 준비 계획 → 등록 후 관리
//     이어지는 화면은 탭 위에 쌓이고, 쌓인 동안에는 탭 바가 가려진다.
//     뒤로 가면 출발했던 탭으로 돌아간다.
export default function AppNavigator() {
  return (
    <NavigationContainer>
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
