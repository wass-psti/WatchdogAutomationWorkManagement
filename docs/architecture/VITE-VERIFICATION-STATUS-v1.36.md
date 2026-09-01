# Vite migration verification status — v1.36.0

## Current state

The source migration to Vite is implemented and the complete pre-existing Work Management regression suite passes against the migrated source tree, including the Chromium integration suite. The Vite-specific source architecture contract also passes.

The final toolchain execution gate could not be completed in the packaging environment because that environment cannot resolve `registry.npmjs.org` and does not have Vite in its npm cache. This is an infrastructure/network limitation rather than an application test failure.

Observed install failures:

- offline npm install: `ENOTCACHED` for the Vite package;
- registry request: `EAI_AGAIN getaddrinfo registry.npmjs.org`.

For that reason, this handoff is a **Vite migration release candidate**, not a fully build-verified production release. A generated `package-lock.json`, `node_modules/`, and `dist/` are intentionally not fabricated or checked in.

## Completed verification

- `node verify-v1360-vite-migration.mjs` — PASS
- `bash verify-project.sh` — PASS
- existing Chromium Board/Item Workspace integration suite — PASS as part of the project verifier
- all existing TimeTracker, FuelTrack+, TradeLink, authentication, RBAC, Boards, motion, accessibility, persistence, and release-contract source checks — PASS
- Node.js available in the packaging environment: `v22.16.0`
- npm available in the packaging environment: `10.9.2`
- Chromium available at `/usr/bin/chromium`

## Final gate to run in a network-enabled environment

From the project root:

```bash
npm install
npm run release:check
```

`npm install` should create the reproducible `package-lock.json`. `release:check` then performs, in order:

1. Vite migration architecture verification;
2. Vite development-server and Chromium startup smoke test;
3. Vite production build;
4. `dist/` asset, manifest, chunk, source-map, service-worker, and embedded-module verification;
5. Vite preview-server and Chromium smoke test;
6. the complete legacy/current Work Management regression suite.

The migration should only be promoted from release-candidate status after those two commands complete successfully and the resulting `package-lock.json` is committed.

## Expected production artifacts

A successful build produces:

- `dist/index.html` with Vite-generated hashed JS/CSS references;
- `dist/build/*` optimized chunks and hidden source maps;
- `dist/.vite/manifest.json`;
- `dist/.vite/licenses.md`;
- `dist/config/runtime-assets.js`, generated from the emitted bundle for service-worker precaching;
- `dist/service-worker.js`;
- unchanged compatibility-island runtimes under `dist/apps/`;
- shared embedded-runtime support files at their established paths.

No v1.36.0 Supabase migration is required.
