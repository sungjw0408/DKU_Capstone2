// 탭 구조에서 공통으로 쓰는 화면 이동.
// 홈은 루트 스택의 "Tabs" 안에 있는 탭이라, 홈으로 갈 때는 Tabs의 Home 탭을 가리켜야 한다.
export const HOME_ROUTE = { name: "Tabs", params: { screen: "Home" } };

// 쌓인 화면(분석 → 계획 → 관리 …)을 모두 걷어내고 홈 탭만 남긴다.
export function resetToHome(navigation) {
  navigation.reset({ index: 0, routes: [HOME_ROUTE] });
}

// 뒤로 갈 화면이 있으면 뒤로, 없으면(웹 새로고침 등) 홈 탭으로.
export function backOrHome(navigation) {
  if (navigation.canGoBack()) navigation.goBack();
  else resetToHome(navigation);
}
