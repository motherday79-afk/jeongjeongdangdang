# NOW Rank v1.14.3 — Instant Main Hotfix

## 목적
메인 새로고침 시 NOW Rank가 수십 초 동안 비어 있는 문제를 없애는 체감속도 패치입니다.

## 변경
- 마지막 실제 게시 스냅샷을 브라우저 localStorage에 저장하고 다음 새로고침 때 즉시 렌더링
- 네트워크 CURRENT 확인은 화면 표시 후 백그라운드 재검증
- 관리자 게시/롤백 직후 같은 브라우저의 메인 캐시를 방금 게시한 정확한 스냅샷으로 즉시 갱신
- `/api/rank/current`를 무거운 admin gateway에서 분리한 전용 경량 Vercel Function으로 실행
- public CURRENT는 30초 edge cache, stale-while-revalidate 없음
- 더 새로운 로컬 publication을 오래된 CDN 응답이 덮어쓰지 못하도록 publication 비교
- WHY NOW 기사 토큰 분석을 스냅샷 단위 memoize

## Vercel Functions
2개입니다. Hobby의 12개 제한 안에 있습니다.
- api/public-current.js
- api/gateway.js

## 기대 동작
- 최초 1회: 경량 CURRENT endpoint에서 데이터를 받음
- 이후 새로고침: 마지막 실제 게시 데이터가 즉시 표시되고 최신 여부를 뒤에서 확인
- 관리자 게시 직후: 방금 게시한 스냅샷을 localStorage에 같이 넣으므로 메인 새로고침 시 이전 게시본이 먼저 보이지 않음
