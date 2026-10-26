// 홈·내 문서는 탭으로 유지하고 추가·달력·세부 화면은 루트 스택에서 연다.
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import BottomNavigation from "../components/BottomNavigation";
import HomeScreen from "../screens/HomeScreen";

const Tab = createBottomTabNavigator();

function SlimTabBar({ state, navigation }) {
  const select = (name) => {
    const route = state.routes.find((item) => item.name === name);
    if (!route) return;
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented && state.routes[state.index].key !== route.key) {
      navigation.navigate(route.name);
    }
  };

  return <BottomNavigation activeScreen={state.routes[state.index].name}
    onHome={() => select("Home")}
    onAddDocument={() => navigation.navigate("DocumentAdd")}
    onDocuments={() => select("Documents")} />;
}

export default function MainTabs() {
  return <Tab.Navigator initialRouteName="Home" backBehavior="firstRoute"
    screenOptions={{ headerShown: false }} tabBar={(props) => <SlimTabBar {...props} />}>
    <Tab.Screen name="Home" component={HomeScreen} options={{ title: "홈" }} />
    <Tab.Screen name="Documents" component={HomeScreen} options={{ title: "내 문서" }} />
  </Tab.Navigator>;
}
