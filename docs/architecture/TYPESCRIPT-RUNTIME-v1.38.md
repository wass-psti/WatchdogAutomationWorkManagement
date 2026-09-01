# Authoritative TypeScript runtime infrastructure — v1.38.0

## Scope

v1.38.0 is the second incremental TypeScript migration checkpoint after the strict contract foundation in v1.37.0. This release converts the runtime implementations behind the first six low-risk/high-value architecture layers to TypeScript without migrating controllers, feature renderers, or UI code prematurely.

The migration order is intentional and matches platform dependency direction:

1. normalized error infrastructure;
2. query/server-state runtime;
3. authenticated backend transport;
4. Board repository and DTO/domain mapping;
5. RBAC capability policy plus application/module manifest runtime;
6. configurable Board Status and column-type runtime.

No user-facing workflow or persisted schema change is required for this release. No v1.38.0 Supabase migration is required.

## Runtime ownership

The following implementations are authoritative TypeScript source:

- `assets/js/platform/errors/app-error.ts`
- `assets/js/platform/data/query-client.ts`
- `assets/js/platform/data/backend-client.ts`
- `assets/js/platform/auth/permissions.ts`
- `assets/js/features/boards/data/board-contracts.ts`
- `assets/js/features/boards/data/board-repository.ts`
- `assets/js/features/boards/status-labels.ts`
- `assets/js/features/boards/grid/column-type-registry.ts`
- `config/modules.ts`
- `config/application-manifest.ts`

The matching `.js` files are deliberately tiny compatibility entry points. Existing JavaScript consumers keep their stable import paths while Vite resolves the TypeScript runtime implementation. The obsolete `.d.ts` shims for these migrated layers are removed so runtime behavior and types cannot drift independently.

`assets/js/runtime/platform-services.d.ts` remains the one explicit infrastructure declaration boundary. The composition root and controller/domain-service implementations are the next migration slice.

## 1. Normalized error model

`WorkManagementError` now implements an explicit discriminated error category vocabulary:

- authentication
- authorization
- validation
- conflict
- not-found
- rate-limit
- timeout
- network
- storage
- transport
- backend
- internal
- unexpected

Infrastructure accepts `unknown` failures and normalizes them at trust boundaries. Original causes, operation names, backend status codes, details, retryability, and safe diagnostic metadata are preserved. Transport/storage/backend-specific error shapes are not exposed as application contracts.

## 2. Server-state/query runtime

The query client now owns a typed cache and lifecycle with:

- deterministic structural query keys;
- in-flight request de-duplication;
- stale-time reuse;
- typed cache reads/writes;
- scoped invalidation and removal;
- query subscriptions and lifecycle events;
- explicit typed mutation inputs/results/invalidation targets;
- diagnostic hooks.

Mutations remain non-retried by default because application mutations are not universally idempotent. Feature-specific optimistic UI remains in the established interaction controllers for now; the platform query layer does not invent a second optimistic source of truth.

## 3. Backend transport

The Supabase transport is now TypeScript-owned and returns `unknown` by default. A caller only receives a generic typed result when it supplies an explicit runtime validator. This keeps TypeScript from masquerading as runtime validation at network boundaries.

The transport distinguishes authentication, RPC/backend, transport, Storage, abort, timeout, and malformed-response failures through the normalized error layer. Storage upload/delete support `AbortSignal`, preserve safe metadata, and classify HTTP failures explicitly.

Pagination contracts (`PaginationCursor`, `PageMetadata`, `Page<T>`) are defined for endpoints that adopt pagination later; current Board RPCs are not falsely represented as paginated.

## 4. Board repository and mapping

The Board repository is now the authoritative typed boundary between transport DTOs and Board domain values. It models actual RPC semantics rather than declaration assumptions: create/duplicate/group/item/column operations return stable scalar identifiers where the backend returns IDs.

DTO mapping validates and normalizes:

- Boards
- groups
- items
- columns
- configurable Status definitions
- typed cell values
- members
- Item Workspace updates/files/activity
- Board preferences and activity collections

Legacy Status-column `options` remain readable and normalize to stable Status label identifiers. Transport naming and nullable DTO behavior stay inside the repository/mapping layer.

Mutation cache invalidation remains targeted. Permission-sensitive permanent item deletion forces a fresh workspace authorization read before private Storage deletion. Failed file registration still performs best-effort Storage rollback.

## 5. RBAC and application manifest

Role/capability/module runtime configuration is now TypeScript-owned.

The platform and Board capability matrices are compile-time checked against the authoritative role unions. Module administrator-role mapping is exhaustive across every `ModuleId`. The module registry itself satisfies `Record<ModuleId, WorkManagementModuleDefinition>`, so a newly added module creates compile-time pressure until it is fully defined.

The application manifest is now an authoritative typed runtime value and advances the architecture to **Version 12** with `runtimeInfrastructure: 'typescript-authoritative'`. Route ownership is checked against the typed `FeatureId` set, and manifest validation remains available at runtime.

Client RBAC remains an interface/access policy. Supabase RLS and protected RPC authorization remain the security boundary.

## 6. Board Status and column runtime

The configurable Status runtime now strongly models stable IDs, labels, colors, order, active state, descriptions, default behavior, legacy normalization, and label-management operations.

Important semantics:

- display names are never persistent identity;
- label deletion is explicitly `clear-on-label-delete`, matching `wm_set_board_status_labels` backend behavior;
- deactivating the current default automatically selects the first remaining active label;
- at least one active label must remain;
- IDs are constrained to the backend-compatible 96-character limit;
- a Status column supports at most 50 labels, matching backend normalization limits;
- duplicate IDs and case-insensitive duplicate names are rejected.

The Board column registry is a compile-time complete mapping for all current column types. Each entry owns editor metadata, default value, and normalization behavior. Dates, timelines, URLs, emails, checkboxes, numbers, and bounded text values are validated before persistence. Invalid timeline ranges and invalid calendar dates are rejected rather than propagated to the backend.

## Browser verification and TS interoperability

The Chromium integration harness transpiles the small set of authoritative TypeScript runtime modules it evaluates directly with Node's built-in `stripTypeScriptTypes(..., { mode: 'strip' })` support. This keeps the deterministic CDP interaction suite capable of testing the real TypeScript Status/column implementations even when project-local npm dependencies are intentionally absent from a source-only verification environment. Vite remains the production transpilation/build owner.

Node-based historical verifiers execute with Node's type-stripping support. Vite remains the production transpilation/build owner.

## Migration-debt policy

The migrated runtime files contain no broad `any`, `@ts-ignore`, or `@ts-nocheck` escape hatches. Untrusted input uses `unknown`, runtime narrowing, DTO mapping, or validators. Type-only dependencies use `import type`.

The v1.38 verification gate asserts that removed declaration shims do not reappear and that every migrated implementation has one authoritative `.ts` source.

## Next migration boundary

The next incremental slice is **controllers and domain services**, beginning with the platform composition root and stable Board workflow controllers. Feature modules should follow one bounded vertical slice at a time. UI/rendering remains last.

Temporary boundary after v1.38:

```text
Typed platform/domain contracts
  -> TypeScript runtime infrastructure (v1.38 complete)
       -> JS composition root/controllers/domain workflows (next)
            -> JS feature modules
                 -> JS rendering/UI (last)
```
