# ActionDoc Agent — 백엔드 (FastAPI + Gemini)

ActionDoc Agent는 생활문서에 포함된 중요한 정보를 AI로 추출하고, 원문 근거를 검증하여 사용자가 수행해야 할 일을 체계적으로 관리할 수 있도록 돕는 서비스입니다.

백엔드는 **Python 3.12와 FastAPI**를 기반으로 구현했으며, Google Gemini를 통한 문서 분석과 Firebase Authentication·Firestore를 통한 사용자 인증 및 데이터 관리를 지원합니다.

## 1. 주요 기능

- **문서 접수:** 텍스트, PDF, 이미지 파일 입력 및 원문 텍스트 추출
- **행동 정보 추출:** Gemini를 이용한 신청 대상, 마감일, 제출 서류, 해야 할 일 등의 정보 추출
- **근거 검증:** 추출한 정보와 원문을 비교하여 신뢰도 및 사용자 확인 필요 여부 판단
- **준비 계획 관리:** 추출한 할 일을 바탕으로 일정 생성, 편집, 등록
- **문서 관리:** 등록된 문서 조회, 제목·마감일 수정, 삭제
- **할 일 관리:** 일정 조회, 내용 수정, 완료 처리, 삭제 및 준비 계획과 동기화
- **사용자 인증:** Firebase Authentication 기반 로그인 및 사용자별 API 접근 제어
- **데이터 저장:** Firestore를 이용한 문서, 원문 텍스트, 준비 계획, 할 일 저장
- **계정 관리:** 사용자 프로필 관리 및 계정 삭제

문서 접수(AGENT 01), 행동 정보 추출(AGENT 02), 근거 검증(AGENT 03)을 중심으로 구현했으며, 준비 계획 등록과 일정 관리 기능도 일부 포함되어 있습니다.

---

## 2. 기술 스택

| 구분 | 기술 |
|---|---|
| Language | Python 3.12 |
| Backend Framework | FastAPI |
| ASGI Server | Uvicorn |
| AI / LLM | Google Gemini API |
| Database | Firebase Firestore |
| Authentication | Firebase Authentication |
| PDF 처리 | pypdf, pypdfium2 |
| 데이터 검증 | Pydantic |
| Testing | pytest |
| Deployment | Google Cloud Run |
| Secret Management | Google Cloud Secret Manager |
| CI | GitHub Actions |

프론트엔드는 React Native(Expo) 기반이며 `src/services/api.js`를 통해 백엔드 API와 통신합니다.

---

## 3. 프로젝트 구조

```text
backend/
├── app/
│   ├── agents/
│   │   ├── intake.py            # 문서 접수 및 텍스트 추출
│   │   ├── extraction.py        # 행동 정보 추출
│   │   └── verification.py      # 원문 근거 검증
│   ├── api/
│   │   ├── routes.py            # 문서 및 할 일 API
│   │   ├── authn.py             # Firebase 토큰 검증
│   │   ├── profiles.py          # 사용자 프로필 API
│   │   └── accounts.py          # 계정 삭제 API
│   ├── data/
│   │   └── affiliations.json    # 대학·학과 목록
│   ├── llm/
│   │   ├── base.py              # LLM 인터페이스
│   │   ├── gemini.py            # Gemini 연동
│   │   └── mock.py              # 테스트용 Mock LLM
│   ├── services/
│   │   ├── store.py             # Memory / Firestore 저장소
│   │   ├── pipeline.py          # 문서 분석 파이프라인
│   │   ├── preparation_plan.py  # 준비 계획 데이터 검증
│   │   ├── originals.py         # 원본 파일 및 근거 이미지
│   │   └── firebase_admin_client.py
│   ├── config.py                # 환경변수 및 설정
│   ├── main.py                  # FastAPI 애플리케이션
│   └── schemas.py               # 데이터 스키마
├── tests/                       # 백엔드 테스트
├── .env.example                 # 환경변수 예시
├── .gcloudignore                # Cloud Run 업로드 제외 설정
├── Dockerfile                   # 배포용 컨테이너 설정
├── requirements.txt             # Python 의존성
└── README.md
```

---

## 4. 로컬 개발 환경 구축

### 4.1 사전 준비

다음 프로그램이 설치되어 있어야 합니다.

- Python 3.12
- Git
- VS Code 또는 다른 코드 편집기

Python 버전 확인:

```powershell
py -3.12 --version
```

