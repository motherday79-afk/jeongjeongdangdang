# NOW Rank v1.10.5 — Single Gateway / Hobby Safe

## Why
Vercel Hobby allows at most 12 Vercel Functions for this style of `api/` deployment.
Old API files may remain in GitHub after ZIP overwrite, so simply adding new files can exceed the limit.

## Fix
`vercel.json` now uses explicit `builds` and creates only one Node function:
- `api/gateway.js`

All existing API paths are rewritten to that function and internally dispatched to the existing handlers.
The legacy API source files can remain in GitHub; they are bundled as dependencies rather than deployed as separate functions.

## Expected Vercel function count
1

## Deploy
Upload/overwrite all files in repository root and commit. No manual deletion is required.
Environment variables remain unchanged.

## Test after Ready
1. `/namepulse-test.html`
2. Health button
3. Name Pulse probe button
