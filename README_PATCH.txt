정정당당 NOW Rank v1.7 Common Sensor

전체 ZIP: 저장소 루트에 전체 덮어쓰기
PATCH ZIP: 아래 변경 파일만 포함

핵심 변화
- NAVER 검색어 트렌드 299명 전수 측정 (공통 anchor 보정)
- NAVER News/Blog/Cafe/Web 299명 공통 센서
- OBSERVED / ZERO / MISSING 수집상태 분리
- MISSING 시 직전 관측값 감쇠 기억
- 심층수집: 현재신호 + 직전상위 + 이벤트 + 순환 대상
- YouTube/X API는 별도 quota 상한
- 특정 정치인 baseline/기본점수 추가 없음

배포 후 관리자 Refresh → 미리보기에서 반드시 확인:
1) NAVER 트렌드 전수관측이 299/299에 가까운지
2) NAVER 공통센서가 299/299에 가까운지
3) 게시 전 한동훈 등 기존 데이터 사각지대 인물의 sourceBadges / evidenceConfidence 변화
