# TypeScript remaining non-visual runtime — v1.41.0

## Scope

v1.41.0 completes the bounded migration that follows the verified v1.40 feature-runtime checkpoint. Broad visual/UI conversion remains intentionally deferred. This slice makes the remaining high-risk non-visual boundaries TypeScript-authoritative in this order:

1. authentication/session runtime;
2. backup/restore orchestration;
3. embedded-module classic runtime modernization.

## Authentication and session runtime

`assets/js/core/auth.ts`, `assets/js/core/auth-state.ts`, `assets/js/features/auth/index.ts`, and `assets/js/features/account/index.ts` now own the runtime contract. Provider/session payloads remain external data and are narrowed at runtime before they can become authenticated application state.

The session lifecycle exposes one discriminated authoritative state instead of relying on combinations of independent booleans. The model covers initialization, restoration, unauthenticated/authenticated operation, disabled/setup-required accounts, expired/invalid sessions, and explicit termination. Session generations bind asynchronous work to the session that started it so obsolete profile hydration, refresh work, or provider callbacks cannot repopulate identity after logout or a newer session wins.

Existing Supabase behavior is preserved: session persistence/restoration, password sign-in, registration/verification handling, profile hydration, bootstrap-admin reconciliation, role/capability resolution, protected routing, refresh handling, logout cleanup, and backend authorization boundaries.

## Backup and restore orchestration

`assets/js/core/backup.ts` defines the v4 Work Management backup contract. Imported backup content is treated as `unknown` and passes explicit parsing, version detection, compatibility migration, structural validation, Board cross-entity validation, restore planning, and persistence coordination before application state is invalidated.

The v4 validator rejects duplicate module-state records, duplicate/conflicting identifiers, orphaned Board groups/items/cells, invalid Status-label references, invalid assignee/member references, and unsupported versions. v3 backups normalize through an explicit v3→v4 migration path rather than scattered numeric comparisons.

Cloud restore uses `wm_restore_workspace_backup_v4`, introduced in `supabase/migrations/v1.41.0-transactional-backup-restore.sql` and consolidated into `supabase/schema.sql`. The database routine applies the supported workspace restore set in one PostgreSQL transaction and verifies critical Board references before returning success. Imported user references are resolved against the current workspace rather than trusting foreign user IDs blindly.

## Embedded-module runtime modernization

The host/bootstrap/store/identity boundaries are now TypeScript-owned:

- `assets/js/runtime/module-host.ts`;
- `assets/js/runtime/module-lifecycle.ts`;
- `assets/js/runtime/module-bootstrap.ts`;
- `assets/js/core/module-identity-bridge.ts`;
- `assets/js/core/module-cloud-store.ts`;
- `assets/js/core/cloud-module-data.ts`;
- `src/platform/contracts/embedded-module.ts`;
- `src/platform/contracts/module-host.ts`.

The host/module protocol validates explicit module identity and message envelopes. Embedded lifecycle transitions are constrained to `uninitialized → initializing → ready`, optional suspend/resume, failure, and disposal semantics. Generation ownership prevents callbacks from an obsolete attachment affecting a replacement module. Teardown aborts message listeners and runtime resources rather than leaking global singleton behavior.

TimeTracker, FuelTrack+, and TradeLink keep their established domain and presentation implementations. This phase modernizes their host/integration boundary only.

## Removed superseded runtime shims

The following classic source authorities are intentionally absent after migration:

- `assets/js/core/auth.ts`;
- `assets/js/core/backup.ts`;
- `assets/js/features/auth/index.ts`;
- `assets/js/features/account/index.ts`;
- `assets/js/runtime/module-bootstrap.ts`;
- `assets/js/runtime/module-host.ts`;
- `assets/js/core/module-identity-bridge.ts`;
- `assets/js/core/module-cloud-store.ts`;
- `assets/js/core/cloud-module-data.ts`.

No project-owned declaration shim is retained for these migrated implementations.

## Deferred boundary

Broad shell/feature rendering, DOM-heavy Board presentation/controllers, and other primarily visual JavaScript remain deferred. The next migration phase may begin the controlled UI/rendering TypeScript conversion only after the v1.41 source is re-run through the Vite dev/build/dist/preview gates in an environment where the locked Vite dependency can be installed.