프로젝트는 Python 3.12를 기준으로 개발 및 배포합니다. 다른 Python 버전이 설치되어 있더라도 가상환경은 3.12로 생성하는 것을 권장합니다.

### 4.2 가상환경 생성

프로젝트 최상위 폴더에서 실행합니다.

**Windows PowerShell**

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

**macOS / Linux**

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
```

가상환경 활성화 후 버전을 확인합니다.

```powershell
python --version
```

`Python 3.12.x`가 출력되어야 합니다.

### 4.3 의존성 설치

`backend` 폴더에서 실행합니다.

```powershell
python -m pip install -r requirements.txt
```

설치가 완료되면 FastAPI, Uvicorn, Gemini SDK, Firebase Admin SDK, pytest 등이 사용할 수 있는 상태가 됩니다.

### 4.4 환경변수 설정

처음 실행하는 경우 `backend/.env.example`을 복사합니다.

```powershell
Copy-Item .env.example .env
```

기존 `.env` 파일이 있다면 덮어쓰지 않고 필요한 항목만 수정합니다.

실제 Gemini API 키 없이 개발하려면 다음과 같이 설정합니다.

```dotenv
LLM_PROVIDER=mock
USE_VERTEX=false

GCP_PROJECT=actiondoc-agent

STORAGE_BACKEND=memory
GOOGLE_APPLICATION_CREDENTIALS=

REVIEW_THRESHOLD=80
```

**설정 설명**

| 환경변수 | 설명 |
|---|---|
| `LLM_PROVIDER` | `mock` 또는 `gemini` |
| `USE_VERTEX` | Vertex AI 사용 여부 |
| `GCP_PROJECT` | Google Cloud 프로젝트 ID |
| `STORAGE_BACKEND` | `memory` 또는 `firestore` |
| `GOOGLE_APPLICATION_CREDENTIALS` | 로컬 Firebase Admin 인증에 사용할 키 경로 |
| `REVIEW_THRESHOLD` | 사용자 확인이 필요한 신뢰도 기준 |

`mock`은 실제 Gemini API를 호출하지 않는 규칙 기반 추출기입니다. `memory`는 서버 메모리에 데이터를 저장하므로 서버가 종료되면 데이터가 사라집니다.

다만 개인 데이터 API는 저장소 종류와 관계없이 Firebase ID 토큰을 검증합니다. 따라서 실제 로그인 사용자를 대상으로 로컬 API를 호출하려면 Firebase 인증 설정도 필요합니다.

### 4.5 서버 실행

`backend` 폴더에서 실행합니다.

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

정상 실행 후 다음 주소에 접속할 수 있습니다.

- 서버 상태: http://localhost:8000/health
- Swagger API 문서: http://localhost:8000/docs

`/health` 정상 응답 예시:

```json
{
  "status": "ok",
  "llm_provider": "mock",
  "storage": "memory"
}
```

로컬 서버를 종료하려면 실행 중인 터미널에서 `Ctrl + C`를 누릅니다.

---

## 5. Gemini 및 Firestore 설정

### 5.1 실제 Gemini API 사용

실제 문서 분석에는 Gemini API를 사용합니다.

Google AI Studio에서 API 키를 발급한 후 `backend/.env`를 설정합니다.

```dotenv
LLM_PROVIDER=gemini
USE_VERTEX=false

