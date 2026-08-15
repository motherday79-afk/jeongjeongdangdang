# 정참시 v2.2.15 · 고해상도 인물사진 검색 + 게시물 뒤로가기 복구

이번 패치는 지방단체장 사진 로딩을 서버 검색 프록시 방식으로 다시 설계했습니다. 기존 공식 협의회 사진만 찾는 방식에서 벗어나, `이름 + 실제 직위 + 지역`으로 Kakao Image Search(설정 시)와 Bing 이미지 검색을 조회하고 원문 페이지 문맥을 교차검증한 뒤 고해상도 후보를 선택합니다. 검색 결과는 Redis에 캐시하고 `/api/local-photo`가 이미지를 프록시해 브라우저의 핫링크/CORS 문제를 줄입니다.

또한 메인 메뉴, 정뮤니티 상세, 정참시News 기사, 정치인 상세 모달 사이의 브라우저 History 상태를 통합했습니다. 기사/게시물을 연 뒤 브라우저 뒤로가기를 누르면 정참시를 이탈하지 않고 바로 직전 목록/페이지로 복귀합니다.

자세한 내용은 `README_V2_2_15_PHOTO_SEARCH_BACK_HISTORY.md`를 참고하세요.

# 정참시 v2.2.12 · 정뮤니티 작성자 + PRO 상세분석 미리보기

메인 메뉴를 `실시간 인물순위 → 정뮤니티 → 정참시News → 비교분석 → MY` 순서로 정리하고, 관리자에 정뮤니티/정참시News 작성 대기함·검토·선택 게시·예약 게시 기능을 추가했습니다. 자세한 내용은 `README_V2_2_11_EDITORIAL_SCHEDULER.md`를 참고하세요.

# v2.2.9 · 관리자 시연회원 150명

자세한 내용은 `README_V2_2_9_SYNTHETIC_MEMBERS.md`를 참고하세요.

# 정참시 v2.2.8

관리자 워크스페이스 메뉴화와 회원 아이디/비밀번호 복구 관리 기능을 추가했습니다. 자세한 내용은 `README_V2_2_8_ADMIN_WORKSPACE_USER_RECOVERY.md`를 참고하세요.

> 최신 UI/기능 패치: `README_V2_2_7_REFERENCE_COMPARE_SEARCH_ALERTS.md`

# 정참시 v2.2.7 · Reference Compare + Search + Alerts

최신 변경사항은 `README_V2_2_6_CLEAN_PROFILE_PRO_NEWS.md`를 확인하세요.

# 정참시 v2.2.5 · BRAND FINAL

서비스 브랜드를 **정참시(정치에 참여할 시간)**로 전환했습니다. 메인 좌측 상단은 `정참시 / 정치에 참여할 시간` 2단 로고로 표시하며, `정참시 NOW Rank`, `WHY NOW`, `LOCAL NOW`, `정뮤니티`, `정참시News`, `정참시 PLUS`를 현재 브랜드 모듈명으로 사용합니다. 자세한 내용은 `README_V2_2_5_JEONGCHAMSI_REBRAND.md`를 확인하세요.

# v2.2.4 · FINAL POLISH

최신 변경사항은 `README_V2_2_4_FINAL_POLISH.md`를 먼저 확인하세요. 기초단체장 메인 표기를 `고양시장`, `용인시장`처럼 직위만 보이도록 정리하고, 실제 방문 집계를 유지한 채 관리자에서 오늘/누적 방문 표시값을 보정할 수 있는 기능을 추가했습니다. 현재 접속 인원은 실제 데이터만 표시합니다.

# v2.2.3 · LOCAL COMMUNITY

최신 변경사항은 `README_V2_2_3_LOCAL_COMMUNITY.md`를 먼저 확인하세요. 지방단체장 Name Pulse 보강, 직위 표시 정리, 공식 협의회 사진 자동 확인, 방문자 현황, 커뮤니티 게시판을 포함합니다.

# CURRENT RELEASE

- v2.2.2 Redis 10MB Refresh Hotfix: `README_V2_2_2_REDIS_10MB_HOTFIX.md`

# CURRENT RELEASE: v2.2.1 · 관리자 비밀번호 변경

관리자 페이지에서 현재 비밀번호를 확인한 뒤 8자 이상의 새 비밀번호로 직접 변경할 수 있습니다. 변경값은 Redis에 scrypt 해시로 저장되며 이후 로그인에 우선 적용됩니다. 자세한 내용은 `README_V2_2_1_ADMIN_PASSWORD_CHANGE.md`를 확인하세요.

# CURRENT RELEASE: v2.2 LOCAL NOW

국회의원 299명에 광역단체장 16명·기초단체장 227명을 추가해 현역 정치인 542명으로 NOW Rank를 확장했습니다. 메인과 WHY NOW는 `전체 / 국회의원 / 광역단체장 / 기초단체장` 범위로 분리되며, 지방단체장 사진은 공식 출처에서 신원이 검증된 경우에만 노출합니다. 자세한 내용은 `README_V2_2_LOCAL_NOW.md`를 확인하세요.

# CURRENT RELEASE: v2.1 PLUS Beta

실제 PLUS 권한/관심 의원·이슈/개인 대시보드/30일·1년 히스토리/정치인 비교와 CMS 결제 준비 계약을 추가했습니다. 자세한 내용은 `README_V2_1_PLUS_BETA.md`를 확인하세요.

# CURRENT RELEASE: v2.0.1 Simple ID Login

See `README_V2_0_1_SIMPLE_ID_LOGIN.md` for the latest account-login patch.

회원가입/로그인, FREE·PLUS·PRO·ADMIN 등급, MY, 선택적 관심 정당 별도 동의·암호화, 관리자 등급 관리가 포함된 1차 회원 빌드입니다. 자세한 내용은 `README_V2_0_ACCOUNT_MEMBERSHIP_FOUNDATION.md`를 확인하세요.


