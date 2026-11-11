import React from "react";
import { ActivityIndicator, View } from "react-native";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AuthGate from "./src/navigation/AuthGate";
import { AuthProvider } from "./src/contexts/AuthContext";

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    "WantedSans-Regular": require("./assets/fonts/WantedSans-Regular.otf"),
    "WantedSans-Medium": require("./assets/fonts/WantedSans-Medium.otf"),
    "WantedSans-SemiBold": require("./assets/fonts/WantedSans-SemiBold.otf"),
    "WantedSans-Bold": require("./assets/fonts/WantedSans-Bold.otf"),
    "WantedSans-ExtraBold": require("./assets/fonts/WantedSans-ExtraBold.otf"),
  });
  if (fontError) throw fontError;
  if (!fontsLoaded) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator accessibilityLabel="글꼴 불러오는 중" />
    </View>;
  }
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
