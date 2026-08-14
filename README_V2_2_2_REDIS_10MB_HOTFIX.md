# v2.2.2 Redis 10MB Refresh Hotfix

## 원인
LOCAL NOW 확장으로 Refresh 대상이 국회의원 299명에서 현역 정치인 542명으로 증가하면서,
기존 Refresh draft가 모든 인물의 뉴스/포털/증거 신호를 하나의 JSON으로 누적했습니다.
배치 후 매번 이 전체 JSON을 Upstash Redis에 다시 SET하므로 단일 REST 요청이 10 MiB를 넘을 수 있었습니다.

## 수정
- `lib/store.js`의 대형 JSON 저장에 gzip + base64 압축을 자동 적용합니다.
- 1 MiB 미만 데이터는 기존 JSON 형식을 그대로 유지합니다.
- 기존 비압축 Redis 데이터와 새 압축 데이터 모두 자동으로 읽습니다.
- 압축 스냅샷을 rollback/history의 MGET 경로에서도 정상 해제하도록 호환 처리했습니다.
- 압축 후 값이 8 MiB를 넘으면 Upstash의 10 MiB 요청 한계에 닿기 전에 명확한 오류를 냅니다.

## 배포 후
기존 실패한 Refresh는 버리고 `NOW Rank 새로고침`을 처음부터 다시 실행하는 것을 권장합니다.
Redis 데이터 삭제나 환경변수 변경은 필요하지 않습니다.
