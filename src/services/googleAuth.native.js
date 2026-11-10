import Constants from "expo-constants";
import { Platform, TurboModuleRegistry } from "react-native";
import { GoogleAuthProvider, linkWithCredential, reauthenticateWithCredential, signInWithCredential } from "firebase/auth";
import { auth } from "./firebaseAuth";
import { createGoogleAccountFlow, googleFlowError } from "../utils/googleAccountFlow";

const config = Constants.expoConfig?.extra?.googleSignIn || {};
const clientIdPattern = /^[\w-]+\.apps\.googleusercontent\.com$/;
// Expo Go에서 정적 import하면 이메일·게스트 인증까지 실행되지 않으므로 모듈 유무부터 확인한다.
const hasNativeModule = !!TurboModuleRegistry.get("RNGoogleSignin");
export const googleSignInAvailable = hasNativeModule && clientIdPattern.test(config.webClientId || "")
  && (Platform.OS !== "ios" || clientIdPattern.test(config.iosClientId || ""));
export const googleSignInUnavailableReason = "현재 앱에서 Google 로그인을 사용할 수 없어요. 이메일 또는 게스트로 시작해 주세요.";

let sdk;
function getSdk() {
  if (!hasNativeModule) throw googleFlowError("auth/google-native-unavailable");
  if (!googleSignInAvailable) throw googleFlowError("auth/google-configuration-missing");
  if (!sdk) {
    sdk = require("@react-native-google-signin/google-signin");
    sdk.GoogleSignin.configure({
      webClientId: config.webClientId,
      ...(Platform.OS === "ios" ? { iosClientId: config.iosClientId } : {}),
      offlineAccess: false,
    });
  }
  return sdk;
}

async function requestCredential(loginHint) {
  const { GoogleSignin, statusCodes } = getSdk();
  try {
    if (Platform.OS === "android") await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Firebase 세션은 유지하면서 이전 Google 계정을 자동으로 선택하지 않게 한다.
    await GoogleSignin.signOut();
    const result = await GoogleSignin.signIn(loginHint ? { loginHint } : {});
    if (result.type === "cancelled") throw googleFlowError("auth/google-cancelled");
    if (result.type !== "success" || !result.data?.idToken) throw googleFlowError("auth/google-token-missing");
    return GoogleAuthProvider.credential(result.data.idToken);
  } catch (error) {
    if (error.code === statusCodes.SIGN_IN_CANCELLED) throw googleFlowError("auth/google-cancelled");
    if (error.code === statusCodes.IN_PROGRESS) throw googleFlowError("auth/google-in-progress");
    if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw googleFlowError("auth/google-play-services-unavailable");
    if (["10", "DEVELOPER_ERROR"].includes(String(error.code))) throw googleFlowError("auth/google-configuration-missing");
    throw error;
  } finally {
    // 로그인 유지는 기존 Firebase/AsyncStorage에 맡긴다. Google 연결 권한은 철회하지 않는다.
    await GoogleSignin.signOut().catch(() => {});
  }
}

const flow = createGoogleAccountFlow({
  requestCredential,
  getCurrentUser: () => auth.currentUser,
  signIn: (credential) => signInWithCredential(auth, credential),
  link: linkWithCredential,
  reauthenticate: reauthenticateWithCredential,
});

export const loginGoogleAccount = flow.login;
export const linkGuestGoogleAccount = flow.linkGuest;
export const confirmGoogleAccount = flow.confirm;
