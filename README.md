
# ActionDoc Agent

문서의 내용을 AI로 분석하고, 근거를 검증하여 사용자가 수행해야 할 일을 관리할 수 있도록 돕는 서비스입니다.

## 1. 기술 스택

- Frontend: React Native, Expo, JavaScript
- Backend: Python 3.12, FastAPI
- Database: Firebase Firestore
- Authentication: Firebase Authentication
- AI: Google Gemini
- Deployment: Google Cloud Run
- CI: GitHub Actions

## 2. 프로젝트 구조

```text
DKU_Capstone2/
├── backend/               # FastAPI 백엔드
│   ├── app/               # API 및 서비스 로직
│   ├── tests/             # 백엔드 테스트
│   ├── requirements.txt
│   └── Dockerfile
├── src/
│   ├── components/        # 공통 UI 컴포넌트
│   ├── screens/           # 앱 화면
│   ├── navigation/        # 화면 이동
│   ├── services/          # API 및 Firebase 연동
│   └── theme/             # 디자인 시스템
├── tests/                 # 프론트엔드 테스트
├── .github/workflows/     # GitHub Actions CI
├── package.json
└── README.md
```

## 3. 개발 환경

프로젝트는 다음 환경을 기준으로 개발합니다.

- Python 3.12
- Node.js 20
- npm
- Git
- VS Code (권장)

버전 확인:

```powershell
python --version
node --version
npm --version
```

Python 3.12가 여러 버전 중 하나로 설치되어 있다면
Windows에서 `py -3.12 --version`으로 확인할 수 있습니다.

## 4. 프로젝트 내려받기

```powershell
git clone https://github.com/sungjw0408/DKU_Capstone2.git
cd DKU_Capstone2
git switch develop
```

팀 개발은 `develop` 브랜치를 기준으로 진행합니다.
기능 작업 시 별도의 브랜치를 생성한 후 PR로 병합합니다.

## 5. 프론트엔드 실행

### 패키지 설치

프로젝트 최상위 폴더에서 실행합니다.

```powershell
npm ci
```

### 환경변수 설정

최상위 폴더에 `.env` 파일을 생성합니다.
Copy-Item .env.example .env <- 명령어 사용시 .env 파일 만들기 가능.

```dotenv
EXPO_PUBLIC_API_URL=https://actiondoc-api-835397104507.asia-northeast3.run.app
```

이 주소는 Google Cloud Run에 배포된 백엔드 주소입니다.

### Expo 실행

```powershell
npx expo start -c
```

실행 후 터미널에서 다음 방법 중 하나를 선택합니다.

- `w`: 웹 브라우저
- `a`: Android 에뮬레이터
- QR 코드: 지원되는 Expo Go 환경에서 모바일 앱 실행

Cloud Run 서버를 사용하는 경우 로컬 FastAPI 서버를 실행할 필요가 없습니다.

## 6. 백엔드 로컬 실행

로컬 백엔드를 개발하거나 테스트할 때만 필요합니다.

### Python 가상환경 생성

프로젝트 최상위 폴더에서:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 의존성 설치

```powershell
python -m pip install -r requirements.txt
```

### 환경변수 설정

```powershell
Copy-Item .env.example .env
```

API 키 없이 로컬 테스트를 하려면
`backend/.env`에서 다음과 같이 설정합니다.

```dotenv
LLM_PROVIDER=mock
STORAGE_BACKEND=memory
GOOGLE_APPLICATION_CREDENTIALS=
```

Mock 모드는 실제 Gemini API를 호출하지 않으며,
memory 저장소는 서버 종료 후 데이터가 유지되지 않습니다.

### FastAPI 실행

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- 서버 상태: http://localhost:8000/health
- API 문서: http://localhost:8000/docs

로컬 백엔드에 프론트엔드를 연결하려면
프로젝트 최상위 `.env`의 주소를 다음과 같이 변경합니다.

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:8000
```

변경 후 Expo를 재시작합니다.
실제 휴대폰에서 로컬 백엔드를 사용하려면 PC의 접근 가능한 네트워크 IP를 지정해야 합니다.

## 7. 자동 테스트

### 백엔드 테스트

`backend` 폴더에서 실행합니다.

```powershell
cd backend
cmd /c "set LLM_PROVIDER=mock&& set STORAGE_BACKEND=memory&& set USE_VERTEX=false&& .venv\Scripts\python.exe -m pytest -q"
```

### 프론트엔드 테스트

프로젝트 최상위 폴더에서 실행합니다.

```powershell
node --test tests/*.test.mjs
```

GitHub Actions는 `develop` 대상 PR 및 `develop` 브랜치 Push 시
백엔드와 프론트엔드 테스트를 자동 실행합니다.

CI에서는 실제 Gemini API와 Firestore 대신
Mock LLM 및 메모리 저장소를 사용합니다.

## 8. 배포된 백엔드

Google Cloud 프로젝트: `actiondoc-agent`

Cloud Run 서비스: `actiondoc-api`

리전: `asia-northeast3` (서울)

배포 주소:

https://actiondoc-api-835397104507.asia-northeast3.run.app

상태 확인:

https://actiondoc-api-835397104507.asia-northeast3.run.app/health

Cloud Run에서는 서비스 계정으로 Firestore에 접근하며,
Gemini API 키는 Google Cloud Secret Manager에서 관리합니다.

## 9. 보안 및 환경변수 주의사항

- `.env` 파일은 GitHub에 커밋하지 않습니다.
- Gemini API 키는 프론트엔드에 입력하지 않습니다.
- Firebase 서비스 계정 JSON 파일을 GitHub에 올리지 않습니다.
- `EXPO_PUBLIC_` 환경변수는 앱에 포함될 수 있으므로 비밀키를 저장하지 않습니다.
- 실제 Gemini API를 사용하면 API 이용 비용이 발생할 수 있습니다.

## 10. 개발 시 주의사항

1. 작업 전 `develop`을 최신 상태로 업데이트합니다.
2. 새로운 작업 브랜치를 생성합니다.
3. 변경사항을 테스트합니다.
4. 변경한 파일만 커밋하고 Push합니다.
5. `develop` 대상으로 PR을 생성합니다.
6. GitHub Actions의 테스트 결과를 확인한 후 병합합니다.

## 11. 추가 문서

백엔드의 세부 API, Gemini 설정, 데이터 저장 방식은
[backend/README.md](backend/README.md)를 참고하세요.
