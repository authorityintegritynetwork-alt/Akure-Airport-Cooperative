---
name: API client dist types
description: When adding new exported types to api.schemas.ts, the compiled dist file must also be updated manually.
---

The `@workspace/api-client-react` package exports from `./src/index.ts`, but `lib/api-client-react/dist/generated/api.schemas.d.ts` exists and TypeScript resolves to it in some contexts (e.g. the cooperative Vite frontend). Adding types to `src/generated/api.schemas.ts` alone is not enough.

**Why:** The dist directory contains hand-compiled `.d.ts` files. When the cooperative frontend's TypeScript resolves types for `@workspace/api-client-react`, it appears to find the dist `.d.ts` files rather than (or in addition to) the src TypeScript files. If dist is stale, newly added interfaces are invisible to the frontend.

**How to apply:** Whenever adding new interfaces or modifying existing ones in `lib/api-client-react/src/generated/api.schemas.ts`, also mirror the same changes in `lib/api-client-react/dist/generated/api.schemas.d.ts`. The dist file uses the same interface syntax (no `export declare` wrapping needed for interfaces — plain `export interface` works).
