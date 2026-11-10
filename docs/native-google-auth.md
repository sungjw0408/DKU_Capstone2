# Android / iOS Google 인증

작업 브랜치: `feature/native-google-auth`.

Firebase JS SDK를 유지하고 네이티브 Google SDK로 받은 ID 토큰을
`GoogleAuthProvider.credential`에 전달한다. 웹 팝업 인증과 기존 화면 디자인,
백엔드 토큰 검증·Firestore 경로·보안 규칙은 유지한다.

## 연결한 흐름

- 로그인: Google 계정 선택 → `signInWithCredential` → 기존 프로필/소속 화면.
- 게스트 연결: `linkWithCredential`로 같은 UID를 유지한다. 이미 다른 UID에
  연결된 Google 계정은 기존 웹과 같이 거부하고 게스트 세션·데이터를 유지한다.
- 탈퇴 재인증: 현재 계정에 `reauthenticateWithCredential` 후 Firebase ID 토큰을
  강제 갱신한다. 다른 계정을 선택하면 실패하며 기존 탈퇴 API를 호출하지 않는다.
- 계정 선택 취소, 중복 요청, 선택 도중 세션 변경, Google Play 서비스 오류를 처리한다.
- Firebase/AsyncStorage가 로그인 상태를 관리한다. Google SDK의 임시 선택 상태는
  정리하되 `revokeAccess`로 Google 계정 권한을 철회하지 않는다.
- 추가 Google API 권한이나 오프라인 접근·서버 인증 코드를 요청하지 않는다.

## 의존성과 실행 방식

- `@react-native-google-signin/google-signin` **13.2.0**: 이 버전의 공식 peer 조건은
  Expo >=50. 현재 Expo 51 / React Native 0.74를 유지하기 위해 버전을 고정했다.
- `expo-dev-client` **~4.0.29**, `expo-constants` **~16.0.2**: Expo 51에 맞는 버전.
- 네이티브 Google SDK가 없는 Expo Go에서는 해당 SDK를 지연 로드하고 버튼을
  비활성화한다. 기존 이메일/게스트 인증의 앱 초기화는 유지한다.
- Google 인증은 **개발 빌드 또는 설치형 앱**에서 확인해야 한다. Metro 번들 성공이
  네이티브 빌드나 실제 Google 로그인의 성공을 의미하지 않는다.

## Firebase 등록 준비

Firebase에는 기존 웹 앱 `DocDoc`과 함께 Android/iOS 앱을
`com.actiondoc.ttokdoc` 식별자로 등록했다. Android 개발 인증서 SHA-1 등록과
로컬 iOS OAuth 클라이언트 ID 입력도 진행했다. 다른 개발 환경에서는 아래
절차에 따라 실제 빌드의 인증서와 로컬 환경변수를 확인해야 한다.

| 설정 | 기본값 / 입력 위치 |
|---|---|
| Firebase 프로젝트 | `actiondoc-agent` |
| Android package | `com.actiondoc.ttokdoc` (`TTOKDOC_ANDROID_PACKAGE`로 변경 가능) |
| iOS Bundle ID | `com.actiondoc.ttokdoc` (`TTOKDOC_IOS_BUNDLE_IDENTIFIER`로 변경 가능) |
| 웹 OAuth ID | 기존 Google 제공업체의 공개 ID를 기본값으로 사용 |
| iOS OAuth ID | `.env`의 `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` |

1. Firebase 프로젝트 설정에서 위 식별자로 Android/iOS 앱을 각각 등록한다.
2. Android 앱에는 **실제로 설치할 빌드의 서명 인증서 SHA-1**을 추가한다.
   개발 빌드와 출시/Play 서명은 인증서가 다를 수 있어 각각 등록해야 한다.
3. iOS 등록 후 `GoogleService-Info.plist`의 `CLIENT_ID`를 위 환경변수에 입력한다.
   `app.config.js`가 이를 뒤집은 URL scheme을 플러그인에 전달한다.
4. 기존 웹 OAuth 클라이언트와 동일한 Google Cloud 프로젝트인지 확인한다.
5. 설정 변경 후 개발 앱을 다시 빌드한다. 앱 식별자/URL scheme 변경은
   웹 새로고침이나 Metro 새로고침만으로 적용되지 않는다.

Firebase 인증에는 기존 **JS SDK**를 사용하므로 네이티브 Firebase SDK와 서비스
계정 JSON은 추가하지 않는다. Google Sign-In 플러그인은 iOS URL scheme을
명시하는 방식으로 사용하며 `google-services.json`/plist를 빌드에 포함하지 않는다.
Google OAuth 클라이언트 ID는 공개 설정값이다. 클라이언트 보안 비밀번호,
서비스 계정 키, 사용자 토큰은 앱 설정이나 저장소에 넣지 않는다.

## 개발 앱 실행

