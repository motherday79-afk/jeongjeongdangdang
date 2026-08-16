# 정참시 · NOW Rank v2.3.0

## PERFORMANCE ARCHITECTURE

이번 버전은 기능 추가보다 운영 속도와 프로젝트 구조 정리에 집중합니다.

### 1. 빠른 Refresh
- 기본 Refresh는 542명을 매번 처음부터 다시 수집하지 않습니다.
- 직전 정상 raw signal 캐시와 공개 직전 스냅샷을 먼저 복원합니다.
- TOP40, 직전 급등·급락, Google Trends 감지 인물, 전체 정치뉴스에서 새로 언급된 인물, 3시간 순환 표본만 우선 새 수집합니다.
- 나머지 인물은 직전 정상값을 그대로 유지한 뒤 전체 542명 순위를 다시 계산합니다.
- NAVER Name Pulse는 월간 검색량 성격에 맞춰 기본 12시간 단위로 필요한 인물만 다시 조회합니다.
- 빠른 Refresh의 심층 보강 대상은 기본 45명으로 줄였습니다.
- 관리자에는 `빠른 Refresh`와 `542명 전체 재수집`을 분리해 운영자가 선택할 수 있습니다.
- 전체 재수집은 기존과 같이 542명 원천을 모두 다시 읽는 안전장치입니다.

### 2. 사진 경량화
- `/api/person-photo`를 대형 관리자 Gateway에서 분리해 독립 Vercel Function으로 실행합니다.
- 브라우저/중간 CDN/Vercel CDN 캐시 헤더를 분리 적용합니다.
- 프론트 사진 cache version을 `v=230`으로 갱신했습니다.
- 자동 복구 재시도에서 불필요한 `Date.now()` cache-busting을 제거했습니다.
- 사진 검색/복구 로직과 562명 last-known-good 보호 구조는 그대로 유지합니다.

### 3. 중복·역사 파일 정리
- 버전별 README 21개를 제거하고 이 README + CHANGELOG로 통합했습니다.
- 운영 화면에서 사용하지 않던 Name Pulse 진단 페이지/API를 제거했습니다.
- 이미 `person-photo`로 통합된 과거 `local-photo` 호환 API 2개를 제거했습니다.
- 배포에 필요 없는 사진 검증 스크립트 2개를 패키지에서 제거했습니다.
- `api/public-current.js` 얇은 alias를 제거하고 `/api/rank/current.js`를 직접 public Function으로 배포합니다.
- 오래된 `.vercelignore`를 제거했습니다.

### 운영 권장
- 평소: `빠른 Refresh` → 미리보기 확인 → 게시
- 데이터 원천 전체를 다시 확인하고 싶을 때만: `542명 전체 재수집`
- 사진 전체검수는 Refresh와 별개로 관리자 `전체 인물 사진 검수`에서 실행

## 환경변수
기존 환경변수는 그대로 사용합니다. 선택적으로 아래 값을 조절할 수 있습니다.

- `QUICK_REFRESH_COLLECT_MAX=110` : 빠른 Refresh에서 직접 새 수집할 최대 후보 수
- `QUICK_ENRICH_TOP_N=45` : 빠른 Refresh 심층 보강 대상 수
- `NAME_PULSE_REFRESH_HOURS=12` : Name Pulse 재조회 기준 시간

