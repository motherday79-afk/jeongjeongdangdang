# 정참시 v2.6.1 · NOW ISSUE / WHY NOW HOTFIX


## v2.6.1 HOTFIX
- 오른쪽 NOW ISSUE를 전당대회/여론조사 전용 레이아웃에서 **대제목 / 소제목 / 내용** 3단 범용 콘텐츠로 변경했습니다.
- 기존에 저장된 NOW ISSUE 값은 최초 조회 시 새 3단 구조로 자동 마이그레이션됩니다.
- WHY NOW의 HOT 키워드에 마우스를 올릴 때 배경과 글자색 우선순위가 충돌해 흰색으로 보이던 문제를 수정했습니다.
- v2.6.0 PHOTO MASTER / STALE-FIRST / HOME SNAPSHOT 속도 구조는 그대로 유지합니다.

## v2.6.0 SPEED ARCHITECTURE
- PHOTO MASTER: 검증된 562명 인물사진을 정참시 저장소에 160px / 360px WebP로 최적화 저장하고 `/api/person-photo`는 MASTER를 최우선으로 제공
- Vercel CDN 장기 캐시 + 브라우저 lazy/eager 우선순위 적용: TOP3는 즉시, 일반 목록은 lazy, 상세·비교는 360px 우선 로딩
- 사진 MASTER가 없을 때만 최초 1회 생성하고, 실패 시 기존 v2.2.23 Last-Known-Good/자동복구 경로로 비파괴 fallback
- 관리자 `사진` 메뉴에 PHOTO MASTER 상태/용량/구축률 및 `562명 MASTER 구축` 추가. 사진 직접 교체·자동복구 시 해당 MASTER 자동 무효화
- `/api/home-snapshot` 신설: NOW Rank + NOW ISSUE + 설문 + 능력치 override + 최신 COLUMN을 하나의 짧은 CDN 캐시 응답으로 묶어 메인 초기 요청 수 감소
- IT’S ME / 정뮤니티 / COLUMN 목록에 sessionStorage stale-first 적용: 재방문·새로고침 시 직전 화면을 즉시 그리고 최신 데이터는 백그라운드 재검증
- IT’S ME / 정뮤니티 댓글도 10분 stale-first 캐시로 상세 화면 복원 시 본문을 먼저 표시하고 댓글은 즉시 또는 백그라운드 갱신
- IT’S ME 새로고침 복원은 회원 세션 확인과 병렬 실행하여 세션 응답 때문에 현재 게시판 화면이 늦어지는 병목 제거
- IT’S ME 목록 Redis 호출을 대표배지/팔로우/좋아요 상태 기준 배치 처리, 정뮤니티 좋아요 상태도 배치 처리하여 게시글 수에 비례하던 왕복 호출 감소
- 비교분석 후보 hover/pointer 단계에서 160px 사진 prefetch, 선택 순간 360px prefetch. 비교 스테이지는 고해상도 MASTER 사용
- v2.3.0 빠른 Refresh, 542명 순위 재계산, 기존 사진 LKG 안전망 및 v2.5.1 보안구조는 유지
- v2.5.2 방문자 `현재 접속자 / 오늘 방문 / 누적 방문` 개별 ON/OFF 기능 유지

### 배포 후 1회 권장
어드민 → `사진` → `562명 MASTER 구축`을 한 번 실행하면 562명 사진이 정참시 MASTER로 준비됩니다. 이후 메인·상세·비교분석은 외부 원본보다 MASTER/CDN 경로를 먼저 사용합니다.

## 1. 시민 배지 시스템
- STANDARD 생활·출석·탐험·참여 배지
- 분야별 상대등급: 활동회원 상위 35% SILVER · 상위 15% GOLD · 상위 1% PLATINUM
- 분야: 정뮤니티 활동가 · 토론가 · 인플루언서 · 칼럼작가 · 정책설계자
- 히든미션: 도시락 알리미 · 신데렐라 · 얼리버드 · 올빼미 시민
- 히든배지 최초 발견자에게 FIRST DISCOVERER 기록
- 명예/LEGACY: IT’S ME 시즌 우승자 · 시민입법가 · 국회 전달 · REAL POLICY
- MY > 배지 컬렉션에서 획득/잠금/진행도/연속출석/팔로워 확인
- 획득 배지 중 1개를 대표배지로 설정·해제
- 대표배지는 정뮤니티·정참시 COLUMN·IT’S ME 글과 댓글의 작성자명 옆에 표시

## 2. IT’S ME 시민정책 챌린지
- 독립 메뉴와 시즌형 정책 게시판 신설
- 기본 말머리: 잇츠미? 국회의원! / 대통령! / 시장! / 장관! / 시의원!
- 시즌 종료까지 DAYS / HOURS / MIN / SEC 카운트다운
- 정책 제안 · 좋아요 · 댓글 · 팔로우
- 좋아요와 댓글을 결합한 CITIZEN SIGNAL 표시
- 정참시 PICK · 시즌 우승작 표시
- 시즌 우승 지정 시 작성자에게 우승자 배지 자동 지급
- 브라우저 뒤로가기에서 정책 상세 ↔ 목록 상태 복원

