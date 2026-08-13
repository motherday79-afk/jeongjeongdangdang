# NOW Rank v1.14.2 Fast Main Hotfix

- Main no longer waits for `/api/rank/history` before rendering.
- Removed the unused legacy embedded NOW Rank snapshot from `index.html` (~240 KB raw).
- Added compact public snapshot key `jjdd:current:public` written on publish/rollback.
- `/api/rank/current` serves the compact snapshot and auto-warms it from legacy `jjdd:current` once.
- History endpoint uses one Redis MGET instead of sequential GET calls.
- Politician photo hydration starts after NOW Rank first paint.
- Existing full `jjdd:current` remains unchanged for admin/rollback compatibility.
