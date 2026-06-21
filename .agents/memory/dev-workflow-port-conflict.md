---
name: Dev workflow port conflict / stale api-server
description: Why newly-added API routes can 404 to Vite SPA despite being in the dist build.
---

Two workflows ("Start application" and "artifacts/api-server: API Server") both start the same api-server on the same assigned PORT (8080). They collide: whichever bound first keeps the port; the other instance fails to bind.

**Symptom:** newly-added routes return 200 with Vite SPA HTML (or 404) even though `grep` confirms the route string is in `dist/index.mjs` and the dist mtime is newer than source. Meanwhile other routes in the same router work. Cause: the process holding the port was started *before* the rebuild, so it serves the OLD in-memory bundle. In dev the express app uses Vite as middleware, so unmatched routes fall through to `index.html`.

**Fix:** restart `artifacts/api-server: API Server` (not just "Start application") so the live process reloads the fresh dist. Re-test on `localhost:8080` — `$REPLIT_DEV_DOMAIN` returns 000 (mTLS).

**Why:** dist being current does not mean the running process loaded it. Always restart the workflow that actually owns the port after a rebuild, then verify endpoints (401 = registered+auth-guarded; HTML = not matched).
