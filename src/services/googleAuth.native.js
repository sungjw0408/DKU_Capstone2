// 모바일은 별도 OAuth 앱 등록과 개발 빌드가 필요하다. 기존 이메일·게스트 인증은 유지한다.
export const googleSignInAvailable = false;

function unavailable() {
  throw new Error("모바일 Google 로그인은 아직 준비 중이에요. 이메일 또는 게스트로 시작해 주세요.");
}

export const loginGoogleAccount = unavailable;
export const linkGuestGoogleAccount = unavailable;
export const confirmGoogleAccount = unavailable;
