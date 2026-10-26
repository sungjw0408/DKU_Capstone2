export function validateCredentials({ email, password, confirmation }, signingUp = false) {
  if (!email.trim()) return "이메일을 입력해 주세요.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "이메일 주소를 확인해 주세요.";
  if (!password) return "비밀번호를 입력해 주세요.";
  if (signingUp && password.length < 6) return "비밀번호는 6자 이상 입력해 주세요.";
  if (signingUp && password !== confirmation) return "비밀번호가 일치하지 않아요.";
  return "";
}

export function authErrorMessage(error) {
  if (["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(error?.code)) return "";
  const messages = {
    "auth/email-already-in-use": "이미 가입된 이메일이에요. 로그인해 주세요.",
    "auth/invalid-email": "이메일 주소를 확인해 주세요.",
    "auth/weak-password": "비밀번호가 보안 기준에 맞지 않아요. 더 긴 비밀번호를 사용해 주세요.",
    "auth/password-does-not-meet-requirements": "비밀번호가 보안 기준에 맞지 않아요. 다른 비밀번호를 입력해 주세요.",
    "auth/invalid-credential": "이메일 또는 비밀번호를 확인해 주세요.",
    "auth/wrong-password": "이메일 또는 비밀번호를 확인해 주세요.",
    "auth/user-not-found": "이메일 또는 비밀번호를 확인해 주세요.",
    "auth/user-disabled": "사용이 중지된 계정이에요.",
    "auth/too-many-requests": "시도가 너무 많아요. 잠시 후 다시 시도해 주세요.",
    "auth/network-request-failed": "인터넷 연결을 확인하고 다시 시도해 주세요.",
    "auth/operation-not-allowed": "선택한 로그인 방식을 사용할 수 없어요. Firebase 로그인 방법에서 해당 방식의 사용 설정을 확인해 주세요.",
    "auth/configuration-not-found": "Firebase 로그인 설정이 아직 완료되지 않았어요.",
    "auth/unauthorized-domain": "현재 앱 주소에서 로그인을 사용할 수 없어요. Firebase 허용 도메인을 확인해 주세요.",
    "auth/popup-blocked": "Google 로그인 창이 차단됐어요. 브라우저에서 팝업을 허용하고 다시 눌러 주세요.",
    "auth/account-exists-with-different-credential": "같은 이메일로 가입한 계정이 있어요. 기존 로그인 방식을 이용해 주세요.",
    "auth/guest-google-account-in-use": "이미 가입된 Google 계정이에요. 게스트 데이터는 그대로 유지돼요. 다른 Google 계정을 선택해 주세요.",
    "auth/user-mismatch": "현재 로그인한 Google 계정을 선택해 주세요.",
    "auth/requires-recent-login": "본인 확인 시간이 지났어요. 다시 확인해 주세요.",
    "auth/invalid-oauth-client-id": "Google 로그인 설정을 확인해 주세요.",
  };
  return messages[error?.code] || (error?.code?.startsWith("auth/")
    ? "로그인 처리에 실패했어요. 잠시 후 다시 시도해 주세요."
    : error?.message || "요청을 처리하지 못했어요. 다시 시도해 주세요.");
}

export function findAffiliation(catalog, collegeId, departmentId) {
  const college = catalog?.colleges.find((item) => item.id === collegeId);
  const department = college?.departments.find((item) => item.id === departmentId);
  return college && department ? { college, department } : null;
}
