# 📄 똑독 | Ttokdoc

> 원문 확인을 돕는 문서 분석 및 준비 계획 관리 서비스

똑독은 대학 공지와 생활문서의 주요 정보를 분석하고,
각 항목의 원문 근거를 확인하여 준비 계획과 할 일로 연결하는 서비스입니다.

사진·PDF·텍스트로 문서를 등록하고, 신청 대상부터 제출 서류와 마감일까지 확인할 수 있습니다.
확인한 정보는 준비 계획으로 등록하여 할 일과 캘린더에서 관리합니다.

---

## 📋 Contents

- [Demo](#-demo)
- [주요 기능](#-주요-기능)
- [서비스 흐름](#-서비스-흐름)
- [Tech Stack](#-tech-stack)
- [Project Deliverables](#deliverables)
- [개발 문서](#-개발-문서)

---

## 🎥 Demo

👉 [똑독 시연 영상 보기](https://youtu.be/5QPw21AZITA)

---

## ✨ 주요 기능

| 기능 | 설명 |
| --- | --- |
| 문서 등록 | 텍스트, PDF, 사진 및 본문과 첨부파일을 함께 등록 |
| 주요 정보 분석 | 신청 대상, 신청 기간, 마감일, 제출 서류, 제출 방법 등 추출 |
| 원문 근거 확인 | 분석 항목과 연결된 원문 인용 및 위치, 검증 상태 확인 |
| 분석 결과 수정 | 사용자가 항목을 확인·수정하거나 불필요한 항목 제외 |
| 준비 계획 | 문서의 할 일과 마감을 바탕으로 준비 날짜를 추천받고 수정·등록 |
| 일정·진행 관리 | 할 일 완료 여부, 진행률, 캘린더 및 기기 마감 알림 관리 |
| 외부 서비스 연결 | 문의·신청 메일 초안과 외부 작성 링크 제공 |

메일의 파일 첨부와 최종 전송은 사용자가 외부 메일 작성 화면에서 완료합니다.
기기 알림 등 일부 기능은 실행 플랫폼에 따라 지원 범위가 다릅니다.

---

## 🔄 서비스 흐름

**문서 등록 → 정보 추출 → 원문 근거·값·날짜 검사 → 사용자 확인 → 준비 계획 등록 → 할 일·일정 관리**

Gemini가 문서의 주요 정보를 추출하면 백엔드가 원문 근거와 값, 날짜를 검사합니다.
사용자는 항목별 검증 상태와 원문을 확인하고 필요한 내용을 수정할 수 있습니다.

분석 결과를 바탕으로 준비 계획을 등록하고,
연결된 할 일과 캘린더에서 진행 상황을 관리합니다.

### 분류 검증 실험

추출된 내용이 올바른 항목에 들어갔는지 확인하기 위한 분류 모델을 별도로 구현했습니다.
문자·문장 의미 특징을 결합하여 신청 자격, 제출 서류, 제출 방법 등의 분류를 검사합니다.

현재 분류 모델은 저장된 분석 결과를 대상으로 실행하는 학습·평가 도구이며,
앱의 실시간 문서 분석 과정에는 연결되어 있지 않습니다.

---

## 💻 Tech Stack

| 구분 | 기술 | 용도 |
| --- | --- | --- |
| Frontend | React Native, React, Expo, React Native Web | 모바일·웹 화면 구성 |
| Navigation | React Navigation | 화면 이동 및 탭 구성 |
| Backend | Python, FastAPI, Uvicorn | 문서 분석 API와 데이터 처리 |
| AI | Google Gemini API | 정보 추출, 이미지 글자 읽기, 준비 날짜·메일 초안 추천 |
| Document Processing | pypdf, pypdfium2, Pillow | PDF·이미지 처리 |
| Verification | Pydantic, RapidFuzz | 데이터 형식 검사와 원문 근거 비교 |
| Authentication / Database | Firebase Authentication, Firestore | 사용자 인증과 사용자별 데이터 저장 |
| Classification Experiment | scikit-learn, sentence-transformers, joblib | 분류 검증 모델 학습·평가 |
| Backend Deployment | Docker, Google Cloud Run | 백엔드 컨테이너 배포 |

---

<a id="deliverables"></a>

## 📁 Project Deliverables

| 구분 | 자료 |
| --- | --- |
| 시연 영상 | [유튜브 시연 영상](https://youtu.be/5QPw21AZITA) |
| 포스터 PDF | [똑독 포스터](./똑독_포스터.pdf) |
| 프로젝트 결과보고서 | [똑독 결과보고서](./똑독_결과보고서.pdf) |
| 소스 코드 | [develop 브랜치 바로가기](https://github.com/sungjw0408/DKU_Capstone2/tree/develop) |

최종 제출 문서는 `main` 브랜치에, 앱 소스 코드는 `develop` 브랜치에 정리되어 있습니다.

---

## 📚 개발 문서

- [문서 분석 평가 안내](https://github.com/sungjw0408/DKU_Capstone2/blob/develop/backend/eval/README.md)
- [소스 코드 및 프로젝트 구조](https://github.com/sungjw0408/DKU_Capstone2/tree/develop)
