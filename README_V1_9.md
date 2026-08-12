# 정정당당 NOW Rank v1.9 · Sensor Recovery

## 목표
v1.8 감사 결과에서 6명 벤치마크 모두 NAVER 검색트렌드/Blog/Cafe/Web가 MISSING인 상태가 확인되어, 이번 버전은 점수 조정보다 NAVER 공통센서 복구와 원인 노출을 우선합니다.

## 핵심 변경
1. NAVER 인증 자동 판별
   - 우선: `NAVER_API_HUB_CLIENT_ID` + `NAVER_API_HUB_CLIENT_SECRET`
   - 임시 fallback: `NAVER_CLIENT_ID` + `NAVER_CLIENT_SECRET` 또는 `NAVER_DEVELOPERS_CLIENT_ID` + `NAVER_DEVELOPERS_CLIENT_SECRET`
   - API HUB와 기존 Developers는 endpoint/header를 자동 분리합니다.
2. Refresh 시작 시 NAVER Search + Search Trend probe를 1회 실행합니다.
   - 인증/권한/HTTP 오류가 있으면 299명 반복 호출을 중단하고 정확한 실패 사유를 기록합니다.
3. 감사 화면에서 MISSING 원인을 숨기지 않습니다.
   - HTTP status / 인증 미설정 / timeout / response 오류 등을 `원인 / 실제 매칭` 열에 표시합니다.
   - 통합 뉴스 센서는 Google/NAVER 각각의 상태와 실패 사유를 표시합니다.
4. Wikipedia는 실제 매칭된 `pageTitle`과 hourly/daily fallback 방식까지 표시합니다.
5. 검색·프로필 축을 내부 5개 요소로 분해합니다.
   - NAVER 검색트렌드 / Google 급상승 / Wikipedia / 정정당당 내부관심 / 검색표면
   - 각 원점수, 설정 가중치, 가용도, 검색축 내 실제 기여도를 표시합니다.
6. 이슈 중심성을 더 깊게 분해합니다.
   - 글로벌 정치뉴스 / 자동군집 / 수동키워드
   - 자동군집은 군집어, 기사 수, 출처 수, 본인 등장 수, 공동 등장 정치인을 표시합니다.
7. 수집 모델 버전을 `common-sensor-v1.1`로 올렸습니다.
   - 첫 v1.9 스냅샷은 새 기준선으로 처리됩니다.

## Refresh 후 가장 먼저 볼 것
- `NAVER API: OK`인지
- `NAVER 트렌드 전수 299/299`에 가까운지
- `NAVER 공통센서 299/299`에 가까운지
- 천하람 / 김민석 / 정청래 / 서미화 / 한동훈 / 김종민의 감사 상세

## NAVER가 UNCONFIGURED라면
Vercel 환경변수에 NAVER API HUB 인증정보를 추가한 뒤 Redeploy 합니다.

```text
NAVER_API_HUB_CLIENT_ID=...
NAVER_API_HUB_CLIENT_SECRET=...
```

기존 NAVER Developers 애플리케이션 키를 이미 갖고 있다면 유예기간용 fallback도 인식합니다.

```text
NAVER_CLIENT_ID=...
NAVER_CLIENT_SECRET=...
```
