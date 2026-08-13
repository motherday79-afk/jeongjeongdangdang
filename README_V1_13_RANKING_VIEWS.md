# NOW Rank v1.13 · Ranking Views + Refresh Delta

## 메인 순위 탭 개편
- 전체: 기존 종합 NOW Rank
- 검색 관심: 대중 관심/검색 신호 기준 별도 순위
- 언론 주목: 뉴스 모멘텀(최근 기사량, 출처 다양성, 신선도/가속도) 기준 별도 순위
- 기존 6시간 급상승 / 24시간 급상승 / 7일 최고순위 탭 제거

## 직전 갱신 대비 변화
- 게시 직전 스냅샷의 순위와 현재 순위를 직접 비교
- 상승: ▲ N
- 하락: ▼ N
- 유지: ―
- 비교 스냅샷이 없을 때만 '첫 게시' 표시
- 의원 상세 프로필과 전체 순위 표에서 확인 가능

## 백엔드 스냅샷 추가 필드
- previousRank
- changeRefresh (change6h는 하위 호환용으로 동일 값 유지)
- searchRank / searchScore / searchRaw
- mediaRank / mediaScore / mediaRaw

## 호환성
새 Refresh/게시 이전의 기존 스냅샷에서도 프론트가 metrics / nowComponents를 사용해 검색 관심 및 언론 주목 순위를 계산하는 fallback을 포함합니다.
새 버전 배포 후 관리자 Refresh → 게시를 한 번 실행하면 서버 스냅샷에도 별도 순위 필드가 저장됩니다.
