# 정정당당 NOW Rank v1.3 Operational

## 이번 버전
1. 관리자 로그인 → Refresh → 미리보기 → 게시 → Redis 스냅샷 저장
2. 모바일 하단 NOW / 뉴스 / LIVE / 비교 / MY 메뉴 실제 동작 수정
3. NOW ISSUE의 데모 수치 제거 및 민주당 8·17 전당대회 실데이터 적용
4. 공개 페이지는 `/api/rank/current`의 최신 게시 스냅샷을 자동 로드
5. 최근 7일 게시 스냅샷을 불러와 `6시간 급상승 / 24시간 급상승 / 7일 최고순위` 계산

## GitHub에 올릴 구조
```text
/
  index.html
  admin.html
  vercel.json
  .env.example
  /data
    roster.json
  /api
    /_lib
      auth.js
      store.js
      collector.js
      score.js
    /admin
      login.js
      logout.js
      status.js
      refresh.js
      publish.js
      rollback.js
    /rank
      current.js
      history.js
```

## 관리자 주소
배포 후 `/admin.html`

예: `https://도메인/admin.html`

## Vercel 환경변수
필수:
- `ADMIN_ID`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Vercel Marketplace에서 Upstash Redis를 연결한 경우 프로젝트에 생성된 REST URL/Token을 위 이름으로 연결하면 됩니다.
코드는 `KV_REST_API_URL`, `KV_REST_API_TOKEN` 이름도 fallback으로 지원합니다.

네이버 실데이터 수집 권장:
- `NAVER_API_HUB_CLIENT_ID`
- `NAVER_API_HUB_CLIENT_SECRET`

선택:
- `DEFAULT_EVENT_TITLE`
- `DEFAULT_EVENT_KEYWORDS` (쉼표 구분)

## Refresh 동작
관리자에서 `NOW Rank 새로고침` 한 번을 누르면 브라우저가 자동으로:
1. Refresh draft 생성
2. 현역 299명을 12명씩 배치 수집
3. 전체 수집 완료
4. 순위 계산
5. 미리보기 TOP30 + 대폭 변동자 표시

이때 공개 사이트는 바뀌지 않습니다.

관리자가 `게시`를 눌러야:
- `jjdd:current` 갱신
- `jjdd:snapshot:<id>` 저장
- `jjdd:history`에 스냅샷 이력 추가
- 공개 사이트가 다음 로드부터 새 순위를 사용

`롤백`은 직전 게시 스냅샷을 다시 `jjdd:current`로 지정합니다.

## 데이터 수집
- NAVER API HUB 키가 있으면 `/search/v1/news`를 사용해 각 의원 최신 뉴스 최대 100건을 조회합니다.
- 각 기사 pubDate를 기준으로 최근 6시간 / 24시간 / 7일을 나눕니다.
- NAVER 키가 없거나 호출이 실패하면 Google News RSS로 fallback합니다.
- 같은 제목은 중복 제거하고, 의원 이름이 실제 제목/설명에 포함된 결과만 집계합니다.

## NOW Rank v1.3 운영축
첫 운영 백엔드는 **6시간 갱신을 실제로 돌리는 것**에 집중해 아래 5축을 실측합니다.
- 상대 급상승
- 최근 뉴스량
- 이벤트 중심성
- 출처 다양성
- 신선도·가속도

기존 정치 체급/선수는 이 운영점수에 직접 가산하지 않습니다.
기존 공개 관심 신호는 완전 동률 시 기술적 tie-break에만 극소량 사용합니다.

## NOW ISSUE
기존의 `100.0 / 98.1 / 81.1 이벤트 지수`, `8.9 누적 208,271표`, DEMO 사용자 투표를 제거했습니다.

대신 현재 화면에는:
- 8월 17일 대전 전당대회
- 본선 후보: 김민석 / 정청래 / 송영길
- NBS 2026.07.27~29 당대표 적합도
  - 전체: 정청래 21 / 김민석 19 / 송영길 6
  - 민주당 지지층: 정청래 34 / 김민석 29 / 송영길 9
- 예비경선 후보별 득표율 비공개

를 명확히 구분하여 표시합니다.

## 주의
GitHub에 `index.html`만 교체하면 관리자 백엔드는 동작하지 않습니다.
**이번 v1.3부터는 ZIP의 폴더 구조 전체를 저장소 루트에 올려야 합니다.**

환경변수와 Redis 연결을 하지 않은 상태에서는 공개 사이트는 기존 내장 스냅샷으로 정상 표시되지만 `/admin.html`의 Refresh/게시 기능은 활성화되지 않습니다.
