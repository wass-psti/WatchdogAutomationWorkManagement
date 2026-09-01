# Work Management Architecture


v1.43.2 production hardening retains **Architecture Version 15** while adding defense-in-depth at external-data, session-revalidation, SQL authorization, transport timeout, diagnostics, and public-build boundaries. The v1.42 TypeScript architecture remains authoritative; this phase hardens its production behavior rather than introducing another migration layer.
v1.42.0 establishes **Architecture Version 15** and completes the controlled Work Management shell/UI TypeScript migration. Authentication/session, backup/restore, embedded-module host integration, shell/navigation, shared presentation contracts, Boards rendering and interaction controllers, Item Workspace, overlays, and motion infrastructure are TypeScript-authoritative. The v1.41 behavioral baseline remains the compatibility reference; the internal UIs of TimeTracker, FuelTrack+, and TradeLink remain isolated same-origin JavaScript compatibility islands behind typed host contracts rather than being rewritten as part of this release.

v1.41.0 established **Architecture Version 14** for the remaining non-visual TypeScript runtime boundary, while v1.39.0 established **Architecture Version 13** for the TypeScript composition/controller/domain-service layer.

## Purpose

Work Management is a progressively modernized modular platform, not a collection of pages sharing a global script. Earlier architecture phases established the runtime gateway, feature registry, route ownership, application lifecycle, module host, domain configuration boundaries, design tokens, browser integration verification, motion architecture, Board workflow/controller boundaries, grouped Board sheet, and configurable Status system.

v1.35.0 added the first shared **platform infrastructure layer** around transport, server state, authorization policy, overlay lifecycle, runtime errors, diagnostics, and extensible Board schemas. v1.36.0 adds the package/build boundary around that architecture with **Vite 8**, deterministic production bundles, source maps, environment conventions, and build-generated service-worker assets.

The modernization remains incremental and static-host compatible. No UI-framework rewrite or v1.36 database migration is required.

## Layer model


### 0. Build and delivery pipeline

`src/main.ts` is the Vite-owned browser composition entry. `vite.config.js` owns deployment base handling, production chunking, source maps, emitted asset naming, static embedded-module compatibility copies, and service-worker cache-manifest generation.

The shell is bundled and optimized. TimeTracker, FuelTrack+, and TradeLink remain route-lazy same-origin iframe runtimes during this phase so build-system adoption does not require simultaneous domain rewrites.

Public browser environment values use `VITE_*`; secrets remain server-side. The default relative base keeps GitHub Pages/subdirectory deployments viable.

### 1. Foundation and design system

`assets/css/foundation/` owns semantic tokens, themes, primitives, accessibility defaults, spacing, typography, focus behavior, and shared visual contracts. Feature CSS consumes these contracts rather than defining independent theme systems.

### 2. Runtime gateway and composition root

`assets/js/runtime/index.ts` is the shell dependency gateway.

`assets/js/runtime/platform-services.ts` is the authoritative platform composition root. Obsolete paired JavaScript compatibility entries have been removed now that Work Management consumers import TypeScript authorities directly. Cross-cutting services are constructed once and injected or registered through the internal Work Management runtime client.

### 3. Platform infrastructure

`assets/js/platform/`

- `errors/app-error.ts` — authoritative normalized application errors;
- `observability/diagnostics.ts` — bounded, sanitized local diagnostic events;
- `data/query-client.ts` — authoritative server-state caching, stale-time policy, request de-duplication, invalidation, and mutation contracts;
- `data/backend-client.ts` — authoritative authenticated Supabase RPC/private-Storage transport and external-data validation boundary;
- `auth/permissions.ts` — authoritative capability vocabulary and exhaustive role-to-capability mapping;
- `ui/overlay-manager.ts` — shared contextual overlay lifecycle.

Platform infrastructure is framework-neutral and contains no feature-specific presentation.

### 4. Runtime ownership

`feature-registry.ts`, `route-controller.ts`, `application-lifecycle.ts`, and `error-boundary.ts` define ownership and recovery:

