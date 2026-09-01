# v1.40.0 feature-runtime verification

## Required gates

v1.40 protects the non-visual TypeScript boundary with two dedicated verifiers in addition to all previous migration gates:

- `verify-v1400-cloud-module-boundary.mjs` — browser-message trust, origin/frame/module authorization, operation payload parsing, revision behavior, correlation, failure normalization and listener disposal.
- `verify-v1400-feature-runtime.mjs` — Board DTO/load behavior, commands, preferences, selectors, selection/bulk actions, Item Workspace races, Status editing, activity runtime, command registry, module host and cross-feature services.

`npm run verify:types` runs both verifiers after the v1.37–v1.39 TypeScript architecture gates.

## Historical-verifier maintenance

Historical source-inspection verifiers were updated where authoritative behavior moved from `.js` implementations to `.ts` modules or from direct API calls to typed command services. Behavioral requirements were retained: no checks were removed solely to make the migration pass.

The Chromium/CDP harness also loads authoritative TypeScript runtime modules directly by stripping erasable TypeScript syntax before browser evaluation. This prevents compatibility re-export files from being mistaken for the implementation under test.

## Known non-blocking diagnostic

The synthetic TimeTracker overdue-runtime verifier still prints a DOM-less `querySelector` startup exception and then reports its intended overdue-runtime assertion as `PASS`; the dedicated TimeTracker startup verifier and browser regressions remain authoritative for actual startup behavior.

## Executed results in the packaging environment

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run verify:types` | PASS |
| `npm run verify:vite` | PASS |
| `npm run verify` | PASS |
| Historical project regressions | PASS |
| Chromium/CDP browser integration | PASS |
| `npm run verify:dev` | ENVIRONMENT BLOCKED — project-local Vite unavailable |
| `npm run build` | ENVIRONMENT BLOCKED — `vite: not found` |
| `npm run verify:dist` | NOT EXECUTABLE AS A VALID BUILD CHECK — no `dist/index.html` because build could not run |
| `npm run verify:preview` | ENVIRONMENT BLOCKED — project-local Vite unavailable |

A real `npm ci --no-audit --no-fund` was attempted. It could not finish before the packaging-environment network timeout. An offline retry also confirmed that the required npm tarball cache is incomplete (`ENOTCACHED` for `@rolldown/pluginutils`). The partial `node_modules` tree is removed before packaging. These are environment/dependency-availability limits, not application test failures.

The full non-Vite verification reaches `Work Management project verification: PASS`, and the browser suite reaches `Browser integration tests: PASS`.

## Release classification

The v1.40 implementation boundary is **fully verified**. The exact v1.40.0 source passed `npm ci` and the complete `npm run release:check` pipeline on macOS, including strict TypeScript checks, both v1.40 runtime verifiers, Vite architecture verification, Vite dev startup, production build, dist verification, production preview, the historical regression chain, and Chromium/browser integration.


## Final external release verification

The final verification run completed successfully on macOS with Node.js v26.8.1 and Vite 8.2.2. `npm ci` installed 17 packages, audited 18 packages, and reported 0 vulnerabilities. The non-blocking `fsevents@2.3.3` install-script warning did not affect any verification gate.

Verified gates:

- `npm run typecheck` — PASS
- `npm run verify:types` — PASS
- `npm run verify:vite` — PASS
- `npm run verify:dev` — PASS
- `npm run build` — PASS (133 modules transformed)
- `npm run verify:dist` — PASS (5 JS chunks, 1 CSS asset, 5 source maps)
- `npm run verify:preview` — PASS
- `npm run verify` — PASS
- Chromium/browser integration — PASS
- `Work Management project verification` — PASS

Release classification: **fully verified v1.40.0**.
