# 정참시 v2.4.6 · REFERRAL + SECRET COLLECTION + GIFT

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
