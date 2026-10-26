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
import CalendarScreen from "../screens/CalendarScreen";
import TodosScreen from "../screens/TodosScreen";
import SettingsScreen from "../screens/SettingsScreen";

const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: colors.paper },
  headerShadowVisible: false,
  headerTintColor: colors.ink,
  headerTitleStyle: { fontWeight: "700" },
  contentStyle: { backgroundColor: colors.paper },
};

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
        <Stack.Screen name="Calendar" component={CalendarScreen} options={{ title: "캘린더" }} />
        <Stack.Screen name="Todos" component={TodosScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