GEMINI_API_KEY=YOUR_GEMINI_API_KEY
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODELS=
GEMINI_RETRIES=1
```

`YOUR_GEMINI_API_KEY`는 실제 발급받은 키로 교체합니다.

- `GEMINI_MODEL`: 기본 모델
- `GEMINI_FALLBACK_MODELS`: 기본 모델의 일시적 오류에 대비한 대체 모델 목록
- `GEMINI_RETRIES`: 일시적 API 오류에 대한 재시도 횟수

현재 Cloud Run 배포 환경은 `gemini-3.8-flash`를 사용하도록 설정되어 있습니다.

실제 사용할 모델의 제공 여부와 API 키의 접근 권한은 별도로 확인해야 합니다.

참고: https://ai.google.dev/gemini-api/docs/models

### 5.2 Vertex AI 사용

프로젝트에서는 Gemini API 키 방식 외에 Vertex AI 사용도 지원합니다.

```dotenv
LLM_PROVIDER=gemini
USE_VERTEX=true
GCP_PROJECT=actiondoc-agent
GCP_LOCATION=us-central1
```

Vertex AI를 사용하려면 해당 프로젝트의 API 활성화, IAM 권한 및 인증 설정이 필요합니다.

로컬에서 사용자 기본 인증을 사용하는 경우 다음 명령어로 설정할 수 있습니다.

```powershell
gcloud auth application-default login
```

현재 Cloud Run 배포는 Vertex AI 방식이 아니라 **Gemini API 키 방식(`USE_VERTEX=false`)**입니다.

### 5.3 Firestore 사용

로컬에서 Firestore를 사용하려면 다음과 같이 설정합니다.

```dotenv
STORAGE_BACKEND=firestore
GCP_PROJECT=actiondoc-agent
GOOGLE_APPLICATION_CREDENTIALS=C:/path/to/serviceAccountKey.json
```

`GOOGLE_APPLICATION_CREDENTIALS`에는 로컬 환경에서 사용할 서비스 계정 JSON의 실제 경로를 지정합니다.

JSON 키 파일은 GitHub 저장소에 올리면 안 됩니다. 가급적 저장소 외부의 안전한 위치에 보관합니다.

서비스 계정 키 파일을 사용하지 않고 Application Default Credentials를 활용하는 방법도 있습니다. 이 경우 해당 인증 주체에 필요한 Firebase·Firestore 권한이 있어야 합니다.

**Cloud Run 환경에서는 서비스 계정 JSON 파일을 사용하지 않습니다.** Cloud Run에 연결된 서비스 계정의 권한으로 Firestore에 접근합니다.

---

## 6. 문서 분석 파이프라인

ActionDoc Agent의 핵심은 단순한 AI 정보 추출이 아니라 **추출한 정보가 실제 원문에 존재하는지 검증하는 과정**입니다.

```text
문서 입력 (텍스트 / PDF / 이미지)
             │
             ▼
     AGENT 01 문서 접수
       intake.py
             │
             ├─ 텍스트 PDF: pypdf 텍스트 추출
             ├─ 스캔 PDF: Gemini 받아쓰기
             └─ 이미지: Gemini 받아쓰기
             │
             ▼
    개인정보 마스킹 및 문장 분리
             │
             ▼
     AGENT 02 행동 정보 추출
       extraction.py
             │
             ▼
    신청 대상 / 마감일 / 제출 서류
      제출 방법 / 해야 할 일
             │
             ▼
      AGENT 03 근거 검증
       verification.py
             │
             ▼
    근거 일치 여부 및 신뢰도 계산
             │
             ▼
        AnalysisResult
             │
             ├─ 프론트엔드 분석 결과 표시
             ├─ 사용자 확인 및 수정
             └─ 저장소에 분석 결과 저장
```

### 6.1 문서 접수

텍스트, PDF, 이미지 파일을 지원합니다.

- 텍스트 PDF는 `pypdf`로 텍스트를 직접 추출합니다.
- 스캔 PDF와 이미지는 Gemini를 이용해 문자 정보를 추출합니다.
- 추출한 텍스트에서 주민등록번호, 전화번호 등 일부 개인정보 패턴을 마스킹합니다.
- 원문을 페이지 및 문장 단위로 분리해 근거 검증에 활용합니다.

이미지·스캔 PDF는 문자 추출을 위해 원본 데이터가 Gemini로 전달된 뒤 텍스트 마스킹이 진행될 수 있습니다.

### 6.2 행동 정보 추출

Gemini는 문서에서 다음과 같은 정보를 추출합니다.

- 문서 제목 및 종류
- 신청 대상 및 자격 조건
- 신청 시작일과 마감일
- 필요한 제출 서류
- 제출 방법 및 문의처
- 사용자가 수행해야 할 일

각 추출 필드에는 관련 원문 근거를 함께 포함하도록 요청합니다.

### 6.3 근거 검증

LLM의 추출 결과를 그대로 신뢰하지 않고, 원문과 비교하여 검증합니다.

| 검증 항목 | 확인 내용 |
|---|---|
| `evidence_found` | 원문에서 근거 문장을 찾을 수 있는지 |
| `value_in_evidence` | 추출값이 근거 문장과 일치하는지 |
| `date_time` | 날짜·시간이 실제 원문에 근거하는지 |
| `date_role` | 마감일, 발표일, 행사일 등 날짜 의미가 올바른지 |
| `date_range` | 기간의 시작일과 종료일을 올바르게 구분했는지 |

근거 문장이 일치하지 않는 경우 원문을 다시 탐색해 검증을 시도합니다.

### 6.4 신뢰도 계산

최종 신뢰도는 다음 기준으로 계산합니다.

```text
최종 신뢰도 =
  0.45 × 근거 일치도
