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
  if (user?.isAnonymous && !profile) return <GuestSetupScreen />;
  if (user) return profile ? <AppNavigator /> : <CompleteProfileScreen />;
  return <NavigationContainer>
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
    </Stack.Navigator>
  </NavigationContainer>;
}
