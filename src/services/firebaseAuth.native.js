import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { app } from "./firebase";

function initialize() {
  try { return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) }); }
  catch (error) {
    if (error.code === "auth/already-initialized") return getAuth(app);
    throw error;
  }
}

export const auth = initialize();