+ 0.35 × 값 검증 점수
+ 0.20 × LLM 자기확신도
```

- 원문에서 근거를 찾지 못하면 `unverified` 상태로 분류하고 신뢰도는 최대 40점으로 제한합니다.
- 치명적인 검증 실패가 있으면 신뢰도를 최대 60점으로 제한합니다.
- 신뢰도가 `REVIEW_THRESHOLD`보다 낮으면 사용자 확인이 필요한 상태로 분류합니다.
- 기본 `REVIEW_THRESHOLD`는 80입니다.

LLM의 자기확신도 비중을 20%로 제한하고, 원문 근거 및 값 검증 결과에 더 높은 비중을 두어 AI의 잘못된 정보 추출 위험을 줄입니다.

관련 구현은 `app/agents/verification.py`, 테스트는 `tests/test_verification.py`에서 확인할 수 있습니다.

---

## 7. API 명세

모든 개인 데이터 API는 Firebase Authentication으로 발급된 ID 토큰을 사용합니다.

요청 시 다음 헤더를 포함해야 합니다.

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

`/health`와 소속 목록 조회 API 등 일부 엔드포인트는 인증 없이 사용할 수 있습니다.

### 7.1 서버 상태

| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/health` | 서버 상태 및 주요 설정 확인 |

### 7.2 문서 분석 및 관리

| Method | Endpoint | 설명 |
|---|---|---|
| POST | `/api/documents/analyze` | 텍스트·파일 분석 |
| GET | `/api/documents` | 문서 목록 조회 |
| GET | `/api/documents/{id}` | 문서 상세 조회 |
| PATCH | `/api/documents/{id}` | 문서 제목·마감일 수정 |
| DELETE | `/api/documents/{id}` | 문서 및 연관 데이터 삭제 |
| POST | `/api/documents/{id}/retry` | 실패한 문서 분석 재시도 |

문서 분석 요청은 `multipart/form-data` 형식이며 `text` 또는 `file`을 전달합니다.

파일 및 텍스트 입력 크기는 최대 15MB로 제한되어 있습니다.

분석 응답에는 프론트 표시용 `view`와 검증 세부 정보를 포함한 `analysis`가 반환됩니다.

### 7.3 원문 및 근거 확인

| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/documents/{id}/source` | 추출된 원문 및 근거 정보 조회 |
| GET | `/api/documents/{id}/pages/{page}/image` | 원본 PDF·이미지 페이지 조회 |
| POST | `/api/documents/{id}/fields/{fieldId}/confirm` | 추출 항목 확인 또는 값 수정 |
| DELETE | `/api/documents/{id}/fields/{fieldId}` | 잘못 추출된 항목 제거 |

### 7.4 준비 계획 및 할 일

| Method | Endpoint | 설명 |
|---|---|---|
| PUT | `/api/documents/{id}/plan` | 준비 계획 저장 |
| POST | `/api/documents/{id}/plan/register` | 준비 계획 등록 |
| GET | `/api/todos` | 할 일 목록 조회 |
| PATCH | `/api/todos/{id}` | 할 일 내용·완료 상태 수정 |
| DELETE | `/api/todos/{id}` | 할 일 삭제 |

준비 계획에는 각 단계의 제목, 날짜, 시간, 소요시간, 메모, 완료 여부 등이 포함됩니다.

사용자가 준비 계획을 수정하면 `revision`을 이용하여 변경 충돌을 확인합니다. 저장된 버전과 요청 버전이 다르면 HTTP `409 Conflict`를 반환합니다.

등록된 할 일의 수정 및 삭제는 문서의 준비 계획과 동기화됩니다. 최종 마감 일정은 일반적인 완료 가능 할 일과 구분하여 관리합니다.

### 7.5 사용자 프로필 및 계정

| Method | Endpoint | 설명 |
|---|---|---|
| GET | `/api/auth/affiliations` | 대학·학과 소속 목록 조회 |
| GET | `/api/me/profile` | 현재 사용자 프로필 조회 |
| PUT | `/api/me/profile` | 사용자 소속 정보 저장 |
| POST | `/api/me/guest-profile` | 게스트 사용자 프로필 생성 |
| DELETE | `/api/me/account` | 현재 사용자 계정 삭제 |

계정 삭제 과정에서는 사용자 인증 상태를 확인하며, 필요 시 최근 로그인 또는 재인증을 요구합니다.

상세 요청·응답 스키마는 실행 중인 서버의 `/docs`에서 확인할 수 있습니다.

---

## 8. 데이터 저장 구조

### 8.1 저장 방식

`STORAGE_BACKEND` 설정으로 저장소를 선택합니다.

| 설정 | 특징 | 용도 |
|---|---|---|
| `memory` | 프로세스 메모리에 데이터 저장, 재시작 시 초기화 | 로컬 개발·자동 테스트 |
| `firestore` | Firebase 프로젝트의 Firestore에 데이터 저장 | 실제 서비스 운영 |

### 8.2 Firestore 저장 구조

인증된 사용자의 UID를 기준으로 데이터를 구분합니다.

```text
users/
└── {uid}/
    ├── (사용자 프로필 필드)
    ├── documents/
    │   └── {documentId}/
    │       ├── (문서 정보 및 분석 결과)
    │       ├── source/
    │       │   └── raw
    │       └── sourceChunks/
    │           ├── 000000
    │           ├── 000001
    │           └── ...
    └── todos/
        ├── {todoId}
        └── ...