## 3. 관리자 통제
- PC·모바일 관리자 메뉴에 `배지 · IT’S ME` 동일하게 추가
- 전체 배지 카탈로그 활성화/비활성화
- 회원 검색 후 배지 수동 지급·회수
- IT’S ME 시즌명 · 주제 · 시작/종료 · 말머리 · 포상 설정
- 정책 게시글 정참시 PICK / 우승 지정 / 수정 / 삭제

## 4. 기존 기능 보존
- v2.3.0 빠른 Refresh 및 사진 최적화 구조 유지
- 기존 NOW SIGNAL TERMINAL, TOP3/Signal Feed, NOW LIVE DESK, 상세페이지, VS ARENA 디자인 유지
- 기존 현역 정치인 542명 + 정부 참고인사 20명 사진 감사 구조 유지
- 신규 이미지/디자인 자산 파일 추가 없음


## 4. 배지 디자인 업그레이드
- PLATINUM 배지는 민트 계열 백그라운드와 민트 메탈 아이콘 카드 적용
- GOLD 배지는 골드 계열 백그라운드와 골드 메탈 아이콘 카드 적용
- STANDARD / SILVER 계열은 실버 메탈 계열 백그라운드 적용
- 배지 아이콘 박스에 광택/입체감을 더해 실제 배지처럼 보이도록 강화
- `7일 연속 시민` 배지명을 `위크맨`으로 변경
- 어드민 수동 부여 전용 칼럼 특별배지 `퍼스트팽귄` 추가


## 5. IT’S ME 글쓰기 가독성
- 말머리 라벨 16px 및 선택영역 16px로 확대
- 정책 제목 라벨 16px, 입력 텍스트 17px로 확대
- 정책 내용 라벨 16px, 본문 입력 텍스트 16px 및 행간 확대
- 모바일에서도 입력창 높이와 여백을 함께 키워 가독성 강화


## 5. v2.4.4 배지 카드 등급 재정의
- STANDARD / SILVER: 배지 카드 전체를 실버 계열 배경으로 표시
- GOLD: 배지 카드 전체를 골드 계열 배경으로 표시
- PLATINUM: 배지 카드 전체를 정참시 민트 계열 배경으로 표시
- 아이콘 뒤 배경보다 카드 전체 등급색이 먼저 인식되도록 시각 구조 수정
- 특별배지 등급 재분류: IT’S ME 시즌 우승자·국회 전달·퍼스트팽귄·FIRST DISCOVERER = GOLD, 시민입법가·REAL POLICY = PLATINUM
- IT’S ME 글쓰기 폰트는 v2.4.2의 과대 확대를 완화해 라벨 11px / 입력 13px / 제목 14px로 조정


## 5. v2.4.4 수정
- IT’S ME 화면 새로고침 시 현재 IT’S ME 목록/게시글 위치를 복원
- IT’S ME 역할 필터(전체·국회의원·대통령·시장·장관·시의원) 가독성 확대
- `정참시News` 사용자 노출 명칭을 `정참시 COLUMN`으로 변경
- 비교 결과 중앙 VS 문자가 배경 분할 위에서도 선명하도록 독립 원형 배경 적용
- 8 AXIS HEAD-TO-HEAD 하단에 PLUS 전용 자연어 `한줄요약` 카드 추가


## 6. v2.4.6 추천인 · SECRET COLLECTION
- 회원가입 선택항목에 `추천인 닉네임` 추가 · 아이디가 아닌 실제 회원 닉네임으로 확인
- 신규 닉네임 중복 방지 강화 · 추천관계는 가입 완료 후 일반 회원이 변경 불가
- 유효 추천 기준: 추천가입 후 7일 경과 + 서로 다른 날짜 3일 이상 활동
- 유효 추천 5명: `정도사` STANDARD 배지 자동 지급
- 유효 추천 50명: 히든 `보이지 않는 손` PLATINUM 배지 자동 지급
- 잠긴 히든배지는 이름·조건·진행도를 공개하지 않음
- MY에 `초대 / SECRET` 메뉴 추가: 추천 현황, 유효/대기 추천, 초대한 시민 목록, 시즌 히든 컬렉션 표시
- SECRET COLLECTION 시즌 01 기본 구성: 도시락 알리미 · 신데렐라 · 얼리버드 · 올빼미 시민 · 보이지 않는 손
- 시즌 히든배지 완주 시 실제 선물 신청 UI 오픈 · 받는 분/연락처/주소를 암호화 저장
- 회원 MY에서 신청완료 → 준비중 → 발송완료 → 배송완료 상태 확인
- 관리자에서 추천관계 VALID/PENDING/INVALID 처리, 전체 재계산, 시즌 필수배지/기간/선물명 설정, 배송주소·택배사·송장·배송상태 관리
- 회원탈퇴 시 추천관계 무효화 및 해당 회원의 선물 배송정보 제거
- 이용약관/개인정보처리방침 v5에 추천관계·SECRET GIFT 배송정보 처리 내용 반영


