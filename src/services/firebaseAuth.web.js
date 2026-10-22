import { browserLocalPersistence, getAuth, indexedDBLocalPersistence, initializeAuth } from "firebase/auth";
import { app } from "./firebase";

function initialize() {
  try { return initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] }); }
  catch (error) {
    if (error.code === "auth/already-initialized") return getAuth(app);
    throw error;
  }
}

export const auth = initialize();
