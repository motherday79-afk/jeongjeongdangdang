# 정정당당 NOW Rank v1.6 — Multi-Signal / Event-Centric

## 핵심 변경
- 장동혁 1위처럼 뉴스 단일원천이 전체 순위를 지배하는 문제를 구조적으로 수정
- Google News RSS 의원별 뉴스 + 글로벌 정치/핵심이슈 뉴스 코퍼스 분리 수집
- 이벤트 중심성은 `관리자가 특정 인물 점수를 입력`하는 방식이 아니라, 이벤트 뉴스 코퍼스에서 이름 등장·제목 등장·출처 다양성으로 산출
- NAVER / Daum 공개 검색결과 HTML은 robots 상태를 참고로 기록하되 1회 직접 요청을 시도. 403/429/CAPTCHA/로그인 요구가 나오면 우회하지 않고 BLOCKED
- NAVER View / Daum Blog를 2차 보강원천으로 추가
- YouTube 공개 검색 HTML을 상위 후보 보강 단계에서 직접 파싱 시도. 차단·동의·challenge 페이지면 자동 제외
- Wikimedia pageviews는 hourly 우선, 실패 시 daily fallback
- Google Trends Trending Now RSS 유지
- 정정당당 내부 검색/프로필/비교 트래픽 유지
- 독립 신호군이 하나뿐인 인물은 NOW 최대점수를 30점으로 제한하고, 0개면 18점으로 제한
- 관리자 미리보기에서 글로벌 이벤트 뉴스 건수/출처수와 각 원천 상태 표시

## 5축
1. 검색·프로필 급상승 25%
2. 뉴스 급상승 20%
3. 포털·SNS 확산 20%
4. 이슈 중심성 25%
5. 신선도·가속도 10%

## 운영 원칙
- 검색결과 HTML의 노출량은 `실제 검색량`으로 부르지 않음. 검색표면/콘텐츠 관심 신호임.
- CAPTCHA, 로그인, 403/429 차단은 우회하지 않음. 어드민에서 BLOCKED/ERROR로 표시 후 다른 원천으로 계산.
- 첫 Refresh에서 Google Trends/Wikipedia/HTML이 모두 실패하고 뉴스만 남는 경우 관리자 경고가 뜨며 게시를 권장하지 않음.