## v1.15 · Member Data Integrity
- 국회 공식 의원사진 우선 / 이름 기반 위키 사진 추정 금지
- ALLNAMEMBER 기반 당선대수 자동 검증 및 비연속 당선 선수 계산
- 의원 ID 기반 사진 캐시 분리
- NOW RANK 소개문을 정치 인텔리전스 서비스 설명으로 개편

# 정정당당 NOW Rank v1.14.8 — Roster Identity Hotfix

현재 배포본 안내는 `README_V1_14_8_ROSTER_IDENTITY_HOTFIX.md`를 먼저 확인하세요.

# 정정당당 NOW Rank v1.11 — Name Pulse Integrated

See `README_V1_11_NAMEPULSE_INTEGRATED.md` for this release.

# 정정당당 NOW Rank v1.7 · Common Sensor

## 이번 버전의 목적
v1.6에서 발견된 가장 큰 구조 문제는 `1차 점수가 낮은 인물 → 심층수집 제외 → 데이터가 계속 부족함 → 다음에도 낮은 점수`의 피드백 루프였습니다.

v1.7은 특정 정치인을 올리는 보정값을 넣지 않습니다. **299명 모두에게 같은 공통 센서를 먼저 적용**하고, 실패한 수집을 실제 0점과 구분합니다.

## 1. NAVER 공통 센서 · 299명 전수
NAVER API HUB가 설정되어 있으면 Refresh마다 전원에게 아래를 적용합니다.

- NAVER 검색어 트렌드 (DataLab)
- NAVER 뉴스 검색
- NAVER 블로그 검색
- NAVER 카페글 검색
- NAVER 웹문서 검색

검색어 트렌드는 API의 한 요청 최대 5개 그룹 제한에 맞춰 **공통 기준(anchor) 1명 + 의원 최대 4명**씩 비교합니다. 공통 기준은 직전 공개 스냅샷의 1위 현역 의원을 사용하며, 첫 스냅샷에서는 roster의 첫 현역 의원을 사용합니다. 각 배치 결과는 같은 anchor 대비 비율로 재보정하므로 배치가 달라도 비교 가능한 내부 지수로 저장합니다.

검색어 그룹은 이름 하나만 사용하지 않고 `이름 / 이름 의원 / 이름 국회의원 / 이름+정당 / 이름+지역구` 등의 별칭 묶음을 사용합니다.

## 2. 수집 상태 3분리
각 채널에 아래 상태를 저장합니다.

- `OBSERVED`: 정상 관측했고 신호가 있음
- `ZERO`: 정상 관측했지만 실제 신호가 0
- `MISSING`: API 미설정, 차단, 오류, 이번 Refresh 미수집 등

`MISSING`은 0점으로 취급하지 않습니다. 직전 정상값이 있으면 시간감쇠한 값으로 짧게 carry하고 해당 채널의 계산 가중치도 낮춥니다. 연속 실패 시 carry 값이 계속 감쇠합니다.

## 3. 심층수집 피드백 루프 제거
Wikipedia / NAVER VIEW HTML / Daum Blog HTML / YouTube / X 같은 무거운 보강은 전원 무차별 호출하지 않습니다.

대신 후보군을 아래의 합집합으로 만듭니다. Keyless 보강 풀과 YouTube/X API 호출 풀은 분리하며, YouTube/X는 별도 상한(`YOUTUBE_ENRICH_TOP_N`, `X_ENRICH_TOP_N`)을 둡니다.

1. 현재 이벤트 직접 연계 인물
2. NAVER 검색어 트렌드 강한 인물
3. 직전 스냅샷 상위 40명
4. 6시간마다 바뀌는 순환 대상
5. 1차 공통센서 예비 상위

따라서 한 번 하위권으로 떨어졌다는 이유만으로 영구적으로 심층수집 대상에서 제외되지 않습니다.

## 4. 점수 계산 변화
- 검색·프로필 축에서 NAVER 검색어 트렌드를 가장 강한 공통 센서로 사용
- NAVER Blog/Cafe/Web API를 포털·SNS 확산 축의 공식 공통 센서로 추가
- 실제 `ZERO`는 0으로 반영하지만 `MISSING`은 가중치 재분배
- 이전 스냅샷에서 관측된 채널이 이번에 실패하면 감쇠 기억 적용
- RAW 점수와 순위는 특정 인물 baseline/기본점수를 사용하지 않음
- 화면 표시용 상대지수(v1.6.1 방식)는 유지

## 5. 관리자 Refresh 순서
1. 원천 상태 확인 + 글로벌 정치뉴스 수집
2. **NAVER 검색 관심 299명 전수 측정**
3. **NAVER News/Blog/Cafe/Web + Google News 공통센서 전수 수집**
4. 이벤트/트렌드/직전상위/순환 대상 심층 보강
5. 미리보기 계산
6. 관리자가 게시해야 공개 Redis 스냅샷 변경

미리보기에는 `NAVER 트렌드 전수관측 n/299`, `NAVER 공통센서 n/299`를 표시합니다. 299명 전수 관측이 깨졌는지를 순위보다 먼저 확인할 수 있습니다.

## 중요
이번 버전은 **데이터 수집 구조를 정상화하는 1차 개편**입니다. 이 결과를 보고 다음 단계에서 원천별 기여도 감사 화면과 가중치 재조정을 진행하는 것을 전제로 합니다.


## v1.14.9 추가
- 상세 NOW Rank 장기 변화 추적: 실제 게시마다 초경량 순위 이력 누적, 24h/7d/30d/1y 그래프.
- 자세한 내용: README_V1_14_9_LONGTERM_RANK_HISTORY.md