# NOW Rank v1.12 · Evidence Clean + BIG KINDS

## 핵심 변경

1. NAVER Name Pulse를 "처리 성공"과 "검색량 신호 존재"로 분리합니다.
   - API 정상 + 정확 의원명 키워드 반환 + 검색량 > 0: OBSERVED
   - API 정상 + 정확 의원명 키워드 미반환 또는 검색량 0: ZERO (정상 처리)
   - HTTP/인증/타임아웃 등 실제 요청 실패: MISSING
   - Keyword Tool 요청은 낮은 동시성과 재시도로 안정성을 높였습니다.

2. NAVER Trend / Common Sensor / NAVER HTML을 퇴역했습니다.
   - 관리자 KPI와 수집상태 판정에서 제거
   - NOW Rank 계산에서 제거
   - NAVER News API는 별도의 뉴스 원천으로 계속 사용할 수 있습니다.

3. 수집상태를 핵심 경로 기준으로 재정의했습니다.
   - GOOD(양호): Name Pulse + 뉴스 핵심 경로가 정상 처리
   - NEUTRAL(중립): 핵심 경로 중 하나가 실제 실패/이월
   - POOR(미비): 핵심 경로 둘 다 실제 실패
   - 선택적/미설정 보강 센서는 상태를 불필요하게 악화시키지 않습니다.

4. BIG KINDS Open API 보강을 추가했습니다.
   - `BIGKINDS_ACCESS_KEY`가 설정되면 상위/급등/이벤트 우선 인물을 보강합니다.
   - 뉴스 제목과 사건 분류, 연관어를 스냅샷에 저장합니다.
   - BIG KINDS는 현재 순위 점수를 직접 부풀리는 용도가 아니라 뉴스 근거와 WHY NOW 설명 품질 보강에 사용합니다.
   - `BIGKINDS_ENRICH_TOP_N` 기본값은 30입니다.

5. 메인 WHY NOW
   - BIG KINDS 기사 제목과 연관어까지 후보에 포함합니다.
   - 상단 키워드 최대 15개, 줄바꿈 노출 구조를 유지합니다.

## 배포

이 버전은 프론트만 바뀐 것이 아니므로 ZIP의 폴더 구조 전체를 저장소 루트에 덮어써야 합니다.

BIG KINDS 키가 아직 없어도 기존 수집과 Name Pulse/상태 수정은 정상 동작합니다. 키를 추가한 뒤 다음 관리자 Refresh부터 BIG KINDS 보강이 활성화됩니다.
