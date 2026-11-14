"""작성한 대조 예시를 학습에만 추가한다."""
import hashlib
import json
import re
from difflib import SequenceMatcher

import numpy as np
from sklearn.base import BaseEstimator, ClassifierMixin, clone


def examples():
    rows = []

    def add(family, text, evidence, label):
        rows.append(dict(
            family=family,
            text=text,
            evidence=evidence,
            label=label,
            origin="작성한 대조 예시: 실수집·사용자 검수 자료 아님",
        ))

    # 같은 문맥에서 사람·서류·방법을 각각 분류한다.
    triples = [
        ("학적", "현재 대학에 재학 중인 사람",
         "재학증명서", "학생 포털에서 온라인으로 접수"),
        ("성적", "직전 학기 평균평점이 3.0 이상인 학생",
         "직전 학기 성적표", "학과 담당자에게 이메일로 제출"),
        ("교육이력", "해당 교육과정을 이수한 참가자",
         "교육 이수내역서", "신청 사이트에 자료를 업로드"),
        ("활동이력", "이전에 봉사활동에 참여한 학생",
         "봉사활동 확인서", "기관 접수처에 방문 제출"),
        ("응시이력", "지정된 시험에 응시한 사람",
         "시험 응시확인서", "접수 홈페이지를 통해 신청"),
        ("국적", "국적에 관계없이 참여할 수 있는 학생",
         "신분증 사본", "온라인 신청서를 작성하여 접수"),
        ("거주", "거주 지역의 제한 없이 지원 가능한 사람",
         "주민등록등본", "접수 담당 부서로 등기우편 발송"),
        ("소득", "소득 기준을 충족하는 가구의 대학생",
         "소득금액증명서", "모든 증빙자료를 원본으로 제출"),
        ("가족", "보호자가 한 명인 가구에 속한 학생",
         "가족관계증명서", "서류 원본을 담당 부서에 제출"),
        ("장애", "본인이나 보호자에게 장애가 있는 학생",
         "장애인증명서", "신청서와 함께 서류를 이메일로 전송"),
        ("자격취득", "관련 자격을 이미 취득한 사람",
         "자격증 사본", "신청 시스템에서 접수"),
        ("추천", "소속 학과장의 추천을 받은 학생",
         "학과장추천서", "소속 학과 사무실을 방문하여 제출"),
        ("팀조건", "담당 교수가 참여하는 팀",
         "지도교수 확인서", "대표자가 팀을 대신하여 온라인 접수"),
        ("전공", "관련 분야를 전공하는 학부생",
         "전공 이수확인서", "신청서 원본을 행정실로 제출"),
        ("학년", "2학년 이상인 재학생",
         "학적증명서", "준비한 자료를 우편으로 제출"),
        ("수강", "직전 학기에 해당 강의를 수강한 학생",
         "강의 수강확인서", "서류를 출력하여 접수처에 제출"),
    ]

    for family, person, document, method in triples:
        contexts = [
            (
                f"지원할 수 있는 사람은 {person}입니다. "
                f"제출할 자료는 {document}이며, {method}합니다."
            ),
            (
                f"모집 대상: {person}. "
                f"제출 자료: {document}. 접수 방식: {method}."
            ),
        ]
        for context in contexts:
            add(family, person, context, "applicant_criteria")
            add(family, document, context, "required_document")
            add(family, method, context, "submission_method")

    exclusions = [
        ("학적", "재학 상태를 유지하는 학생", "현재 휴학 중인 학생"),
        ("이력", "동일한 지원을 받은 이력이 없는 학생",
         "동일한 지원을 이미 받은 학생"),
        ("졸업", "아직 학위를 취득하지 않은 재학생", "이미 졸업한 사람"),
        ("거주", "해당 지역에 거주하는 학생",
         "해당 지역에 거주하지 않는 학생"),
        ("참석", "교육 일정 전체에 참석할 수 있는 사람",
         "교육 일정 전체에 참석할 수 없는 사람"),
        ("추천", "기관의 추천을 받은 사람", "기관의 추천을 받지 않은 사람"),
        ("기간", "수업연한 이내의 재학생", "수업연한을 초과한 학생"),
        ("징계", "징계받은 사실이 없는 학생", "학칙에 따라 징계받은 학생"),
    ]

    for family, allowed, excluded in exclusions:
        contexts = [
            (
                f"{allowed}은 신청할 수 있습니다. "
                f"{excluded}은 신청할 수 없습니다."
            ),
            f"지원 자격: {allowed}. 선발 제외 대상: {excluded}.",
        ]
        for context in contexts:
            add(
                "가능불가_" + family, allowed,
                context, "applicant_criteria",
            )
            add(
                "가능불가_" + family, excluded,
                context, "applicant_exclusion",
            )

    selections = [
        ("성적", "평균평점 3.0 이상인 재학생",
         "서류 점수와 면접 점수를 합산하여 선발"),
        ("학점", "직전 학기 10학점 이상 이수한 학생",
         "이수학점이 많은 순서로 우선 선발"),
        ("전공", "관련 학과에 재학 중인 학생",
         "전공 이해도와 활동 계획을 평가하여 선발"),
        ("경험", "관련 활동 경험이 있는 학생",
         "활동 경력과 면접 결과를 종합하여 선발"),
        ("소득", "정해진 소득 기준을 충족하는 학생",
         "성적과 가구 소득을 함께 고려하여 선발"),
        ("의지", "프로그램 전체 일정에 참여 가능한 학생",
         "지원 동기와 참여 계획을 심사하여 선발"),
        ("동점", "본교에 재학 중인 학생",
         "동점자는 누적평점이 높은 순서로 선발"),
        ("배점", "지원 자격을 충족한 학생",
         "학업성적 40점과 면접 60점을 반영하여 선발"),
    ]

    for family, criterion, selection in selections:
        contexts = [
            (
                f"신청 자격은 {criterion}입니다. "
                f"선발 방법은 {selection}합니다."
            ),
            f"모집 대상: {criterion}. 심사 기준: {selection}.",
        ]
        for context in contexts:
            add(
                "자격심사_" + family, criterion,
                context, "applicant_criteria",
            )
            add(
                "자격심사_" + family, selection,
                context, "selection_criteria",
            )

    formats = [
        ("에세이", "에세이", "글꼴과 글자 크기는 지정된 형식을 사용"),
        ("계획서", "학업계획서", "줄 간격은 150퍼센트로 작성"),
        ("보고서", "활동보고서", "파일 형식은 PDF로 변환"),
        ("동의서", "개인정보 이용 동의서", "검정색 글씨와 지정된 서체 사용"),
        ("지원서", "프로그램 지원서", "첨부 양식의 항목 순서를 변경하지 않음"),
        ("추천서", "담당자 추천서", "문서 여백과 글자 크기를 지정대로 설정"),
        ("제안서", "연구 제안서", "문서 전체를 하나의 파일로 병합"),
        ("확인서", "활동 확인서", "작성 예시는 첨부 안내를 참고"),
    ]

    for family, document, formatting in formats:
        contexts = [
            f"제출 서류는 {document}입니다. 작성 안내: {formatting}.",
            f"제출 자료: {document}. 파일 작성 형식: {formatting}.",
        ]
        for context in contexts:
            add(
                "서류형식_" + family, document,
                context, "required_document",
            )
            add(
                "서류형식_" + family, formatting,
                context, "other",
            )

    return rows


