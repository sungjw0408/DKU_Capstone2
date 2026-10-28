// 하단 탭 바: 홈 / 캘린더 / ➕ 문서 추가 / 할 일 / 설정
// 가운데 ➕는 화면이 아니라 버튼이다. 누르면 탭 위에 "문서 추가" 화면을 쌓는다.
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/theme";

import HomeScreen from "../screens/HomeScreen";
import CalendarScreen from "../screens/CalendarScreen";
import TodosScreen from "../screens/TodosScreen";
import SettingsScreen from "../screens/SettingsScreen";

const Tab = createBottomTabNavigator();

const ICONS = {
  Home: ["home", "home-outline"],
  Calendar: ["calendar", "calendar-outline"],
  Todos: ["checkbox", "checkbox-outline"],
  Settings: ["settings", "settings-outline"],
};

// ➕ 탭 자리에 들어가는 빈 화면 (실제로는 열리지 않음)
function AddPlaceholder() {
  return null;
}

// 가운데 크고 둥근 파란 버튼
function AddTabButton({ onPress, style }) {
  return (
    <View style={[style, styles.addSlot]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="문서 추가"
        onPress={onPress}
        hitSlop={6}
        style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
      >
        <Ionicons name="add" size={32} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        headerStyle: { backgroundColor: colors.paper },
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerTitleStyle: { fontWeight: "700" },
        sceneContainerStyle: { backgroundColor: colors.paper },
        tabBarActiveTintColor: colors.stamp,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: styles.label,
        tabBarStyle: styles.bar,
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ focused, color, size }) => {
          const pair = ICONS[route.name];
          return pair ? <Ionicons name={focused ? pair[0] : pair[1]} size={size - 2} color={color} /> : null;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "홈" }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ title: "캘린더", headerShown: true }} />
      <Tab.Screen
        name="AddDocument"
        component={AddPlaceholder}
        options={{ title: "문서 추가", tabBarLabel: () => null, tabBarButton: (props) => <AddTabButton {...props} /> }}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            event.preventDefault(); // 탭을 바꾸지 않고
            navigation.navigate("DocumentAdd"); // 루트 스택에 문서 추가 화면을 쌓는다
          },
        })}
      />
      <Tab.Screen name="Todos" component={TodosScreen} options={{ title: "할 일" }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: "설정" }} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
  },
  label: { fontSize: 11, fontWeight: "600" },
  addSlot: { alignItems: "center", justifyContent: "flex-start" },
  addButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    marginTop: -22, // 탭 바 위로 살짝 솟게
    backgroundColor: colors.stamp,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: colors.surface,
    shadowColor: colors.stamp,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  addButtonPressed: { opacity: 0.85, transform: [{ scale: 0.96 }] },
});
