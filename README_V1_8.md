# 정정당당 NOW Rank v1.8 · Audit Console

## 목적
v1.7 Common Sensor의 수집/랭킹 구조는 유지하고, 관리자 검증 능력을 크게 확장합니다.
이번 버전의 핵심은 '순위를 더 만지는 것'이 아니라 '299명 전체의 점수가 왜 그렇게 나왔는지 보이게 하는 것'입니다.

## 변경사항
1. 관리자 미리보기를 TOP30 전용에서 현역 299명 전체 감사 콘솔로 변경
2. 보기 필터: 전체 / TOP30 / TOP50 / TOP100 / 급등 / 급락 / 데이터 이상
3. 이름·정당·지역 검색, 정당 필터, 다중 정렬 지원
4. 목록에 NOW / RAW / 6H 변화 / 6H 뉴스 / NAVER 트렌드 / 원천군 / 신뢰도 / 수집상태 노출
5. 인물 행 클릭 시 상세 감사 패널
   - 5개 운영축 원점수
   - 각 축의 실제 RAW 기여점수
   - 수집 가용도
   - 가중합 전 RAW, 원천군 캡 및 캡 적용 여부
   - NAVER Trend / Wikipedia / 검색표면 / 커뮤니티 / YouTube / X / 내부관심 세부 센서
   - 글로벌 이벤트 / 자동 이슈 군집 / 수동 이벤트 점수
   - 센서별 OBSERVED / ZERO / MISSING / carried 상태
   - 최근 뉴스 근거 제목
6. 데이터 이상 필터
   - 낮은 evidence confidence
   - 단일 원천
   - 다수 채널 MISSING
   - NAVER Trend 누락
   - NAVER Blog/Cafe 동시 누락 등
7. 모델 기준선 호환성 검사
   - v1.6 등 Common Sensor 이전 모델과의 순위 차이는 6시간 변화로 표시하지 않음
   - v1.7 / v1.8 Common Sensor 간에만 6시간 변동 비교

## 점수 산식
NOW Rank의 기존 v1.7 가중치는 변경하지 않았습니다.
감사용으로 가중치 적용 전/후의 구성요소와 원천 가용도만 추가 기록합니다.

## PATCH 대상
- admin.html
- api/admin/refresh.js
- api/_lib/score.js

기존 v1.7 전체 패키지가 정상 배포되어 있다면 위 3개 파일만 교체하면 됩니다.
