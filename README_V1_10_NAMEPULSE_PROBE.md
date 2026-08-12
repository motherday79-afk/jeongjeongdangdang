# NOW Rank v1.10 - NAVER Name Pulse Probe

This is a deliberately small validation patch. It does **not** change ranking weights yet.

## Environment variables

- `NAVER_AD_ACCESS_LICENSE`
- `NAVER_AD_SECRET_KEY`
- `NAVER_AD_CUSTOMER_ID`

Keep all values secret in Vercel.

## Files

- `api/_lib/naver_searchad.js`
- `api/admin/name-pulse.js`

## Test

1. Deploy after adding the three environment variables.
2. Log in to `/admin.html` first so the admin session cookie exists.
3. Open `/api/admin/name-pulse` in the same browser.
4. The default probe checks:
   - 김민석
   - 정청래
   - 한동훈
   - 서미화
   - 김종민
   - 천하람
5. Compare `monthlyPcQcCnt`, `monthlyMobileQcCnt`, and `monthlyTotalQcCnt` with Keyword Cockpit.

Custom names can be tested with:
`/api/admin/name-pulse?keywords=한동훈,정청래`

## Why this is isolated first

If values match the external tool, the next step is a 299-person queued collector + Redis history + Name Pulse scoring. Until then the probe has zero influence on NOW Rank.