```

- `users/{uid}`: 사용자 프로필 정보
- `users/{uid}/documents/{documentId}`: 문서 제목, 분석 상태, 분석 결과 및 준비 계획
- `source/raw`: 원문 종류, 페이지 수, 마스킹 정보 등
- `sourceChunks`: 분할 저장된 원문 텍스트
- `users/{uid}/todos/{todoId}`: 등록된 할 일

API는 요청자의 Firebase ID 토큰을 검증한 후 해당 사용자에게 속한 데이터에 접근합니다.

### 8.3 데이터 유지 및 동기화

Firestore에 저장된 문서·분석 결과·준비 계획·할 일은 백엔드 서버가 재시작되어도 유지됩니다.

준비 계획을 다시 등록하거나 수정할 때 기존 할 일과의 동기화를 수행하여 불필요한 중복을 방지합니다.

문서 제목을 변경하면 연관 할 일의 문서 제목도 동기화됩니다.

### 8.4 원본 파일 저장 시 주의사항

추출된 원문 텍스트와 분석 결과는 Firestore에 저장되지만, 원본 PDF·이미지 및 렌더링 결과는 현재 서버의 로컬 파일시스템에 보관합니다.

Cloud Run의 로컬 파일시스템은 영구 저장소가 아닙니다. 인스턴스가 종료되거나 재생성되면 원본 파일이 사라질 수 있습니다.

이 경우 Firestore에 저장된 추출 텍스트는 유지되지만, 원본 PDF·이미지 기반 근거 표시가 제한될 수 있습니다.

원본 파일을 안정적으로 유지하려면 추후 Google Cloud Storage 등 영구 객체 저장소로 이전해야 합니다.

---

## 9. 프론트엔드 연결

프론트엔드는 프로젝트 최상위 폴더의 `.env`에서 백엔드 주소를 지정합니다.

### 9.1 Cloud Run 서버 사용

```dotenv
EXPO_PUBLIC_API_URL=https://actiondoc-api-835397104507.asia-northeast3.run.app
```

이 방식에서는 로컬 FastAPI 서버를 실행할 필요가 없습니다.

### 9.2 로컬 서버 사용

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:8000
```

웹 브라우저에서 같은 PC의 백엔드를 사용하는 경우에 적합합니다.

실제 휴대폰에서 로컬 서버를 사용할 때는 `localhost` 대신 PC의 접근 가능한 내부 IP를 사용해야 하며, FastAPI도 `--host 0.0.0.0`으로 실행해야 합니다.

환경변수를 변경한 뒤에는 Expo 개발 서버를 재시작합니다.

프론트 API 요청 코드는 `src/services/api.js`에서 관리하며, 인증이 필요한 요청에는 Firebase ID 토큰을 자동으로 추가합니다.

---

## 10. 테스트


### 10.1 백엔드 로컬 테스트

백엔드 테스트는 실제 Gemini API나 Firestore에 의존하지 않도록
`LLM_PROVIDER=mock`, `STORAGE_BACKEND=memory` 환경에서 실행합니다.

