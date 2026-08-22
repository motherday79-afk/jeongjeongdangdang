# V2 NAVER ENV EXPORT - TEMPORARY

1. Apply this patch to the V2 project only.
2. Deploy V2.
3. Log in to the V2 admin in the same browser.
4. Open `/api/admin/naver-env-export` on the V2 domain.
5. Copy the five values shown in `values`.
6. Immediately remove this patch from V2 and redeploy.

The endpoint is protected by the existing V2 admin session and sends `Cache-Control: no-store`.