class ContrastClassifier(ClassifierMixin, BaseEstimator):
    def __init__(self, estimator, use_authored=False):
        self.estimator = estimator
        self.use_authored = use_authored

    def fit(self, X, y):
        texts, labels = list(X), list(y)
        self.reviewed_rows_ = len(texts)

        authored = examples() if self.use_authored else []
        self.authored_examples_ = authored
        self.authored_sha256_ = hashlib.sha256(
            json.dumps(
                authored,
                ensure_ascii=False,
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()

        seen = {
            (str(text), str(label))
            for text, label in zip(texts, labels)
        }
        added = 0

        for row in authored:
            text = (
                "값: " + row["text"]
                + "\n근거: " + row["evidence"]
            )
            pair = (text, row["label"])

            if pair not in seen:
                texts.append(text)
                labels.append(row["label"])
                seen.add(pair)
                added += 1

        # 각 교차검증의 학습 묶음에만 추가한다.
        self.authored_rows_ = added
        self.estimator_ = clone(self.estimator)
        self.estimator_.fit(
            np.asarray(texts),
            np.asarray(labels),
        )
        self.classes_ = self.estimator_.classes_
        return self

    def predict(self, X):
        return self.estimator_.predict(X)

    def predict_proba(self, X):
        return self.estimator_.predict_proba(X)


class FocusContext(BaseEstimator):
    def fit(self, X, y=None):
        return self

    def transform(self, X):
        result = []

        for item in X:
            value, separator, context = str(item).partition("\n근거:")
            target = value.removeprefix("값:").strip()

            clauses = [
                clause.strip()
                for clause in re.split(
                    r"(?<=[.!?])\s+|\n+",
                    context,
                )
                if clause.strip()
            ]
            normalized_target = re.sub(r"\s+", "", target)

            if len(clauses) > 1 and normalized_target:
                def score(clause):
                    normalized_clause = re.sub(r"\s+", "", clause)
                    return (
                        int(normalized_target in normalized_clause),
                        SequenceMatcher(
                            None,
                            normalized_target,
                            normalized_clause,
                        ).ratio(),
                    )

                context = max(clauses, key=score)

            result.append(value + separator + context)

        return np.asarray(result)