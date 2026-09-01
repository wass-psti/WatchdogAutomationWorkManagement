# v1.41.0 remaining non-visual runtime verification

## Classification

Release candidate: **v1.41.0 RC**.

The implementation slice is complete, strict TypeScript verification passes, the dedicated v1.41 verifier passes, the historical source/runtime verification chain passes through the Chromium integration suite, and the browser module-host lifecycle regression is fixed. This packaging environment cannot complete the Vite execution gates because `npm ci` cannot resolve `registry.npmjs.org` (`EAI_AGAIN`) and no local/cached Vite 8.2.2 installation is available.

The artifact must therefore remain an RC rather than being labeled `verified` until the exact source passes `npm ci && npm run release:check` in a network-capable environment.

## Completed gates

- `npm run typecheck` — PASS.
- `npm run verify:types` — PASS.
- `npm run verify:vite` — PASS (structural Vite architecture verification).
- `bash tests/browser/run-browser-tests.sh` — PASS.
- Dedicated `verify-v1410-nonvisual-runtime.mjs` — PASS.
- Historical `verify-*.mjs` chain — PASS through the browser integration stage.

The v1.41 verifier covers auth lifecycle/error normalization, v3→v4 backup migration, unsupported-version rejection, duplicate module-state conflicts, Board/Status cross-reference integrity, embedded lifecycle ordering, transactional restore markers, cache/module invalidation wiring, and removal of superseded classic runtime files.

## Browser-harness correction

The Chromium harness now loads the TypeScript module lifecycle and cloud-message parser before evaluating `module-host.ts`, uses the current `wm:identity-context` envelope, and attaches the fixture under the supported `time-tracker` module ID. This closes the prior artificial `transitionEmbeddedLifecycle is not defined` harness failure without weakening the production module-host contract.

## Environment-blocked gates

The following commands could not be executed because the locked Vite package is unavailable locally and the npm registry is unreachable from this environment:

- `npm run verify:dev`;
- `npm run build`;
- `npm run verify:dist`;
- `npm run verify:preview`.

`npm ci` was attempted and failed on DNS resolution for `registry.npmjs.org`. No source dependency versions were changed.

## Promotion requirement

To promote this exact RC to `Work-Management-App-v1.41.0-verified.zip`, run:

```bash
npm ci
npm run release:check
```

If both commands pass without source changes, regenerate `CHECKSUMS.sha256` and package the same tree with the verified filename. Broad UI/rendering TypeScript migration should remain blocked until that promotion gate is complete.
