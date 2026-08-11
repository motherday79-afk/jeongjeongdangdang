# 정정당당 NOW Rank v1.5 · Keyless-First Consensus

이 버전은 **사용 가능한 공개 데이터를 먼저 최대한 활용하고, 막히는 원천은 관리자에서 상태를 확인하는 구조**로 확장합니다.

## 핵심 원칙
- 기사 수 하나로 핫함을 결정하지 않음
- `검색·프로필 급상승 / 뉴스 급상승 / 포털·SNS 확산 / 이슈 중심성 / 신선도·가속도` 5축
- API 키가 없어도 Google Trends, Google News, Wikimedia, 정정당당 내부 관심 데이터를 사용
- NAVER/Daum 공개 검색결과 HTML은 **robots.txt가 허용하고 정상 응답하는 경우에 한해** 299명 전수 관측 시도
- CAPTCHA, 로그인 우회, 차단 회피, 프록시 회전 등은 하지 않음
- HTML 구조 변경/429/403/robots 차단은 관리자에 `DEGRADED/BLOCKED`로 표시
- 검색결과 문서 수는 실제 사용자 검색 횟수로 부르지 않음
- YouTube `/results`는 robots.txt가 자동 수집을 금지하면 HTML 스크래핑하지 않고 `ROBOTS_BLOCKED` 표시. 공식 API 키가 있으면 API 방식으로 보강

## Keyless 데이터층
1. **Google Trends Trending Now (KR)**
   - 급상승 검색어, 근사 검색량, 신선도
2. **Google News RSS**
   - 299명 전수 뉴스, 최근 6h/24h/7d, 출처 다양성, 이벤트 기사
3. **Wikimedia Pageviews**
   - 상위 후보의 시간별 실제 문서 조회 증가율
4. **NAVER Search HTML (opportunistic)**
   - robots 허용 시 검색결과 표면의 이름 노출·최근성·이벤트 연관 관측
5. **Daum Search HTML (opportunistic)**
   - robots 허용 시 동일 관측
6. **정정당당 내부 관심 데이터**
   - 검색, 프로필 조회, 비교분석 선택을 6시간 버킷으로 저장

## 선택 API
- `NAVER_API_HUB_CLIENT_ID`, `NAVER_API_HUB_CLIENT_SECRET`
- `KAKAO_REST_API_KEY`
- `YOUTUBE_API_KEY`
- `X_BEARER_TOKEN`

API는 없어도 동작하며, 연결되면 추가 센서로 사용합니다.

## Refresh 흐름
1. Google Trends + robots 상태 점검
2. 299명 Google News + 허용된 NAVER/Daum HTML 전수 수집
3. Google Trends 매칭/뉴스/이벤트 상위 후보를 Wikimedia 및 선택 API로 보강
4. 이슈 군집과 인물 중심성 분석
5. Preview
6. 관리자가 Publish
7. Redis에 6시간 스냅샷 저장

## 관리자 원천 상태
Preview에 다음 상태가 표시됩니다.
- `OK/READY`: 정상
- `DEGRADED`: 일부 요청 실패/차단
- `BLOCKED`: 응답 차단 또는 챌린지 페이지
- `ROBOTS_BLOCKED`: robots.txt상 자동 수집 금지
- `ERROR`: 네트워크/파싱 오류

차단된 원천은 점수에서 자동 제외되고 다른 원천으로 계산합니다.

## 환경변수
기존 필수값은 그대로입니다.
- `ADMIN_ID`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

선택:
- `KEYLESS_ENRICH_TOP_N=50` (10~80)
- `YOUTUBE_API_KEY`
- `KAKAO_REST_API_KEY`
- `NAVER_API_HUB_CLIENT_ID`
- `NAVER_API_HUB_CLIENT_SECRET`
- `X_BEARER_TOKEN`

## 적용
ZIP 전체를 GitHub 저장소 루트에 덮어쓰기 → Commit → Vercel 자동 배포.
환경변수 추가는 필수가 아닙니다.
