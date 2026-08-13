# NOW Rank v1.14.6 — 상세페이지 실제 순위 변화 추적 복구

- 의원 상세페이지 `NOW Rank 변화 추적`이 `N/A`로 보이던 구조를 제거했습니다.
- 기존 PUBLIC Attention 시계열이 아니라 **실제 게시된 NOW Rank 스냅샷의 순위 이력**을 사용합니다.
- 상세페이지를 여는 즉시 `previousRank → current rank`를 먼저 표시합니다.
- 이후 `/api/rank/history?days=7&name=의원이름`을 lazy-load 하여 최근 7일 실제 게시 이력을 선 그래프로 갱신합니다.
- 메인 페이지 초기 로딩에서는 history를 호출하지 않으므로 v1.14.3의 즉시 노출 성능을 유지합니다.
- 수동 게시 횟수가 일정하지 않아도 실제 publication time으로 최근 7일을 필터링합니다.
