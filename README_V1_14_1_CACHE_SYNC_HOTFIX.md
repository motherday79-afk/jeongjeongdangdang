# NOW Rank v1.14.1 Cache / Publication Consistency Hotfix

Immediate hotfix for intermittent old-rank flashes after browser refresh or Vercel deployment.

## Changes
- `/api/rank/current` and `/api/rank/history`: browser/CDN/Vercel edge cache disabled.
- Frontend adds a cache-busting nonce to rank API requests.
- Bundled historical prototype rank data is no longer rendered before the live API response.
- Initial rank UI displays a short loading state, then renders only the latest published snapshot.
- Publish ordering is now immutable snapshot -> history -> `jjdd:current` LAST.
- Publications receive `publicationId` and `publishedAt` markers.
- History response includes publication markers for consistency diagnostics.
- Rollback also creates a coherent new publication instead of changing only the current pointer.
- The public page also declares browser no-cache meta directives; API responses enforce the authoritative no-store policy.
