# 정참시 v2.2.23 · 전체 사진 회귀 복구 / 비파괴 검수

이번 버전은 v2.2.16 이후 사진을 `/api/person-photo` 단일 서버 경로로 통합하면서 발생한 대량 사진 소실 회귀를 복구합니다.

## 핵심 수정

- 국회의원 299명
  - 서버 국회 공식 명단: 환경변수 KEY → `KEY=sample` → no-key 순서로 재시도
  - 국회 공식 명단을 Redis `last-known-good`에 TTL 없이 보존
  - 서버가 순간 실패해도 브라우저가 v2.2.15의 국회 공식 API 경로를 비상 fallback으로 사용
  - 국회의원 자동검수는 웹검색 사진으로 임의 교체하지 않고 국회 공식사진만 허용
- 정부 주요 인사 20명
  - 서버 검증 검색 유지
  - 확인 가능한 정부 공식 장관실/부처 페이지 15명에 `officialProfileUrl` 힌트 등록
  - 서버 실패 시 브라우저 Wikimedia/Wikipedia 검증 fallback
  - 한성숙 총리는 국무조정실 공식사진 고정 우선
- 전체 사진 캐시
  - 기존 v5 positive 캐시는 유지
  - 대량 실패를 고착시킨 negative cache는 v6로 분리
  - 인물별 `last-good` Redis 레코드를 TTL 없이 별도 보존
  - 검수/자동복구 시 기존 cache를 먼저 삭제하지 않음
  - 새 후보는 실제 이미지 응답과 검증이 끝난 뒤에만 교체
- 브라우저
  - 서버 재시도 → 기존 client last-known-good → 국회 공식/Wikimedia 비상경로 순서
  - 실패한 URL과 정확히 같은 client cache만 제거
  - 서버 사진 버전을 `v=8`로 올려 이전 실패 응답과 분리

## 검수

`scripts/verify_photo_roster.js`

- 총 사진 대상 562명 확인
- 국회의원 299 / 광역단체장 16 / 기초단체장 227 / 정부 주요 인사 20 확인
- ID 중복 / 필수 프로필 필드 / 브라우저 fail-safe 코드 존재 확인
- 파괴적 audit invalidate가 다시 들어오면 실패 처리

`scripts/verify_photo_live.js`

배포 이후 실제 서버에서 562명 `/api/person-photo`를 전원 호출하는 strict 검사입니다.

```bash
JJDD_BASE_URL=https://배포주소 node scripts/verify_photo_live.js
```

HTTP 200, `image/*`, 최소 바이트 조건 중 하나라도 통과하지 못한 인물이 있으면 exit code 1로 종료하고 실패 명단을 출력합니다.

## 운영 원칙

사진 검수는 이제 "문제 발견"과 "사진 삭제"가 분리되어 있습니다. 외부 검색/API 장애가 전체 인물 사진의 소실로 번지지 않도록 마지막 정상 사진을 보존하는 것이 우선입니다.
