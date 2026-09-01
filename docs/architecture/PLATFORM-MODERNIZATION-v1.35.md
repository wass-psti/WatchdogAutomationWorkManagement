# Platform Modernization — v1.35.0

## Decision summary

Work Management has reached the point where adding another UI framework would be less valuable than establishing stable platform contracts around the code that already works. v1.35.0 therefore uses an incremental modular-platform strategy: preserve the static ES-module shell, same-origin module isolation, Supabase authorization contract, established Board interaction engine, and existing user experience while extracting the cross-cutting concerns that were beginning to couple features together.

This release is architecture-only from a database perspective. It introduces no v1.35.0 Supabase migration and does not alter existing user records. Deployments must still have the previously released migrations, including v1.34.0 configurable Status labels, applied.

## Current-state evaluation

### Strengths retained

- The shell already uses explicit route ownership, feature registration, lifecycle hooks, and a runtime service gateway.
- TimeTracker, FuelTrack+, and TradeLink are isolated behind same-origin iframe/module-host boundaries, so their large runtimes are not initialized during the initial shell route.
- Boards already has controller/view/workflow separation, disposal-aware interaction controllers, a mature table/Kanban engine, optimistic editing, drag/drop, history, selection, Item Workspace isolation, and browser integration coverage.
- Authentication, module identity, Supabase RLS/RPC enforcement, design tokens, theme layers, and service-worker delivery are mature enough that replacing them wholesale would introduce more risk than value.

### Scaling constraints found

1. **Transport coupling.** Boards knew Supabase RPC and Storage details directly. That made backend changes visible to feature code and made consistent error handling/caching difficult.
2. **No server-state layer.** Repeated reads had no shared request de-duplication, stale-time policy, or targeted invalidation contract.
3. **Authorization vocabulary was role-centric.** UI code still interpreted role names instead of asking for capabilities.
4. **Overlay behavior was feature-specific.** Boards had solved single-active-overlay behavior locally, but the application needs the same lifecycle contract for menus, popovers, dialogs, and future modules.
5. **Trust-boundary validation was inconsistent.** RPC response shapes were commonly assumed rather than checked at a repository boundary.
6. **Board column behavior was distributed across conditional branches.** Adding types required touching several unrelated constants/controllers.
7. **Runtime errors lacked a route-owned recovery boundary.** Global logging existed, but a renderer failure could still leave a route without a controlled recovery surface.
8. **Observability had no structured support seam.** Console logging could not provide a small sanitized diagnostic context to support/debug workflows.
9. **The native shell is still eager-loaded.** This is acceptable at the current scale, but Boards is now large enough to become the first native feature chunk when a build pipeline is introduced.
10. **The three embedded domain applications remain large files internally.** Their iframe boundary limits initial-load impact, but future domain growth should move policy/services/workflows out of those entry files incrementally.

## v1.35 platform architecture

### 1. Composition root

`assets/js/runtime/platform-services.ts` constructs cross-cutting services once. The shell registers those services with the existing Work Management runtime client rather than creating feature-specific singletons.

Current services:

- diagnostics;
- server-state/query client.

The composition-root approach is intentionally preferred over a dependency-injection container. Constructor/factory injection is explicit, testable, and has zero runtime framework cost.

### 2. Backend transport boundary

`assets/js/platform/data/backend-client.ts` owns authenticated Supabase transport mechanics:

- access-token acquisition;
- RPC request construction;
- private Storage upload/delete/sign operations;
- transport error normalization.

Feature code must not construct `/rest/v1/rpc/*` or `/storage/v1/*` URLs directly. Domain repositories depend on this client, and views/controllers depend on repositories.

### 3. Server-state/query boundary

`assets/js/platform/data/query-client.ts` introduces a small framework-neutral server-state cache with:

- stale-time caching;
- in-flight request de-duplication;
- explicit query keys;
- prefix invalidation/removal;
- cache subscriptions;
- diagnostics hooks.

State ownership is now classified as follows:

| State category | Owner | Examples |
| --- | --- | --- |
| Server state | Query client + repository | Boards, item workspace, activity, preferences read from backend |
| Persistent application state | Existing cloud/platform persistence | authenticated profile, module cloud state, persisted Board settings |
| Local UI state | Feature/controller | open menu, active tab, selection marquee, transient editor |
| Form state | Form/controller scope | create/edit form values and validation feedback |
| Derived state | Computed at render/controller boundary | filtered items, sorted rows, visible columns, permission-derived actions |

