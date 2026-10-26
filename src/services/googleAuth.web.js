import { browserPopupRedirectResolver, GoogleAuthProvider, linkWithPopup, reauthenticateWithPopup, signInWithPopup } from "firebase/auth";
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

export async function linkGuestGoogleAccount(user) {
  if (!user?.isAnonymous) throw new Error("게스트로 이용 중일 때 Google 계정을 연결할 수 있어요.");
  try {
    // 새 계정으로 로그인하지 않고 현재 게스트 UID에 로그인 수단만 추가한다.
    return (await linkWithPopup(user, provider(), browserPopupRedirectResolver)).user;
  } catch (error) {
    if (["auth/credential-already-in-use", "auth/email-already-in-use", "auth/account-exists-with-different-credential"].includes(error.code)) {
      throw Object.assign(new Error("Google 계정 연결 충돌"), { code: "auth/guest-google-account-in-use" });
    }
    throw error;
  }
}

export async function confirmGoogleAccount(user) {
  // 다른 Google 계정을 선택하면 Firebase가 user-mismatch로 거부한다.
  await reauthenticateWithPopup(user, provider(), browserPopupRedirectResolver);
  await user.getIdToken(true);
}
