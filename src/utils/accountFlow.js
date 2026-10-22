// 계정 생성과 프로필 저장은 별도 서비스이므로 중간 실패 때 생성된 계정을 다시 만들지 않는다.
export async function registerWithProfile({ createAccount, saveProfile }, { email, password, selection }) {
  const user = await createAccount(email, password);
  try { return { user, profile: await saveProfile(user, selection), needsProfile: false }; }
  catch (error) { return { user, profile: null, needsProfile: true, error }; }
}