Derived state is not persisted merely for convenience. Local UI state does not become global state unless multiple independent owners require it.

### 4. Repository/service layer

`assets/js/features/boards/data/board-repository.ts` is the pilot repository. It is the only Boards feature-facing layer that knows Board RPC operation names and private-file transport behavior. It provides:

- response-contract checks;
- query caching and de-duplication;
- mutation invalidation;
- normalized errors;
- forced fresh reads for permission-sensitive permanent deletion;
- upload cleanup if database registration fails;
- a stable service API compatible with the existing Board controllers.

`assets/js/core/boards.ts` remains as a compatibility facade so historical imports do not break while code migrates toward feature-owned repositories.

The same pattern is the target for Attendance, Fuel Requests, Trade Documents, Roles, and Profiles. Domain components should not query Supabase directly.

### 5. Runtime contracts and schema validation

`assets/js/features/boards/data/board-contracts.ts` validates high-value Board response envelopes at the repository boundary. `assets/js/features/boards/grid/column-type-registry.ts` centralizes Board column metadata and primitive normalization.

This is the bridge toward a stronger typed-contract system without adding a build dependency to the current static runtime. Stable internal IDs remain authoritative for Status labels, column IDs, user IDs, group IDs, and item IDs.

### 6. Capability-based authorization

`assets/js/platform/auth/permissions.ts` defines capability names independently from presentation role labels. Examples include:

- `platform.admin`;
- `role.manage`;
- `module.access.all`;
- `board.view`;
- `board.edit`;
- `board.manage`;
- `board.activity.view`.

Existing role behavior is preserved through role-to-capability mappings. UI code can ask whether an action is allowed without understanding why a role grants it. Supabase RLS/RPC checks remain the authoritative backend enforcement layer; client capabilities are not a security boundary.

Future domain policies should expose capabilities such as `attendance.approve`, `fuel.export`, `document.approve`, or `activity.view` while retaining server-side enforcement.

### 7. Unified overlay lifecycle

`assets/js/platform/ui/overlay-manager.ts` standardizes the lifecycle needed by contextual UI:

- one active overlay branch;
- intentional parent/child overlays;
- replacement behavior;
- topmost-first Escape dismissal;
- outside-click dismissal;
- focus restoration callback;
- click-through suppression hooks.

Boards now adapts this platform manager through its domain-specific overlay coordinator. Positioning/visual presentation remains component-owned so the lifecycle layer does not become a monolithic UI framework.

### 8. Runtime error boundary and diagnostics

`assets/js/runtime/error-boundary.ts` normalizes synchronous renderer failures and rejected route rendering operations into a recoverable route state. The shell provides retry and home-navigation actions instead of leaving partially rendered content.

`assets/js/platform/observability/diagnostics.ts` keeps a bounded, sanitized, in-memory diagnostic stream. It deliberately does not send analytics or telemetry. Sensitive key names are redacted. A future support/observability adapter can consume this seam without changing feature code.

### 9. Forms and validation

Current shell forms are feature-owned and several embedded modules have domain-specific form logic. v1.35 does not introduce a generic form library because the application does not currently share a component framework. The architectural rule is instead:

- form state remains local to the owning workflow;
- schemas validate data at submit/import/API boundaries;
- reusable field primitives own label/help/error/disabled/loading/accessibility behavior;
- domain validators stay outside presentation rendering;
- server errors are normalized before they reach form copy.

After TypeScript/build tooling is introduced, a framework-neutral `platform/forms` contract should standardize field state and validation adapters. React-specific form libraries should only be considered if a React surface is intentionally adopted.

### 10. Real-time and background synchronization

The current application has cloud persistence and explicit refresh/update flows but no platform-wide real-time subscription coordinator. v1.35 deliberately does not turn on broad Supabase Realtime subscriptions because subscribing every screen independently would recreate the coupling this architecture is removing.