## v2.4.6 HOTFIX + PRO PREVIEW
- IT’S ME current route is mirrored to sessionStorage as well as History API so browser refresh restores the IT’S ME list or the current IT’S ME post instead of falling back to NOW Rank.
- Comparison result now includes a PRO preview section under PLUS: `POLITICAL INTELLIGENCE MANAGEMENT PROPOSAL` with a `문의하기` action.


## v2.4.8 hotfix
- IT’S ME 새로고침 시 NOW Rank 메인이 먼저 잠깐 보였다가 복원되던 초기 렌더링 순서 수정
- sessionStorage/history에 저장된 공개 페이지를 로그인 세션 요청 전에 즉시 pre-paint하여 현재 섹션을 그대로 유지
- IT’S ME 상세글은 IT’S ME 화면을 먼저 유지한 뒤 데이터 로딩 완료 시 같은 상세글로 복원

## v2.5.0 회원관리 TRUE MODAL 핫픽스
- 회원관리 `관리` 클릭 시 남아 있던 `scrollIntoView()` 강제 하단 스크롤 로직 완전 제거
- 회원 상세를 페이지 하단 패널이 아닌 viewport 고정 오버레이 모달로 분리
- 모달 오픈 동안 배경 스크롤 잠금
- 닫기 / 배경 클릭 / ESC 지원
- 저장·등급변경·정지·비밀번호 재설정 후에도 모달 위치 유지
- 모달 닫기 시 기존 회원 목록 스크롤 위치 복원

## v2.5.0 SECURITY HARDENING 1
- 관리자 로그인 전용 방어: 동일 IP/관리자 ID 기준 10분 내 연속 시도 제한 + 로그인 실패 5회 누적 시 10분 잠금
- 관리자 로그인 성공/실패/잠금/오류, 비밀번호 변경, 전체 세션 종료 이벤트를 Redis 감사로그로 기록
- 감사로그 화면에서는 IP를 마스킹하고 식별용 해시와 User-Agent를 함께 보존
- 관리자 세션 버전 도입: 비밀번호 변경 또는 `모든 관리자 세션 종료` 실행 시 기존 관리자 쿠키 전체 즉시 무효화
- 관리자 보안 화면에 세션 버전·잠금정책·최근 보안 이벤트·전체 세션 종료 기능 추가
- 공개 API 게이트웨이에 공통 burst guard 추가: 읽기 600회/분, 쓰기 180회/분. 기존 로그인/회원가입/게시판별 세부 제한은 그대로 중첩 적용
- 관리자 Refresh/사진 전체검수 등 내부 운영 API는 로그인 세션 검증 후 공통 public burst guard에서 제외하여 기존 운영 성능 보존
- 보안 응답 헤더 추가: nosniff, DENY frame, Referrer-Policy, Permissions-Policy, 제한형 CSP, HSTS
- `/admin`, `/admin.html`, `/api/admin/*` 응답은 no-store로 캐시 금지
- 기존 v2.4.9 회원관리 TRUE MODAL, v2.3.0 빠른 Refresh/사진 LKG 구조 보존
- v2.5.1에서 관리자 MFA·서버측 세션 만료·Origin/Fetch Metadata 방어까지 추가 적용


## v2.5.1 SECURITY HARDENING COMPLETE
- 관리자 TOTP MFA(Authenticator) + 일회용 복구코드 8개 지원
- MFA Secret은 AES-256-GCM으로 암호화 저장 · `ADMIN_MFA_ENCRYPTION_KEY` 별도 키 지원
- 관리자 세션을 stateless 쿠키만 믿지 않고 Redis 서버 세션으로 전환
- 관리자 세션: 45분 비활동 만료 + 최대 8시간 절대 만료
- 관리자/회원 쿠키를 `__Host-` prefix + Secure + HttpOnly + SameSite로 강화하고 기존 쿠키 자동 폐기
- 관리자 새 비밀번호 최소 길이를 12자로 상향
- 회원 로그인은 IP 제한에 더해 아이디/이메일 식별자 기준 제한을 중첩해 IP 회전형 무차별 대입 방어 강화
- POST/PATCH/DELETE 등 상태 변경 요청에 Fetch Metadata + Origin/Referer 동일출처 검사 추가
- 관리자 쓰기 작업과 cross-site 차단을 보안 감사로그에 추가 기록
- CSP를 default/script/style/img/connect/font/frame/object/form 범위로 확대하고 외부 frame/object 차단
- 계정/추천/배지 개인 API에 no-store 캐시 금지 강화
- 어드민 보안 화면에서 환경 키 설정 상태, MFA 상태, 복구코드 잔여수, 세션 정책을 확인
- `SECURITY_DEPLOY_CHECKLIST.md` 추가: Vercel 환경변수/MFA/WAF 운영 적용 절차
- Vercel Dashboard의 WAF Rate Limit은 프로젝트 계정 설정이므로 코드가 임의 활성화하지 않으며 체크리스트에 권장 규칙을 명시
