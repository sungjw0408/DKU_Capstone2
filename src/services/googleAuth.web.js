import { browserPopupRedirectResolver, GoogleAuthProvider, reauthenticateWithPopup, signInWithPopup } from "firebase/auth";
import { auth } from "./firebaseAuth";

export const googleSignInAvailable = true;

function provider() {
  const google = new GoogleAuthProvider();
  google.setCustomParameters({ prompt: "select_account" });
  return google;
}

export async function loginGoogleAccount() {
  // initializeAuth는 기존 로그인 유지 설정을 사용하고, 팝업에 필요한 resolver만 명시한다.
  return (await signInWithPopup(auth, provider(), browserPopupRedirectResolver)).user;
}

export async function confirmGoogleAccount(user) {
  // 다른 Google 계정을 선택하면 Firebase가 user-mismatch로 거부한다.
  await reauthenticateWithPopup(user, provider(), browserPopupRedirectResolver);
  await user.getIdToken(true);
}