The query client establishes the necessary invalidation seam. A later synchronization service can translate authenticated backend events into repository query invalidations, coalesce bursts, pause while offline/hidden, and refetch only affected scopes. Writes should continue to use optimistic updates only where rollback semantics are defined; mutations should not be blindly retried when they are not idempotent.

Cross-feature events should use the existing Work Management runtime client/module-host event contract instead of creating another global event bus.

### 11. Build and deployment

The current GitHub-Pages/static-host deployment remains viable because the shell is native ES modules and embedded applications are same-origin documents. The service worker pre-caches the authoritative runtime manifest and uses network-first handling for critical platform modules.

The limitation is developer tooling rather than runtime viability: without a build pipeline there is no compile-time type checking, package-level tree shaking, dependency chunking, source-map pipeline, or standard test runner. Vite is therefore recommended as a future **tooling migration**, not a UI rewrite. The generated deployment can remain static and compatible with the existing hosting model.

### 12. Board/grid extension seam

The existing Board grid remains in place because it already supports specialized behavior that would be expensive to reproduce safely: sticky identity columns, grouped sections, resizing/reordering, custom editors, selection/history, drag/drop, Item Workspace coordination, configurable Status labels, and accessibility behavior.

The new column-type registry is the first plugin seam. New column types should progressively move the following behavior behind registered definitions:

- presentation metadata;
- value normalization/serialization;
- renderer/editor factory;
- sorting/filtering capability;
- validation;
- migration/version metadata.

Virtualization should only be introduced after measured row-count/DOM pressure justifies it. It must preserve keyboard navigation, sticky columns, scroll position, and inline editor geometry.

## Module boundaries

Target dependency direction:

```text
Shell / Routes
  -> Runtime services
  -> Feature facade
       -> Controller / workflows
       -> Views / UI state
       -> Domain repository
            -> Platform backend client
            -> Platform query client
            -> Runtime contracts

Embedded application route
  -> Module host
  -> Identity bridge / cloud store
  -> Domain config + domain services
  -> Embedded UI runtime
```

Rules:

- Boards, TimeTracker, FuelTrack+, and TradeLink must not import each other's implementations.
- Cross-module communication uses the existing runtime client/module-host contracts, shared identity/persistence services, or explicit domain events.
- Shared UI behavior belongs under platform/foundation layers only when at least two feature owners need the same lifecycle contract.
- Role labels are never authorization policy.
- Components do not construct backend URLs or SQL/RPC semantics.
- A repository may depend on transport/query infrastructure; a view must not.
- Backend authorization remains server enforced even when UI capabilities hide an action.

## Framework/library evaluation

| Technology / pattern | v1.35 decision | Engineering rationale |
| --- | --- | --- |
| React / Vue / Svelte rewrite | **Do not adopt as a rewrite** | High migration/regression cost; existing ES-module feature boundaries already work. A UI framework does not solve transport, policy, or data-boundary coupling by itself. |
| Manifest-driven hash router | **Keep now** | Current route ownership, auth gating, lifecycle, and module-host behavior are explicit and tested. Reassess only if nested routing/data-loader requirements materially exceed it. |
| Vite | **Recommended future build phase** | Enables reliable package management, TypeScript, dynamic chunking, test tooling, and optimized production bundles. Introduce after current runtime contracts are stable. |
| TypeScript | **Strongly recommended incrementally** | Highest-value next maintainability step. Start with platform contracts, repositories, Board schemas, permission policies, then feature controllers. |
| Zod or equivalent schema validator | **Recommended with the typed build phase** | Replaces hand-written trust-boundary checks with declarative runtime schemas. Keep it at API/storage/import boundaries, not every internal function. |
| TanStack Query Core | **Optional future implementation behind query-client interface** | Current cache covers immediate de-duplication/invalidation needs without a dependency. Adopt only when retries, cancellation, persistence, mutation orchestration, or dev tooling justify it. |
| TanStack Table / commercial grid | **Do not migrate Boards now** | Current Board semantics are highly specialized. A table replacement would be a behavioral rewrite and could regress sticky/group/drag/editor behavior. Continue extracting a Board-grid abstraction first. |
| Floating UI | **Good future overlay-positioning adapter** | Collision detection/placement would improve menus/popovers. It can sit behind the shared overlay lifecycle without changing feature APIs. |
| XState | **Selective candidate** | Valuable for complex approval/attendance/document state machines, but unnecessary for simple local UI state. Use only where explicit transition graphs reduce business-rule ambiguity. |
| Framework-specific form library | **Do not adopt globally now** | No shared component framework exists. Standardize form contracts/validation first; select a library only within an intentional framework surface. |
| React Hook Form | **Not applicable to current runtime** | React-specific. Prefer framework-neutral form contracts until/unless a React surface is intentionally introduced. |
| Vitest | **Recommended with Vite/TypeScript** | Better unit/integration ergonomics for contracts, policies, repositories, and pure workflow rules. |
| Playwright | **Recommended future E2E harness** | Richer browser automation and diagnostics than the custom CDP harness. Current zero-install Chromium suite remains valid until a package toolchain is accepted. |
| Framer Motion / animation framework | **Do not adopt** | Current WAAPI/motion orchestrator already scopes movement, respects reduced motion, and avoids framework lock-in. |
| DI container | **Do not adopt** | Factory/constructor injection and the platform composition root provide the needed testability with less indirection. |
| Sentry / OpenTelemetry | **Adapter point only, not required now** | Structured diagnostics are useful, but no vendor should become a hard runtime dependency. Add an opt-in production exporter only when operational requirements justify it. |