Android SDK와 에뮬레이터/실기기, iOS용 Xcode와 CocoaPods를 먼저 준비한다.
`npm run web`은 웹 서버를 실행한다. `npm run android`와 `npm run ios`는
네이티브 앱을 빌드·설치하며, 아래 `*:dev` 명령은 설정 형식 검사도 먼저 실행한다.
Android 네이티브 프로젝트는 로컬에서 생성했고 `android/`, `ios/`는 Git에서 제외한다.

```sh
# 설정 형식만 검사 (실제 Firebase 등록·SHA-1까지 검증하지는 않음)
node scripts/check-native-google-config.cjs android
node scripts/check-native-google-config.cjs ios

# 처음 또는 네이티브 설정 변경 시 개발 앱 빌드 및 설치
npm run android:dev
npm run ios:dev

# 이미 설치한 개발 앱에서 JS만 다시 실행
npm run start:dev -- --port 8082
```

네이티브 앱에서도 백엔드는 `.env`의 `EXPO_PUBLIC_API_URL`을 사용한다.
실기기에서 `localhost:8000`은 컴퓨터가 아닌 전화기 자신이므로, 배포된 HTTPS
백엔드 또는 접근 가능한 컴퓨터 주소를 사용한다.

## 검증

프런트 단위 검사 64개가 통과했다. 초기 정적 확인에서는 JavaScript 파일 75개
구문 검사와 웹/iOS/Android Metro 번들 생성 HTTP 200을 확인했고, Expo 설정에서
Google 반환 URL scheme이 생성되는 것도 확인했다.

2026년 11월 5일 사용자가 Android 가상 기기에서 앱 실행과 실제 Google 로그인
완료를 확인했다. iOS는 로컬 OAuth 설정 형식 검사를 통과했지만 Xcode 네이티브
빌드와 실제 로그인 확인은 남아 있다. 게스트 연결과 탈퇴 재인증은 단위 검사로
확인했으며, 모바일의 실제 계정 흐름 전체가 검증된 것으로 간주하지 않는다.

2026년 11월 6일 최신 `develop`의 PR #21 UI 변경을 병합한 뒤 프런트 단위 검사
64개, JavaScript 파일 71개 구문 검사, 웹/iOS/Android Expo 내보내기가 통과했다.
Google Sign-In과 `expo-linear-gradient`를 함께 포함한 Android arm64 디버그 앱도
Gradle `assembleDebug` 빌드에 성공했다. 이 병합 검증에는 실제 계정 로그인·삭제와
iOS Xcode 네이티브 빌드는 포함하지 않았다.

`node --test tests/*.test.mjs`에서 네이티브 SDK와 Firebase를 대체한 단위 검사를
실행한다. 취소/충돌 시 세션 보존, 동일 UID 연결, 잘못된 계정 재인증 거부,
토큰 갱신, 설정 누락과 Expo Go 안전한 초기화를 검사한다. 실제 계정이나 DB에
접근하지 않는다.

실제 계정 테스트는 사용자가 다음 순서로 진행한다.

1. Android와 iOS에서 기존 Google 계정 로그인 → 기존 문서/일정 확인.
2. 새 Google 계정 로그인 → 기존 소속 선택 화면 → 홈 진입.
3. 게스트 계정에 새 Google 계정 연결 → UID 및 문서/일정 유지.
4. 이미 가입된 Google 계정으로 연결 시도 / 선택 취소 → 게스트 유지.
5. 로그아웃·앱 재실행·다른 계정 선택 확인.
6. 삭제 가능한 계정만 사용해 탈퇴 시 잘못된 Google 계정 선택은 거부되고,
   올바른 계정 재인증 후에만 삭제가 진행되는지 확인.

## 변경 파일

- 인증: `src/services/googleAuth.native.js`, `src/utils/googleAccountFlow.js`,
  `src/utils/authForm.js`.
- 기존 연결부: `src/services/auth.js`, `src/services/googleAuth.web.js`의 안내값 export,
  `src/screens/AuthScreens.js`의 비활성 버튼 접근성 안내. 화면 레이아웃 변경은 없다.
- 앱 설정/실행: `app.config.js`, `config/nativeGoogle.cjs`,
  `scripts/check-native-google-config.cjs`, `.env.example`, `.gitignore`,
  `package.json`, `package-lock.json`.
- 검사/문서: `tests/nativeGoogleAuth.test.mjs`, `docs/auth.md`, 이 문서.

참고:
- [Expo Google 인증](https://docs.expo.dev/guides/google-authentication/)
- [Google Sign-In Expo 설정](https://react-native-google-signin.github.io/docs/setting-up/expo)
- [Google Sign-In API](https://react-native-google-signin.github.io/docs/original)
- [Firebase credential 로그인](https://firebase.google.com/docs/auth/web/google-signin)
