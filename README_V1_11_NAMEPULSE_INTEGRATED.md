# NOW Rank v1.11 — Name Pulse Integrated

## What changed
- Collects NAVER Search Ads `/keywordstool` bare-name monthly PC + mobile query volume for all 299 active roster entries.
- Stores the raw monthly count in each snapshot under `signal.channels.namePulse`.
- Converts rolling monthly volume to a fixed 0–100 Search Scale: `25 * log10(1 + monthlyTotal / 100)`, capped at 100.
- Name Pulse is included inside the **대중 관심도** component. It has 40% of that component's nominal sensor weight; the overall 대중 관심도 axis remains 28% of RAW. Because unavailable sensors are re-normalized, practical influence varies, so audit values are exposed.
- Adds Name Pulse coverage, monthly volume, score, sorting, source badge and audit details to Admin.
- `modelVersion` is now `name-pulse-v1`; the first snapshot intentionally shows no fake 6h movement against the incompatible previous model.

## Refresh flow
1. Start / global source health
2. 299-name Name Pulse collection (10 parallel per browser batch; failed upstream rows retry once)
3. Optional NAVER Search Trend
4. Existing common sensors
5. Existing enrichment
6. Finalize with Name Pulse included in scoring

## Safety / interpretation
Name Pulse is rolling monthly search demand, not a 6-hour surge metric. It is intentionally used as a baseline public-attention sensor so it can repair national-interest blind spots without replacing news/event/freshness signals.

## Vercel Hobby
The single-gateway build remains in place. Only `api/gateway.js` is built as the Vercel Function.
