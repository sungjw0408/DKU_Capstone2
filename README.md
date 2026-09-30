# Git 협업 가이드

이 문서는 팀원이 공용 저장소에서 처음 작업을 시작하는 방법과 브랜치 운영 규칙을 설명합니다.

## 브랜치 전략

```text
main
  └── develop
        ├── feature/기능명-A
        ├── feature/기능명-B
        └── feature/기능명-C
```

- `main`: 배포하거나 최종 제출할 수 있는 안정된 코드
- `develop`: 개발이 완료된 기능을 통합하는 브랜치
- `feature/*`: 팀원이 각 기능을 개발하는 브랜치

기능 개발이 끝나면 GitHub에서 `feature/*` 브랜치를 `develop` 브랜치로 병합하는 Pull Request(PR)를 생성합니다.

## 중요 규칙

1. 새로 작업을 시작할 때 `git init`을 사용하지 않습니다.
2. 반드시 공용 GitHub 저장소를 `clone`해서 작업합니다.
3. `main`과 `develop` 브랜치에는 직접 커밋하거나 push하지 않습니다.
4. 새 기능 브랜치는 최신 `develop` 브랜치에서 생성합니다.
5. 모든 개발과 push는 자신의 `feature/*` 브랜치에서 진행합니다.
6. 기능이 완성되면 `feature/*`에서 `develop`로 PR을 생성합니다.

## 팀원 최초 시작 절차

### 1. 공용 저장소 clone

```bash
git clone https://github.com/sungjw0408/DKU_Capstone2.git
cd DKU_Capstone2
```

> 이미 공용 저장소를 clone했다면 다시 `git clone`하거나 `git init`하지 않습니다.

### 2. 원격 브랜치 정보 가져오기

```bash
git fetch origin
git branch -r
```

원격 브랜치 목록에 최소한 다음 브랜치가 표시되는지 확인합니다.

```text
origin/main
origin/develop
```

### 3. 원격 develop을 추적하는 로컬 develop 생성

```bash
git switch -c develop --track origin/develop
git pull
```

정상적으로 연결되었는지는 다음 명령으로 확인할 수 있습니다.

```bash
git branch -vv
```

`develop` 옆에 `[origin/develop]`이 표시되면 정상입니다.

> 로컬에 `develop` 브랜치가 이미 있다면 새로 만들지 말고 `git switch develop`을 실행한 뒤 `git pull origin develop`로 최신화합니다.

### 4. 기능 브랜치 생성

최신 `develop` 브랜치에서 담당 기능의 브랜치를 만듭니다.

```bash
git switch -c feature/기능명
```

예시:

```bash
git switch -c feature/document-upload
```

브랜치 이름은 기능을 알아볼 수 있도록 영문 소문자와 하이픈(`-`) 사용을 권장합니다.

## 개발 후 commit 및 push

자신의 `feature/*` 브랜치에서 개발한 뒤 변경 사항을 확인하고 커밋합니다.

```bash
git status
git add .
git commit -m "feat: 기능 설명"
```

처음 push할 때는 원격 브랜치와 연결하기 위해 `-u` 옵션을 사용합니다.

```bash
git push -u origin feature/기능명
```

예시:

```bash
git push -u origin feature/document-upload
```

같은 브랜치에서 두 번째 push부터는 다음 명령만 실행하면 됩니다.

```bash
git push
```

## Pull Request 생성

GitHub에서 다음 방향으로 Pull Request를 생성합니다.

```text
feature/기능명 → develop
```

PR을 생성하기 전에 다음 내용을 확인합니다.

- 대상(base) 브랜치가 `develop`인지 확인
- 변경 내용과 테스트 결과 작성
- 팀원의 코드 리뷰를 받은 뒤 병합
- `main`으로 직접 PR하거나 직접 push하지 않기

## 매일 작업 시작 전 최신 코드 반영

작업을 시작하기 전에 원격 `develop`의 최신 내용을 받아 자신의 기능 브랜치에 병합합니다.

```bash
git switch develop
git pull origin develop

git switch feature/기능명
git merge develop
```

병합 충돌이 발생하면 충돌 파일을 수정한 뒤 다음과 같이 커밋합니다.

```bash
git add .
git commit -m "merge: develop 최신 내용 반영"
```

## 새 기능을 시작할 때

기존 기능 작업이 끝난 뒤 새 기능을 시작할 때도 최신 `develop`에서 새 브랜치를 만듭니다.

```bash
git switch develop
git pull origin develop
git switch -c feature/새기능명
```

## 전체 작업 흐름 요약

```text
공용 저장소 clone
        ↓
원격 브랜치 정보 가져오기(fetch)
        ↓
origin/develop을 추적하는 로컬 develop 생성
        ↓
develop 최신 코드 받기(pull)
        ↓
feature/기능명 브랜치 생성
        ↓
기능 개발 및 commit
        ↓
feature 브랜치 push
        ↓
GitHub에서 feature/* → develop PR 생성
        ↓
코드 리뷰 후 develop에 병합
```

핵심 원칙은 **최신 `develop`에서 기능 브랜치를 만들고, 기능 브랜치에서만 작업한 뒤 PR을 통해 `develop`에 반영하는 것**입니다.
