# NOW Rank v1.10.6 — Name Pulse 6-person benchmark

- Keeps the v1.10.5 single-gateway Vercel Hobby deployment structure.
- Adds `mode=benchmark` to `/api/name-pulse-test`.
- Fixed benchmark names: 김민석, 정청래, 한동훈, 서미화, 김종민, 천하람.
- Runs the six NAVER Search Ads `/keywordstool` calls in parallel.
- Compares current monthly total query counts against the previously observed KeywordCockpit values.
- MATCH <= 3% difference, CLOSE <= 10%, CHECK > 10%.
- Does not modify NOW Rank, Redis snapshots, scoring, or public ranking.
