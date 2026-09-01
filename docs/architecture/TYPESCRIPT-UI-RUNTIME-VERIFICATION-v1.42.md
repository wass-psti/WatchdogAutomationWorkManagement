# v1.42.0 controlled UI/rendering TypeScript verification

## Source/compiler audit

The v1.42 migration is protected by `verify-v1420-ui-typescript.mjs` plus all earlier TypeScript and historical verifiers. The source audit requires authoritative TypeScript shell/Boards/motion files, rejects paired Work Management JavaScript authorities, checks strict compiler flags, scans the migrated TypeScript surface for migration suppressions and broad unsafe patterns, validates the TypeScript relative-import graph for cycles, and verifies the v1.42 manifest/runtime-entry contracts.

The code-side audit found no `@ts-ignore`, `@ts-nocheck`, unjustified `@ts-expect-error`, `as any`, `as unknown as`, or broad explicit `any` in the migrated Work Management TypeScript surface. The relative TypeScript dependency graph contains no cycles. `allowJs` is disabled and unused locals/parameters are compiler errors.

## Historical verifier reconciliation

Historical verifiers were changed only where they encoded obsolete JavaScript source syntax or `.js` paths. Their behavioral protections remain. In particular, the v1.34 Status/interaction gate now verifies executable Status normalization/lifecycle semantics in addition to source contracts:

- Enter confirms and Escape cancels explicit inline editing;
- no save-on-blur for the explicit rename flow;
- stable Status label IDs;
- create, rename, recolor, reorder, default, deactivate/reactivate, and delete behavior;
- clear-on-delete reference policy;
- legacy Status option normalization;
- single-overlay exclusivity and click-through suppression;
- persistence/migration compatibility.

## Chromium regression coverage

The CDP suite executes the authoritative typed runtime modules and covers explicit check/X controls, Enter/Escape, no-save-on-blur, Status selection by ID, Manage Labels lifecycle operations, confirmation when deleting an in-use Status label, persisted Status configuration round-trip, historical Status normalization, row/cell action isolation, overlay replacement/outside dismissal, focus behavior, Item Workspace tab stability, sticky/horizontal Board geometry, theme coherence, and reduced/full motion behavior.

The complete historical aggregate and Chromium suite pass in the source-verification environment. The synthetic TimeTracker overdue-runtime verifier still prints its longstanding DOM-less `querySelector` diagnostic before its intended assertion reports PASS; the dedicated TimeTracker startup and browser gates remain authoritative for startup behavior.

## Final production promotion gate

A verified v1.42 archive must not be created until this exact source tree passes a clean lockfile install and all Vite production gates:

```bash
npm ci
npm run typecheck
npm run verify:types
npm run verify:vite
npm run verify:dev
npm run build
npm run verify:dist
npm run verify:preview
npm run verify
```

The packaging environment currently cannot complete `npm ci` because DNS resolution for `registry.npmjs.org` fails with `EAI_AGAIN`. This is an environment blocker rather than a lockfile or application verification failure. Consequently dev/build/dist/preview promotion must be executed in a network-capable environment before release packaging.