**Windows PowerShell**

`backend` 폴더에서 다음 명령어를 실행합니다.

```powershell
cmd /c "set LLM_PROVIDER=mock&& set STORAGE_BACKEND=memory&& set USE_VERTEX=false&& .venv\Scripts\python.exe -m pytest -q"
```

이 명령어는 테스트 실행 중에만 환경변수를 변경하며,
기존 `backend/.env` 파일은 수정하지 않습니다.

**macOS / Linux**

`backend` 폴더에서 가상환경을 활성화한 후 실행합니다.

```bash
LLM_PROVIDER=mock STORAGE_BACKEND=memory USE_VERTEX=false python -m pytest -q
```

테스트는 문서 분석, 근거 검증, 날짜 처리, 데이터 저장,
문서·할 일 관리, 사용자 인증 및 보안 관련 동작 등을 검증합니다.


### 10.2 프론트엔드 테스트

프로젝트 최상위 폴더에서 실행합니다.

```powershell
node --test tests/*.test.mjs
```

### 10.3 GitHub Actions CI

GitHub Actions는 다음 상황에서 백엔드와 프론트엔드 테스트를 자동 실행합니다.

- `develop` 브랜치를 대상으로 Pull Request 생성 및 업데이트
- `develop` 브랜치에 Push
- GitHub Actions 화면에서 수동 실행

CI 환경:

- Python 3.12
- Node.js 20
- `LLM_PROVIDER=mock`
- `STORAGE_BACKEND=memory`

CI 테스트는 실제 Gemini API 키나 Firestore 서비스 계정 JSON 없이 수행되도록 구성되어 있습니다.

설정 파일: `.github/workflows/ci.yml`

---

## 11. Google Cloud Run 배포

### 11.1 현재 배포 환경

| 항목 | 설정 |
|---|---|
| 프로젝트 | `actiondoc-agent` |
| 서비스 | `actiondoc-api` |
| 리전 | `asia-northeast3` (서울) |
| Python | 3.12 |
| LLM | Gemini API |
| 모델 설정 | `gemini-3.8-flash` |
| 데이터베이스 | Firestore |
| Secret Manager | `actiondoc-gemini-api-key` |
| Cloud Run 서비스 계정 | `actiondoc-run@actiondoc-agent.iam.gserviceaccount.com` |

배포된 백엔드 주소:

https://actiondoc-api-835397104507.asia-northeast3.run.app

서버 상태 확인:

https://actiondoc-api-835397104507.asia-northeast3.run.app/health

### 11.2 배포 전제조건

- Google Cloud CLI 설치 및 로그인
- Google Cloud 프로젝트 및 결제 활성화
- Cloud Run, Cloud Build, Artifact Registry, Secret Manager API 사용 가능
- 배포에 필요한 IAM 권한
- Cloud Run 서비스 계정의 Firestore·Firebase 인증 관련 권한
- Secret Manager에 Gemini API 키 등록 및 접근 권한 설정

### 11.3 배포 명령어

필요한 설정과 권한이 준비되어 있는 경우 `backend` 폴더에서 실행합니다.

**Windows PowerShell**

```powershell
gcloud run deploy actiondoc-api `
  --source . `
  --project actiondoc-agent `
  --region asia-northeast3 `
  --service-account actiondoc-run@actiondoc-agent.iam.gserviceaccount.com `
  --allow-unauthenticated `
  --memory 1Gi `
  --min-instances 0 `
  --max-instances 1 `
  --timeout 300 `
  --set-env-vars "LLM_PROVIDER=gemini,USE_VERTEX=false,GEMINI_MODEL=gemini-3.8-flash,GCP_PROJECT=actiondoc-agent,STORAGE_BACKEND=firestore" `
  --set-secrets "GEMINI_API_KEY=actiondoc-gemini-api-key:1"
