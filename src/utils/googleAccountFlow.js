const LINK_CONFLICTS = ["auth/credential-already-in-use", "auth/email-already-in-use", "auth/account-exists-with-different-credential"];

export function googleFlowError(code) {
  return Object.assign(new Error(code), { code });
}

// 네이티브 계정 선택과 Firebase 인증을 분리해 취소·계정 변경·연결 충돌을 검사한다.
export function createGoogleAccountFlow({ requestCredential, getCurrentUser, signIn, link, reauthenticate }) {
  let inProgress = false;
  const run = async (task) => {
    if (inProgress) throw googleFlowError("auth/google-in-progress");
    inProgress = true;
    try { return await task(); }
    finally { inProgress = false; }
  };
  const checkSession = (uid) => {
    if ((getCurrentUser()?.uid || null) !== uid) throw googleFlowError("auth/google-session-changed");
  };
  const checkUser = (user) => {
    if (!user) throw googleFlowError("auth/google-session-changed");
    checkSession(user.uid);
  };

  return {
    login: () => run(async () => {
      const uid = getCurrentUser()?.uid || null;
      const credential = await requestCredential();
      checkSession(uid);
      return (await signIn(credential)).user;
    }),
    linkGuest: (guest) => run(async () => {
      checkUser(guest);
      if (!guest.isAnonymous) throw googleFlowError("auth/google-guest-required");
      const credential = await requestCredential();
      checkUser(guest);
      if (!guest.isAnonymous) throw googleFlowError("auth/google-session-changed");
      try { return (await link(guest, credential)).user; }
      catch (error) {
        if (LINK_CONFLICTS.includes(error.code)) throw googleFlowError("auth/guest-google-account-in-use");
        throw error;
      }
    }),
    confirm: (user) => run(async () => {
      checkUser(user);
      const credential = await requestCredential(user.email);
      checkUser(user);
      // Firebase가 다른 Google 계정의 credential을 user-mismatch로 거부한다.
      await reauthenticate(user, credential);
      await user.getIdToken(true);
    }),
  };
}