1. parse route;
2. enforce authentication/account policy;
3. resolve route owner from the manifest;
4. activate/deactivate feature ownership only when required;
5. dispatch the route renderer through a recoverable error boundary;
6. keep long-lived browser events in a disposable lifecycle unit.

### 5. Feature/domain boundaries

`assets/js/features/`

- Auth
- Home / Commands
- Account
- Settings
- User Management / Roles
- Boards
- Module registry/host integration

A feature facade exposes its public runtime surface. Controllers/workflows own behavior; views own presentation; repositories own domain persistence access. Features do not import another business module's implementation.

### 6. Repository/data boundaries

Boards is the first migrated repository:

```text
Board view/controller
  -> Board repository
       -> query client
       -> backend client
       -> response contracts
            -> Supabase RPC / private Storage
```

`assets/js/core/boards.ts` is a typed feature-facing Board gateway and no longer owns transport details.

Future Attendance, Fuel, Trade Document, Role, and Profile repositories should follow the same direction.

### 7. Board/grid architecture

Boards retains its established grid engine and interaction controllers. v1.35 established the seams; v1.38 makes these Board data/schema seams TypeScript-authoritative:

- `data/board-repository.ts`;
- `data/board-contracts.ts`;
- `grid/column-type-registry.ts`;
- `status-labels.ts`;
- shared overlay-manager adoption;
- capability-based Board policies.

The registry becomes the extension point for future column renderers/editors/validators instead of expanding global conditionals.

### 8. Embedded applications

TimeTracker, FuelTrack+, and TradeLink remain isolated same-origin application runtimes behind the typed `module-host.ts`, identity bridge, cloud store, domain config, and authenticated module bootstrap boundaries. Their internal application scripts remain intentionally isolated compatibility islands for this release.

This boundary is also a practical loading boundary: embedded application code is not initialized until its module route opens. Internal domain decomposition can proceed without destabilizing the shell.

### 9. Persistence and state ownership

- **Server state:** repositories + query client.
- **Persistent application/domain state:** Supabase-backed domain stores/RPCs and established shell preferences.
- **Local UI state:** feature/controller scope.
- **Form state:** owning form/workflow controller.
- **Derived state:** computed from authoritative inputs, not redundantly persisted.

Backend RLS/RPC enforcement remains authoritative. Client capabilities improve UX and consistency but never replace server authorization.

### 10. Testing and release gates

The repository maintains static verifiers, domain release checks, and a real Chromium/CDP integration suite. v1.35 adds architecture-contract checks for server-state behavior, policy mappings, repositories, transport isolation, overlay reuse, column registry extensibility, diagnostic redaction, runtime asset registration, and release-version consistency.

The package/build-tooling phase is now established with Vite. The next testing target is incremental Vitest + Playwright adoption; behavior-first tests remain authoritative.

## Dependency direction

```text
index.html
  -> src/main.ts (Vite entry)
       -> foundation/design system
       -> shell
       -> runtime gateway
            -> platform services
            -> feature registry / route controller / lifecycle / error boundary
            -> feature facade
                 -> controllers + workflows + views
                 -> repository
                      -> query client
                      -> backend client
                      -> domain contracts

module route
  -> module host
       -> identity + cloud-store boundary
       -> domain-config
       -> embedded domain runtime
```

Dependencies flow inward toward stable contracts. Transport/vendor details do not flow upward into views.

## Compatibility strategy

Work Management uses a strangler migration:

- preserve routes, IDs, persisted values, RLS/RPC business rules, and public feature behavior;
- create stable interfaces before moving implementation;
- redirect consumers to typed authorities through bounded migration seams;
- verify equivalence with behavior tests;
- remove obsolete paths only after all consumers migrate;
- avoid business-data migrations for architecture-only changes.

For the platform evaluation see `PLATFORM-MODERNIZATION-v1.35.md`. For the package/build migration see `VITE-MIGRATION-v1.36.md`. For the completed Work Management UI migration and verification boundary see `TYPESCRIPT-UI-RUNTIME-v1.42.md` and `TYPESCRIPT-UI-RUNTIME-VERIFICATION-v1.42.md`.
