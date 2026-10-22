import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { confirmAccountIdentity, createAccount, currentAuthUser, leaveAccount, loginAccount, loginGoogleAccount, loginGuestAccount, observeAuth } from "../services/auth";
import { deleteOwnAccount, ensureGuestProfile, getProfileState, saveProfile } from "../services/profileApi";
import { registerWithProfile } from "../utils/accountFlow";
import { authErrorMessage } from "../utils/authForm";

const AuthContext = createContext(null);
const initial = { user: null, profile: null, loading: true, error: "", draftSelection: null, pendingDeletion: false };

const profileSession = (user, result) => ({ ...initial, user, profile: result.profile,
  pendingDeletion: !!result.accountDeletionPending, loading: false });

async function loadProfileState(user) {
  const result = await getProfileState(user);
  if (user.isAnonymous && !result.profile && !result.accountDeletionPending) {
    return { ...result, profile: await ensureGuestProfile(user) };
  }
  return result;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(initial);
  const [busy, setBusy] = useState(false);
  const operation = useRef(false);
  const generation = useRef(0);

  const restore = useCallback(async (user) => {
    const version = ++generation.current;
    setSession({ ...initial, user });
    if (!user) {
      setSession({ ...initial, loading: false });
      return;
    }
    try {
      const result = await loadProfileState(user);
      if (generation.current === version) setSession(profileSession(user, result));
    } catch (error) {
      if (error.status === 401 || ["auth/user-token-expired", "auth/user-disabled", "auth/user-not-found"].includes(error.code)) {
        await leaveAccount().catch(() => {});
        if (generation.current === version) setSession({ ...initial, loading: false });
        return;
      }
      if (generation.current === version) setSession({ ...initial, user, loading: false, error: authErrorMessage(error) });
    }
  }, []);

  useEffect(() => {
    const unsubscribe = observeAuth((user) => { if (!operation.current) restore(user); }, (error) => {
      setSession({ ...initial, loading: false, error: authErrorMessage(error) });
    });
    return () => { ++generation.current; unsubscribe(); };
  }, [restore]);

  useEffect(() => {
    if (!session.pendingDeletion || !session.user || busy) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const result = await getProfileState(session.user);
        if (active && !result.accountDeletionPending) setSession(profileSession(session.user, result));
      } catch (error) {
        if (active && (error.status === 401 || ["auth/user-token-expired", "auth/user-not-found"].includes(error.code))) {
          await leaveAccount().catch(() => {});
          if (active) setSession({ ...initial, loading: false });
        }
      }
    }, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [session.pendingDeletion, session.user, busy]);

  const run = async (task) => {
    if (operation.current) throw new Error("처리 중이에요. 잠시 기다려 주세요.");
    operation.current = true;
    ++generation.current;
    setBusy(true);
    try { return await task(); }
    finally { operation.current = false; setBusy(false); }
  };

  const login = (email, password) => run(async () => {
    const user = await loginAccount(email, password);
    try {
      const result = await getProfileState(user);
      setSession(profileSession(user, result));
    } catch (error) {
      setSession({ ...initial, user, loading: false, error: error.message });
    }
  });

  const loginGuest = () => run(async () => {
    const user = await loginGuestAccount();
    try {
      setSession(profileSession(user, await loadProfileState(user)));
    } catch (error) {
      // 계정 생성 후 연결 실패 시 같은 UID로 저장만 재시도한다.
      setSession({ ...initial, user, loading: false, error: authErrorMessage(error) });
    }
  });

  const loginGoogle = () => run(async () => {
    // 클릭 직후 팝업을 열 수 있도록 다른 비동기 작업을 먼저 하지 않는다.
    const user = await loginGoogleAccount();
    try {
      setSession(profileSession(user, await getProfileState(user)));
    } catch (error) {
      if (error.status === 401) {
        await leaveAccount().catch(() => {});
        setSession({ ...initial, loading: false, error: authErrorMessage(error) });
        return;
      }
      // Google 계정은 유지하고, 기존 소속 저장·재조회 화면에서 복구한다.
      setSession({ ...initial, user, loading: false, error: authErrorMessage(error) });
    }
  });

  const register = (email, password, selection) => run(async () => {
    const result = await registerWithProfile({ createAccount, saveProfile }, { email, password, selection });
    setSession({ ...initial, user: result.user, profile: result.profile, loading: false,
      draftSelection: result.needsProfile ? selection : null,
      error: result.needsProfile ? "계정은 생성됐지만 소속 정보가 저장되지 않았어요. 아래에서 다시 저장해 주세요." : "" });
  });

  const completeProfile = (selection) => run(async () => {
    const user = currentAuthUser();
    if (!user) throw new Error("다시 로그인해 주세요.");
    const profile = await saveProfile(user, selection);
    setSession({ ...initial, user, profile, loading: false });
  });

  const backToLogin = () => run(async () => {
    await leaveAccount();
    setSession({ ...initial, loading: false });
  });

  const deleteAccount = (password) => run(async () => {
    const user = currentAuthUser();
    if (!user) throw new Error("다시 로그인해 주세요.");
    await confirmAccountIdentity(user, password);
    try {
      await deleteOwnAccount(user);
    } catch (error) {
      if (error.code === "account-deleting" || !error.status) {
        setSession({ ...initial, user, loading: false, pendingDeletion: true, error: error.message });
      }
      throw error;
    }
    await leaveAccount().catch(() => {});
    setSession({ ...initial, loading: false });
  });

  return <AuthContext.Provider value={{ ...session, busy, login, loginGoogle, loginGuest, register, completeProfile, backToLogin, logout: backToLogin, deleteAccount,
    retryProfile: () => restore(currentAuthUser()) }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
