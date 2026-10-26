import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../contexts/AuthContext";
import { AuthLoading } from "../components/AuthFields";
import { AccountDeletionScreen, CompleteProfileScreen, GuestSetupScreen, LoginScreen, SignUpScreen } from "../screens/AuthScreens";
import AppNavigator from "./AppNavigator";

const Stack = createNativeStackNavigator();

export default function AuthGate() {
  const { loading, user, profile, pendingDeletion } = useAuth();
  if (loading) return <AuthLoading />;
  if (user && pendingDeletion) return <AccountDeletionScreen />;
  if (user?.isAnonymous) return profile ? <AppNavigator /> : <GuestSetupScreen />;
  // Google 연결 직후 남아 있는 게스트 프로필은 소속 저장이 끝난 회원 프로필이 아니다.
  const hasMemberProfile = profile?.accountType !== "guest" && !!profile?.collegeId && !!profile?.departmentId;
  if (user) return hasMemberProfile ? <AppNavigator /> : <CompleteProfileScreen />;
  return <NavigationContainer>
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
    </Stack.Navigator>
  </NavigationContainer>;
}
