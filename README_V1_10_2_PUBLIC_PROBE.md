# NOW Rank v1.10.2 · Public Name Pulse Probe

관리자 로그인에 의존하지 않는 진단용 경로를 추가했습니다.

- `/namepulse-test.html` : 브라우저 테스트 화면
- `/api/name-pulse-health` : 환경변수 존재 여부만 확인. NAVER 호출 없음.
- `/api/name-pulse-probe` : `한동훈` 고정 키워드 1건만 NAVER Search Ads `/keywordstool` 호출.

비밀키 값은 어떤 응답에도 노출하지 않습니다. 기존 NOW Rank 점수/게시 로직은 변경하지 않습니다.
