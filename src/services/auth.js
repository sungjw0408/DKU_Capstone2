import { createUserWithEmailAndPassword, EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, signInAnonymously, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebaseAuth";
import { confirmGoogleAccount } from "./googleAuth";

export { googleSignInAvailable, loginGoogleAccount } from "./googleAuth";

export const observeAuth = (next, error) => onAuthStateChanged(auth, next, error);
export const currentAuthUser = () => auth.currentUser;
export const createAccount = async (email, password) => (await createUserWithEmailAndPassword(auth, email.trim(), password)).user;
export const loginAccount = async (email, password) => (await signInWithEmailAndPassword(auth, email.trim(), password)).user;
export const loginGuestAccount = async () => (await signInAnonymously(auth)).user;
export const leaveAccount = () => signOut(auth);

export const usesGoogleAccount = (user) => !user?.isAnonymous && !!user?.providerData?.some((provider) => provider.providerId === "google.com");

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
