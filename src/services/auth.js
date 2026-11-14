import { createUserWithEmailAndPassword, EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, reload, sendEmailVerification, sendPasswordResetEmail, signInAnonymously, signInWithEmailAndPassword, signOut, updatePassword } from "firebase/auth";
import { auth } from "./firebaseAuth";
import { confirmGoogleAccount } from "./googleAuth";

export { googleSignInAvailable, googleSignInUnavailableReason, linkGuestGoogleAccount, loginGoogleAccount } from "./googleAuth";

export const observeAuth = (next, error) => onAuthStateChanged(auth, next, error);
export const currentAuthUser = () => auth.currentUser;
export const createAccount = async (email, password) => (await createUserWithEmailAndPassword(auth, email.trim(), password)).user;
export const loginAccount = async (email, password) => (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
export const loginGuestAccount = async () => (await signInAnonymously(auth)).user;
export const leaveAccount = () => signOut(auth);

export const usesGoogleAccount = (user) => !user?.isAnonymous && !!user?.providerData?.some((provider) => provider.providerId === "google.com");
export const usesPasswordAccount = (user) => !user?.isAnonymous && !!user?.providerData?.some((provider) => provider.providerId === "password");

function requireCurrentAccount(user) {
  if (!user || auth.currentUser !== user) {
    throw Object.assign(new Error("로그인 상태가 변경됐어요. 다시 로그인해 주세요."), { code: "auth/session-changed" });
  }
}

export async function changeAccountPassword(user, currentPassword, newPassword) {
  requireCurrentAccount(user);
  if (!usesPasswordAccount(user)) throw new Error("이메일로 가입한 계정에서 비밀번호를 변경할 수 있어요.");
  await confirmAccountPassword(user, currentPassword);
  requireCurrentAccount(user);
  await updatePassword(user, newPassword);
}

export async function sendAccountPasswordReset(user) {
  requireCurrentAccount(user);
  if (!usesPasswordAccount(user) || !user.email) throw new Error("이메일로 가입한 계정에서 비밀번호를 재설정할 수 있어요.");
  await sendPasswordResetEmail(auth, user.email);
}

export async function sendAccountVerification(user) {
  requireCurrentAccount(user);
  if (user.isAnonymous || !user.email) throw new Error("이메일이 있는 계정에서 인증할 수 있어요.");
  if (!user.emailVerified) await sendEmailVerification(user);
}

export async function reloadAccount(user) {
  requireCurrentAccount(user);
  await reload(user);
  await user.getIdToken(true);
  requireCurrentAccount(user);
}

export async function confirmAccountIdentity(user, password) {
  if (!user) throw new Error("다시 로그인해 주세요.");
  if (user.isAnonymous) await user.getIdToken(true);
  else if (usesGoogleAccount(user)) await confirmGoogleAccount(user);
  else await confirmAccountPassword(user, password);
}

export async function confirmAccountPassword(user, password) {
  if (!user?.email) throw new Error("다시 로그인해 주세요.");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  await user.getIdToken(true);
}
