# TypeScript non-visual feature runtime — v1.40.0

## Scope

v1.40.0 continues from the fully verified v1.39.0 composition/controller/domain-service checkpoint. The goal is to move the behavioral core of features into TypeScript while keeping broad presentation and DOM-heavy rendering JavaScript until the final UI migration stage.

The release is **Architecture Version 14** with `featureRuntime: typescript-nonvisual-core`. No Supabase migration is required.

## Authoritative TypeScript runtime added or expanded

### Boards

The following non-visual Board responsibilities are TypeScript-authoritative:

- Board view state and reset/default helpers;
- Board schema/default-column helpers;
- Board selectors and deterministic derived state;
- Board command contracts and command service;
- Board data loading and stale-request protection;
- preference normalization, mutation patches, persistence coordination and scoped caching;
- selection/bulk-operation state and commands;
- Item Workspace asynchronous runtime, load/upload epochs, stale-response protection and persistence commands;
- configurable Status-label editor state and serialization;
- Board activity loading/refresh/stale-request runtime;
- Board repository/DTO mapping, status normalization and column-type validation inherited from v1.38;
- typed history, overlay coordination, route/controller/domain-service boundaries inherited from v1.39.

Existing JavaScript presentation adapters call these TypeScript services rather than duplicating repository/persistence behavior.

### Cross-feature/runtime services

TypeScript-authoritative runtime now includes:

- command registry;
- Work Management runtime client;
- feature registry;
- module host;
- application lifecycle;
- runtime error boundary;
- shared overlay manager;
- authenticated cloud-module data/message bridge;
- Vite public runtime configuration resolver.

## Cloud-module message trust boundary

`assets/js/core/cloud-module-data.ts` treats `MessageEvent.data` as `unknown`. Before dispatch, the bridge validates:

1. exact same-origin policy;
2. active iframe/source identity;
3. active module identity;
4. authenticated/account/module authorization context;
5. message-envelope and operation discriminants;
6. request/correlation identifiers;
7. operation-specific payload structure;
8. revision initialization, advancement, duplicate/idempotent behavior, stale/out-of-order conflicts and invalid revisions.

No `MessageEvent` → trusted-message assertion is used. The window listeners are natively typed and installed with an `AbortController` so disposal removes the boundary cleanly.

Malformed input, unauthorized input, revision conflicts and backend/runtime failures are deliberately distinguishable and execution failures use the normalized application-error infrastructure.

## Remaining JavaScript inventory

The stabilized source audit across `assets/js`, `src`, and `config` contains **85 JavaScript/JSX files** and **0 project-owned `.d.ts` files**. **43** of those JavaScript files are thin TypeScript re-export compatibility entries; the remaining **42** are actual JavaScript implementation/boundary files classified below.


### Presentation/rendering — intentionally deferred

Examples include `assets/js/app.ts`, `assets/js/boards-ui.ts`, Board views, feature presentation modules, account/settings/auth/home/user-management renderers, formatting/icons, and DOM-heavy workflow controllers such as dialog, inline-edit, drag/drop, resize, menu, item/group/column/member workflows and Item Workspace presentation adapters.

These files are the intended future UI/presentation migration boundary. Their data/persistence orchestration is increasingly delegated to TypeScript services.

### Thin compatibility entries — temporary and low-risk

Many `.js` files adjacent to authoritative `.ts` modules contain only `export * from './name.ts'`. They exist so still-JavaScript presentation consumers can keep stable import specifiers during staged migration. They are not parallel implementations and can be removed when their consumers migrate.

### Non-visual JavaScript deferred to later bounded migration

- `assets/js/core/auth.ts` — central session/authentication lifecycle with subscription and server reconciliation behavior; high-risk enough to deserve a dedicated migration slice.
- `assets/js/core/backup.ts` — cross-feature backup/restore plus browser-download presentation adapter; should be split/migrated with explicit backup DTO validation in a later slice.
- `assets/js/core/module-cloud-store.ts`, `assets/js/core/module-identity-bridge.ts`, `assets/js/runtime/module-bootstrap.ts` — classic-script embedded-module compatibility runtimes loaded outside the Vite ESM shell. Converting them requires a deliberate embedded-module loading/build boundary change.
- `assets/js/runtime/motion-design.ts` and `motion-orchestrator.js` — browser/classic presentation-motion runtime; belongs closer to presentation migration.
- deployment/static config script surfaces under `config/backend-config*.js` and `config/runtime-assets.js` remain plain JavaScript intentionally.

### Declaration inventory

There are no project-owned `.d.ts` migration shims under `assets/js`, `src`, or `config`.

## Dependency direction

```text
presentation / views (JS for now)
        ↓
typed feature controllers + command/state runtime
        ↓
typed domain services
        ↓
typed repositories / DTO mapping
        ↓
typed backend transport / Storage / query state
```

Runtime services do not import feature rendering. The composition root remains the authoritative constructor for shared production dependencies and singleton query/cache state.

## Migration policy

v1.40 does not begin wholesale JSX/TSX or presentation conversion. Stable `.js` compatibility entries are preserved only where current presentation code consumes them. TypeScript strictness is not relaxed, and external/browser/backend data remains runtime-validated rather than trusted because of static types.
