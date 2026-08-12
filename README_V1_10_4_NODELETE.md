# NOW Rank v1.10.4 - Hobby no-delete deploy

GitHub에 남아 있는 구형 API 파일을 직접 삭제하지 않아도 Vercel 배포에서 제외하도록 `.vercelignore`를 추가했습니다.

배포 제외:
- api/_lib/**
- api/name-pulse-health.js
- api/name-pulse-probe.js
- api/admin/name-pulse-health.js
- api/admin/name-pulse-probe.js

기존 환경변수는 그대로 유지합니다.
