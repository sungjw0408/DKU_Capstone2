# 로그인·사용자별 저장·회원 탈퇴

Firebase Authentication이 이메일/비밀번호 계정을 관리한다. 비밀번호는 앱 DB나 백엔드에 저장하지 않는다. 웹은 IndexedDB/localStorage, 모바일은 AsyncStorage로 로그인 상태를 복원한다.

## 설정과 화면

- Firebase 프로젝트 `actiondoc-agent`에서 이메일/비밀번호 로그인을 활성화한다.
- `backend/.env`의 `GCP_PROJECT`, `GOOGLE_APPLICATION_CREDENTIALS`, `STORAGE_BACKEND=firestore`를 유지한다. 서비스 계정 키는 저장소 밖에 둔다.
- 현재 `firestore.rules`는 2026-10-21에 실제 프로젝트에 배포했다. 이전 공용 접근 규칙을 다시 적용하지 않는다.
- 백엔드와 Expo를 실행한다. 실기기는 `EXPO_PUBLIC_API_URL`에 PC의 내부 IP를 지정한다. 새 의존성 설치는 `npm ci`를 사용한다.
- 로그인·프로필 조회가 끝나면 기존 홈 화면으로 이동한다. 가입 시 단과대·학과를 선택한다. 단과대 변경 시 학과가 초기화된다.
- 계정 생성 후 프로필 저장이 실패하면 계정을 유지하고 소속 저장 화면에서 재시도한다. 소속 없는 계정은 재실행해도 이 화면으로 이동한다.
- 홈의 세 줄 메뉴는 오른쪽 사이드바를 연다. 로그아웃은 로그인 화면으로 이동한다. 회원 탈퇴는 삭제 안내와 현재 비밀번호 확인 화면을 연다.
- 기존 화면의 디자인을 유지한다. 마이페이지 본문, 모바일 Google 로그인, 소속 기반 신청 대상 판정은 포함하지 않는다.
- 로그인 화면의 회원가입 링크 아래에 Google 로고와 **Google 계정으로 시작하기** 버튼을 표시한다. 요청에 따라 버튼 높이는 40, 글자는 13, 로고는 18로 줄이고 테두리를 제거했다. `assets/google-g.png`는 [Google 공식 로고 이미지](https://developers.google.com/static/identity/images/g-logo.png)다.

## Google 로그인 — 웹

이번 단계는 사용자가 최종 요청한 웹 로그인 범위다. 기존 Firebase SDK를 사용하며 라이브러리를 설치하지 않았다.

설정:

1. Firebase 콘솔 → `actiondoc-agent` → Authentication → 로그인 방법 → Google에서 사용 설정을 켠다.
2. 프로젝트 지원 이메일을 선택하고 저장한다. Google 계정의 비밀번호나 별도 OAuth 비밀 키를 앱 코드에 입력하지 않는다.
3. Authentication → 설정 → 승인된 도메인에 테스트 주소의 호스트인 `localhost`가 있는지 확인한다. 다른 주소로 접속한다면 해당 호스트도 등록한다. 도메인에는 포트나 전체 URL을 넣지 않는다.
4. 브라우저에서 Google 로그인 팝업을 허용한다.

동작:

- Google 버튼을 누르면 계정 선택 팝업을 열고 Firebase에 로그인한다. 팝업을 닫으면 로그인 화면으로 돌아오며, 중복 요청은 기존 busy 상태로 차단한다.
- 처음 로그인한 계정은 기존 소속 선택 화면에서 단과대·학과를 저장한 뒤 홈으로 이동한다. 이미 프로필이 있는 계정은 홈으로 이동한다.
- 개인 문서·일정은 Google 로그인으로 발급받은 동일한 Firebase UID 아래에 저장한다. 기존 토큰 검증과 사용자별 보안 규칙을 그대로 사용한다.
- 프로필 조회나 저장이 실패해도 Google 계정을 다시 만들지 않고 기존 소속 저장·재조회 화면에서 복구한다. 같은 이메일의 다른 인증 방식과 충돌하면 기존 방식으로 로그인하도록 안내하며 데이터를 임의로 합치지 않는다.
- Google 계정이 연결된 회원은 탈퇴할 때 Google 팝업으로 다시 본인 확인한다. 다른 Google 계정을 선택하면 Firebase가 거부하며, 확인 성공 후 갱신된 ID 토큰으로 기존 탈퇴 API를 호출한다. 서버의 최근 5분 재인증 요구를 유지한다.
- 이메일·비밀번호 회원과 게스트의 기존 로그인·탈퇴 처리는 유지한다. 게스트에서 Google 계정으로 데이터와 함께 전환하는 기능은 이번 범위에 포함하지 않았다.
- Android/iOS에는 웹 전용 팝업 코드를 포함하지 않도록 플랫폼 파일을 분리했다. 모바일 Google 버튼은 비활성이며 이메일·게스트는 계속 사용할 수 있다. 모바일 Google 인증은 앱별 OAuth 등록과 개발 빌드를 갖춘 뒤 별도 구현한다.

참고: [Firebase Google 로그인](https://firebase.google.com/docs/auth/web/google-signin), [Expo 모바일 Google 인증](https://docs.expo.dev/guides/google-authentication/).

이번 변경 파일:

- `src/services/googleAuth.web.js`: Google 팝업 로그인과 재인증. 팝업 resolver를 명시해 기존 Firebase 초기화 설정을 유지한다.
- `src/services/googleAuth.native.js`: 모바일의 웹 팝업 호출 차단과 플랫폼별 기능 구분.
- `src/services/auth.js`, `src/contexts/AuthContext.js`: Google 로그인·프로필 조회·탈퇴 본인 확인 연결.
- `src/screens/AuthScreens.js`: Google 버튼 활성화·진행 상태·요청한 크기 및 테두리 변경.
- `src/components/AccountDeletionForm.js`: Google 회원의 비밀번호 입력을 Google 본인 확인으로 대체.
- `src/utils/authForm.js`: 팝업 취소·차단, 계정 충돌, 다른 Google 계정 선택 오류 안내.
- `backend/app/api/accounts.py`: 재인증 오류 안내를 로그인 방식에 맞는 일반 문구로 변경. 인증 검증 조건은 유지한다.
- `docs/auth.md`: 설정과 검증 범위 안내.

Google 연동 시 개발 도구로는 수정한 프런트 7개 파일과 백엔드 1개 파일의 문법만 확인했다. 아래에 기록한 기존 테스트 통과 수는 Google 연동을 검증한 결과가 아니다. 사용자는 Firebase의 Google 활성화를 완료하고, Google 버튼으로 계정을 생성해 로그인했다고 확인했다. Google 비밀번호는 앱의 이메일·비밀번호 로그인용 비밀번호로 자동 등록되지 않으며, 이후에도 Google 버튼으로 로그인한다. Google 계정 탈퇴 등 나머지 실제 기능 확인은 사용자가 직접 진행한다.

직접 확인 순서: Google 활성화 → 앱 로그인 화면의 Google 버튼 → 준비한 테스트 계정 선택 → 최초 소속 저장 → 홈 → 로그아웃 후 같은 Google 계정으로 재로그인 → 본인 데이터 유지 확인. 삭제해도 되는 계정에 한해 Google 본인 확인 후 탈퇴도 확인할 수 있다.

## 게스트로 시작하기

- 로그인 화면의 **게스트로 시작하기**는 Firebase 익명 인증으로 UID를 발급받고 소속 선택 없이 홈으로 이동한다. 이메일 로그인 버튼과 기존 화면 디자인은 유지한다. Firebase 콘솔에서 익명 로그인 활성화를 사용자가 완료했다고 확인했다.
- 게스트용 `users/{uid}` 프로필에는 `accountType: guest`, UID와 생성·수정 시각만 저장한다. 단과대·학과를 임의로 채우지 않는다. 기존 회원 프로필은 `accountType: member`로 구분한다.
- 게스트도 기존 토큰 검증·UID별 DB 경로·보안 규칙을 사용한다. 게스트 데이터를 위한 공용 저장 공간이나 인증 예외를 만들지 않는다.
- 앱을 닫았다 열어도 저장된 Firebase 로그인 상태가 남아 있으면 같은 게스트로 복원한다. 로그아웃하거나 앱 데이터를 지우면 기존 게스트로 다시 로그인할 수 없다. 게스트 로그아웃 시 추가 확인 화면에서 이 제한을 안내한다. 로그아웃 자체는 DB 데이터를 삭제하지 않는다.
- 게스트 메뉴의 **게스트 데이터 삭제**는 비밀번호 입력 없이 명시적 확인 후 본인 계정과 데이터를 삭제한다. 서버는 검증된 익명 토큰과 현재 Auth 계정에 이메일·전화번호·로그인 제공자가 없는지 확인한다. 일반 회원의 비밀번호 재확인 조건은 유지한다.
- 초기 프로필 연결이 실패하면 같은 UID로 다시 연결할 수 있다. 프로필 생성은 재시도해도 문서·일정·기존 프로필을 덮어쓰지 않는다.
- 게스트에서 이메일 계정으로 데이터와 함께 전환하는 기능은 이번 범위에 포함하지 않았다.
- Firebase 계정 생성, 브라우저 기능 테스트, 자동 테스트는 실행하지 않았다. 수정한 프런트 8개 파일과 백엔드 4개 파일의 문법만 정적으로 확인했다.

구현 참고: [Firebase 공식 익명 인증 안내](https://firebase.google.com/docs/auth/web/anonymous-auth).

## 사용자별 저장과 인증

| 경로 | 내용 |
| --- | --- |
| `users/{uid}` | 소속 ID·이름, 별칭, 목록 버전, 생성·수정 시각 |
| `users/{uid}/documents/{documentId}` 및 하위 문서 | 추출 원문·청크, 분석 결과, 준비 계획 |
| `users/{uid}/todos/{todoId}` | 등록 일정·완료 상태 |
| `accountDeletions/{uid}` | 서버만 접근하는 삭제 진행 상태 |

- 모든 개인 문서·분석·일정·원문 이미지 API는 Firebase Bearer ID 토큰을 요구한다. 서버가 서명·만료·취소 여부와 계정 상태를 검증하고 UID를 결정한다. 클라이언트에서 다른 UID를 지정할 수 없다.
- 본인 경로만 목록으로 조회한다. 타인 문서·일정 ID의 조회·수정·삭제는 404, 인증 없는 개인 요청은 401이다.
- 원문 이미지도 인증된 요청으로 받아 표시하며 토큰을 URL에 넣지 않는다. 개인 응답은 공유 캐시를 사용하지 않는다. 계정 전환 후 이전 계정의 응답을 반영하지 않는다.
- Firestore 클라이언트 읽기는 본인 UID 아래에서만 허용한다. 분석 결과를 포함한 모든 클라이언트 직접 쓰기는 차단하고 서버 API에서만 저장한다. 삭제 진행 중에는 읽기도 차단한다.
- Admin SDK는 규칙을 우회하므로 백엔드에도 토큰 검증과 UID별 저장 위치를 적용한다.
- 원본 PDF·이미지와 렌더 캐시는 기존 서버 로컬 저장 방식을 유지한다. UID 기반 파일 접두사로 분리한다.

기존 루트 `documents`, `todos`와 소유자 없는 로컬 원본은 보존한다. 소유자를 확인할 수 없어 특정 계정으로 자동 이전하지 않고 개인 목록에서는 제외한다. 기존 공용 문서가 있어도 새 계정 홈은 비어 있을 수 있으며, 로그인한 계정으로 새 문서를 등록하면 개인 목록에 표시된다.

## 프로필·탈퇴 API

| API | 인증 | 용도 |
| --- | --- | --- |
| `GET /api/auth/affiliations` | 공개 | 단국대 죽전 소속 목록 |
| `GET /api/me/profile` | ID 토큰 | 본인 프로필·삭제 진행 여부 |
| `PUT /api/me/profile` | ID 토큰 | `{collegeId, departmentId}` 저장 |
| `POST /api/me/guest-profile` | 익명 로그인 ID 토큰 | 소속 없는 본인 게스트 프로필 생성·복원 |
| `DELETE /api/me/account` | ID 토큰. 일반 회원은 최근 재인증 필요 | `{confirmed: true}`로 본인 계정 삭제 |

소속 이름은 서버 목록에서 결정한다. 삭제 진행 중에는 상태 조회 외의 개인 API가 423을 반환한다.

이메일 회원은 현재 비밀번호로, Google 계정이 연결된 회원은 Google 팝업으로 Firebase에 재인증한다. 비밀번호나 Google OAuth 토큰은 백엔드로 보내지 않고 Firebase ID 토큰만 사용한다. 서버는 최근 5분 이내 재인증과 명시적 확인을 요구한다. 비밀번호가 없는 게스트는 위의 익명 계정 확인을 사용한다. 삭제 상태를 기록한 뒤 해당 계정의 로컬 원본·캐시, `users/{uid}`와 모든 하위 문서, Auth 계정을 순서대로 정리한다. 다른 계정과 소유자 없는 기존 공용 데이터는 보존한다.

중간 실패 시 삭제 상태를 유지하고 앱에 복구 화면을 표시한다. 서버는 시작 시와 30초 간격으로 미완료 작업을 재시도한다. 같은 계정의 진행 중인 요청과 삭제 순서를 조정하며, 저장 트랜잭션에서도 삭제 상태를 확인한다. 현재 로컬 원본과 요청 잠금은 서버 한 인스턴스를 기준으로 한다. 여러 서버로 확장할 때는 원본 공유 저장소와 인스턴스 사이 삭제 동기화가 필요하다.

## 소속 목록

`backend/app/data/affiliations.json`에 첨부 PDF의 죽전 단과대 구분과 어디가 2027 모집단위를 바탕으로 10개 그룹, 63개 선택지를 정리했다. 학부/세부 전공 표기를 유지하고 PDF의 SW융합학부도 포함했다. 소속 학과 목록이 없는 자유교양대학은 제외했다. AI융합대학, 인프라건설공학과 등의 명칭 차이는 별칭으로 표시한다. 목록은 소속 저장용이며 모집 자격 판정 기준이 아니다. 목록 변경 시 기존 ID를 유지하고 버전을 갱신한다.

## 검증 및 사용자 확인

2026-10-21 사용자가 직접 테스트하겠다고 요청한 시점에 추가 테스트를 중단했다.

게스트 기능 추가 이전, 중단 전에 완료한 검증(아래 결과는 새 게스트 기능의 테스트 결과가 아님):

- 프런트 자동 테스트 31개, 백엔드 107개 통과. 선택 도구 reportlab 미설치로 기존 PDF 테스트 모듈 하나는 건너뛰었다.
- 웹·iOS·Android Expo 번들 생성 성공. 이후 삭제 상태의 주기적 조회와 취소 오류 처리에 소규모 수정이 있었으며 그 뒤 번들 생성은 반복하지 않았다. JavaScript 프로젝트로 별도 TypeScript 검사 설정은 없다.
- 임시 계정 두 개로 실제 가입·프로필 저장·본인 문서와 일정·타인 API 접근 차단·인증된 원문 이미지 조회를 확인했다.
- 실제 Firestore REST 요청에서 본인 읽기 허용, 타인·비로그인 읽기 차단, 클라이언트 직접 쓰기 차단을 확인했다. 규칙 구문 검증과 배포를 완료했다.
- 브라우저에서 임시 계정 홈에 본인 문서만 표시되고 PDF 원문 이미지가 표시되는 것을 확인했다.
- 자동 테스트에서 본인 데이터만 삭제, 500개 초과 하위 문서 정리, 삭제 실패 복구, 분석 중 탈퇴 처리 순서를 확인했다.
- 테스트 중단 후 임시 계정 두 개와 해당 DB 데이터·원본을 삭제하고 테스트 비밀번호를 정리했다. 사용자의 실제 계정·데이터는 삭제하지 않았다. 별도 테스트 서버만 종료하고 원래 개발 서버는 유지했다.

사용자가 직접 확인할 항목:

1. A에서 문서 등록 후 B로 로그인하면 A의 문서·일정이 보이지 않는지 확인한다.
2. 다시 A로 로그인하면 본인 문서·일정·원문이 유지되는지 확인한다.
3. 삭제해도 되는 계정으로 메뉴 → 회원 탈퇴 → 비밀번호 확인을 진행하고 로그인 화면 이동 및 해당 Auth 계정·DB 하위 데이터 삭제를 확인한다. 실제 화면의 최종 탈퇴 버튼은 개발 도구로 실행하지 않았다.
4. Firebase 콘솔 규칙 시뮬레이터에서 다른 UID의 `users/{uid}` 문서 읽기가 거부되는지 확인한다. 실제 REST 차단은 확인했지만 콘솔 시뮬레이터 검증은 아직 수행하지 않았다.
5. 실제 모바일 기기의 로그인 유지와 화면 표시를 확인한다.
6. 로그인 화면에서 게스트로 시작하기 → 소속 선택 없이 홈 진입 → 문서 등록 → 새로고침 후 본인 데이터 유지 → 메뉴의 로그아웃 확인·취소와 게스트 데이터 삭제를 확인한다. 새 게스트와 이메일 계정 사이에 문서·일정이 섞이지 않는지도 확인한다.

이번 게스트 기능으로 수정한 파일:

- 로그인 연결: `src/services/auth.js`, `src/services/profileApi.js`, `src/contexts/AuthContext.js`, `src/navigation/AuthGate.js`, `src/utils/authForm.js`.
- 화면: `src/screens/AuthScreens.js`, `src/components/AccountSidebar.js`, `src/components/AccountDeletionForm.js`.
- 서버: `backend/app/api/authn.py`, `backend/app/api/profiles.py`, `backend/app/api/accounts.py`, `backend/app/services/user_profiles.py`.
- 안내 문서: `docs/auth.md`. 새 라이브러리와 Firestore 규칙 변경은 없다.

## 변경 파일

- 인증 화면·상태: `App.js`, `src/navigation/AuthGate.js`, `src/screens/AuthScreens.js`, `src/contexts/AuthContext.js`, `src/hooks/useAffiliations.js`, `src/utils/authForm.js`, `src/utils/accountFlow.js`.
- UI: `src/components/AuthFields.js`, `AffiliationPicker.js`, `AccountSidebar.js`, `AccountDeletionForm.js`, `PrimaryButton.js`, `AuthenticatedPageImage.js`, `src/screens/HomeScreen.js`, `EvidenceCheckScreen.js`.
- 프런트 서비스: `src/services/auth.js`, `firebaseAuth.web.js`, `firebaseAuth.native.js`, `firebase.js`, `api.js`, `profileApi.js`.
- 백엔드 API: `backend/app/api/authn.py`, `accounts.py`, `profiles.py`, `routes.py`, `backend/app/main.py`.
- 백엔드 저장·정리: `backend/app/services/store.py`, `originals.py`, `firebase_admin_client.py`, `user_profiles.py`, `account_state.py`, `account_deletion.py`.
- 목록·규칙·문서: `backend/app/data/affiliations.json`, `backend/.gitignore`, `firestore.rules`, `docs/auth.md`.
- 테스트: `tests/auth.test.mjs`, `tests/authenticatedApi.test.mjs`, `backend/tests/test_profiles.py`, `test_user_security.py`, `conftest.py`, `test_persistence.py`.
- 의존성: `package.json`, `package-lock.json`에는 앞선 로그인 유지 구현의 AsyncStorage 2.2.0이 추가되어 있다. 이번 사용자별 저장·탈퇴 구현에는 새 라이브러리를 추가하지 않았다.

작업 브랜치는 `feature/auth-email-login`이다. 2026-10-22 사용자가 현재까지의 작업을 커밋하고 push하도록 요청했다. 이번 요청에는 PR 생성·merge가 포함되지 않는다.
