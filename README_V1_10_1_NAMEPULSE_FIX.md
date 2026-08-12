# NOW Rank v1.10.1 Name Pulse probe

- NAVER Search Ads official service URL: `https://api.searchad.naver.com`
- `/api/admin/name-pulse-health`: checks only server route/auth/env presence. No NAVER request.
- `/api/admin/name-pulse`: default probes only `한동훈` for fast diagnosis.
- `/api/admin/name-pulse?keyword=정청래`: probes one name.
- `/api/admin/name-pulse?benchmark=1`: probes six benchmark names in parallel.
- Each upstream request timeout: 5 seconds.
- Probe does not affect NOW Rank scoring.
