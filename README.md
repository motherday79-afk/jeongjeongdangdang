# 정정당당 NOW Rank v1.4.1 · Multi-Source Consensus

이번 버전은 NOW Rank를 **기사 수 순위가 아닌 다중 관심 신호 합의형 랭킹**으로 확장하고, 게시 스냅샷이 모바일에만 반영되던 초기 로딩 버그를 수정합니다.

## 핵심 수정
- PC/모바일 모두 페이지 첫 로드에서 `/api/rank/current` 게시 스냅샷을 즉시 읽음
- `resize` 이벤트에 의존하던 게시 데이터 로딩 제거
- 뉴스 / 포털·커뮤니티 / 영상·SNS / 이슈 중심성 / 신선도·가속도 5축
- 단일 원천만 강한 경우 상위 점수 제한 (Source Consensus)
- Google News RSS 단일 기사 수만으로 90~100점 불가
- 자동 이슈 군집 탐지 + 핵심 인물 중심성 계산
- 정정당당 자체 `검색 / 프로필 조회 / 비교분석` 신호를 6시간 버킷으로 축적
- 관리자 Refresh → 299명 수집 → 선택 원천 TOP N 보강 → 이슈 분석 → Preview → Publish

## 데이터 원천
기본:
- Google News RSS
- 정정당당 내부 관심 데이터

무료 연결 권장:
- `KAKAO_REST_API_KEY`: Daum 웹/블로그/카페/동영상 검색 결과의 최근 콘텐츠 발생 신호

선택:
- `YOUTUBE_API_KEY`: YouTube 최근 영상/조회 반응 보강 (TOP N만 조회)
- `NAVER_API_HUB_CLIENT_ID`, `NAVER_API_HUB_CLIENT_SECRET`: NAVER 뉴스 및 향후 Search Trend
- `X_BEARER_TOKEN`: X 최근 Post Counts (유료 가능)
- `ENRICH_TOP_N=20`

## 중요한 구분
Daum/Kakao의 `total_count`나 검색 결과 문서 수는 **실제 사용자의 검색 횟수**가 아닙니다. 검색량/검색추이는 공식 Search Trend 같은 직접 측정 원천이 연결된 경우에만 별도 신호로 취급합니다.

## GitHub 적용
이 ZIP의 내용을 저장소 루트에 그대로 덮어쓰고 Commit 하면 됩니다.
기존 Vercel 환경변수(`ADMIN_*`, `UPSTASH_*`)는 그대로 사용합니다.

관리자: `/admin.html`
