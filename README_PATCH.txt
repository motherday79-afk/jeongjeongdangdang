NOW Rank v1.3.2 Sparse-Signal Hotfix

Replace these files in the existing GitHub repository:
- api/_lib/collector.js
- api/_lib/score.js
- api/_lib/store.js
- api/admin/refresh.js
- admin.html

Key fixes:
1) No min-max normalization: a weak 2-article snapshot can no longer become NOW 100.
2) Sparse evidence caps and Bayesian smoothing for 1-2 article spikes.
3) Stronger Google News identity query using member name + party/MP qualifier.
4) More tolerant event keyword matching.
5) Admin preview now shows top-30 evidence quality and source counts.
6) Carries forward Upstash environment-variable compatibility fix.
