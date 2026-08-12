# NOW Rank v1.10.3 — Vercel Hobby Function Limit Fix

- `/api/_lib/*.js` helper modules moved to `/lib/*.js` so Vercel does not count helpers as API functions.
- duplicate Name Pulse diagnostic endpoints consolidated into `/api/name-pulse-test.js`.
- removed duplicate admin health endpoint.
- resulting API entrypoints: 11 (Hobby plan limit 12).
- test page: `/namepulse-test.html`
- health: `/api/name-pulse-test?mode=health`
- one-person probe: `/api/name-pulse-test?mode=probe`
- NOW Rank scoring is not modified by this probe build.