```

`--source .`는 현재 `backend` 디렉터리의 Dockerfile을 기반으로 컨테이너를 빌드합니다. 로컬에 Docker Desktop을 설치하지 않아도 Google Cloud에서 빌드할 수 있습니다.

현재 명령어는 프로젝트에서 실제 사용한 배포 설정을 기록한 것으로, 실행하면 기존 Cloud Run 서비스의 새 리비전을 생성할 수 있습니다.

### 11.4 배포 후 확인

```powershell
Invoke-RestMethod "https://actiondoc-api-835397104507.asia-northeast3.run.app/health"
```

정상 응답 예시:

```json
{
  "status": "ok",
  "llm_provider": "gemini",
  "storage": "firestore"
}
```

`/health`는 FastAPI 실행 및 주요 설정값을 확인하는 엔드포인트입니다. 실제 Gemini 분석, Firestore 쓰기, Firebase 인증의 정상 동작까지 확인하려면 별도의 통합 테스트가 필요합니다.

### 11.5 서버 로그 확인

```powershell
gcloud run services logs read actiondoc-api --project=actiondoc-agent --region=asia-northeast3 --limit=100
```

로그에서는 서버 시작 실패, Gemini API 오류, Firebase 인증 문제, Firestore 권한 오류 등을 점검할 수 있습니다.

### 11.6 비용 및 보안 주의사항

Cloud Run과 Gemini API 등은 사용량에 따라 비용이 발생할 수 있습니다.

현재 초기 테스트 환경에서는 Cloud Run 최소 인스턴스 0개, 최대 인스턴스 1개로 설정했습니다.

Google Cloud의 예산 알림과 서비스별 지출 상한은 비용 관리에 도움이 되지만, 모든 서비스의 요금이 완전히 차단된다는 의미는 아닙니다.

또한 현재 Cloud Run은 외부에서 HTTPS 요청을 받을 수 있도록 설정되어 있습니다. 개인 데이터 API는 Firebase 인증을 검증하지만, `/health`, API 문서 등 공개 경로는 별도로 보호되지 않습니다.

---

## 12. 보안 주의사항

- Gemini API 키는 `backend/.env` 또는 Secret Manager에서 관리합니다.
- API 키를 소스코드에 직접 작성하지 않습니다.
- Firebase 서비스 계정 JSON을 GitHub에 업로드하지 않습니다.
- 프론트엔드의 `EXPO_PUBLIC_` 환경변수에 비밀키를 저장하지 않습니다.
- Cloud Run에는 서비스 계정의 IAM 권한을 사용하고 JSON 키를 배포하지 않습니다.
- 사용자별 문서 접근 시 Firebase ID 토큰을 검증합니다.
- 개인정보 마스킹은 모든 개인정보의 완전한 제거를 보장하지 않습니다.
- 실제 민감한 문서를 이용한 테스트에는 별도의 보안 검토가 필요합니다.

---

## 13. 현재 한계 및 향후 개선

### 현재 한계

- 이미지·스캔 PDF는 문자 추출 전에 원본이 Gemini에 전송될 수 있습니다.
- 원본 파일은 Cloud Run의 임시 로컬 파일시스템에 저장되므로 영구적으로 유지되지 않습니다.
- 문서 분석은 현재 요청·응답 방식으로 수행되어 긴 분석 작업에서는 응답 지연이 발생할 수 있습니다.
- 날짜 의미 검증은 원문 주변 표현을 활용하므로 복잡한 표나 비정형 문서에서 오판할 가능성이 있습니다.
- AI가 추출한 정보는 사용자 확인이 필요할 수 있습니다.
- 배포된 서비스의 실제 Gemini 분석 및 Firestore 등록 과정은 별도의 종단 간 테스트로 검증해야 합니다.

### 향후 개선 사항

1. 원본 PDF 및 이미지의 영구 저장을 위한 Google Cloud Storage 연동
2. 실제 문서 기반 분석 정확도 및 근거 검증 성능 평가
3. 마감일을 고려한 자동 일정 배치와 소요시간 추정 고도화
4. Google Calendar 등 외부 일정 서비스 연동
5. 장시간 문서 분석을 위한 비동기 작업 구조 검토
6. 모바일 실기기 환경에서 인증·분석·저장 통합 테스트
7. 운영 환경의 비용·보안·오류 모니터링 강화

---

## 14. 참고 자료

- [FastAPI 공식 문서](https://fastapi.tiangolo.com/)
- [Google Gemini API 문서](https://ai.google.dev/gemini-api/docs)
- [Firebase 공식 문서](https://firebase.google.com/docs)
- [Google Cloud Run 문서](https://cloud.google.com/run/docs)
- [GitHub Actions 공식 문서](https://docs.github.com/en/actions)

프론트엔드 실행 방법과 전체 프로젝트 개발 절차는 프로젝트 최상위의 `README.md`를 참고하세요.