## Code splitting and loading strategy

Today, TimeTracker, FuelTrack+, and TradeLink already have meaningful route-level isolation: their iframe documents and implementation code are loaded when those modules are opened, not executed as part of normal shell bootstrap.

The native shell still imports its feature graph eagerly through `runtime/index.js`. The recommended next loading phase, after Vite/TypeScript, is:

1. keep authentication/home shell essentials in the bootstrap chunk;
2. split Boards, Settings, User Management, and Account at route ownership boundaries;
3. prefetch likely next routes on idle/intent rather than loading every feature at startup;
4. keep shared platform/data/design-system code in stable shared chunks;
5. avoid loading flashes by retaining the current route-owned loading/recovery surfaces.

A hand-written dynamic-import conversion is intentionally not part of v1.35 because the current static service-worker/test contracts make build-pipeline introduction the safer point to establish chunk ownership.

## Reliability and testing architecture

Release gates remain behavior-first:

- pure/unit tests for policy, normalization, query invalidation, schemas, and workflow rules;
- integration tests for repositories and controllers with injected transports;
- browser integration for keyboard/focus/overlay/drag/resize/race-condition behavior;
- high-value end-to-end workflows for authentication, RBAC, Boards, TimeTracker Clock In/Out, FuelTrack approvals, and TradeLink approval/document generation;
- no dependence on large visual snapshot suites for business correctness.

v1.35 adds an architecture verifier that checks query de-duplication/invalidation, capability mappings, column registry behavior, diagnostic redaction, repository/transport boundaries, shared overlay adoption, runtime asset registration, and the no-database-migration guarantee.

## Incremental migration sequence

### Completed in v1.35

1. Platform composition root.
2. Normalized application errors.
3. Shared backend transport client.
4. Shared server-state/query client.
5. Boards repository migration behind compatibility facade.
6. Capability-based platform/Board policy vocabulary.
7. Shared overlay lifecycle with Boards adapter.
8. Board column-type registry.
9. Route error boundary and sanitized diagnostics.
10. Architecture regression gate and documented framework decisions.

### Recommended next phases

1. Introduce Vite + TypeScript without changing runtime behavior; convert platform/repository/contracts first.
2. Add declarative schema validation at API/import/storage boundaries.
3. Move Account/User Management and shared profile operations onto repositories/query state.
4. Extract TimeTracker, FuelTrack+, and TradeLink transport/business workflows into domain services within their existing iframe boundaries.
5. Expand capability policies and server-side authorization tests for every sensitive domain action.
6. Move reusable form primitives and overlay positioning behind shared design-system contracts.
7. Introduce route-level native-shell chunks and intent-based prefetching.
8. Adopt Playwright/Vitest when the package toolchain is established.
9. Add optional production observability exporter only after privacy, retention, and support requirements are defined.

This sequence preserves existing behavior at every step and allows obsolete compatibility paths to be removed only after their consumers have migrated and regression gates prove equivalence.
