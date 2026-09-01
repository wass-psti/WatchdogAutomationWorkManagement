# TypeScript orchestration migration — v1.39.0

## Scope

v1.39.0 advances from the fully verified v1.38.0 runtime-infrastructure checkpoint into the application-orchestration boundary. The release deliberately does **not** migrate broad feature rendering or DOM-heavy workflow code. It makes composition, route policy, low-coupling controllers, and the Board domain-service boundary authoritative TypeScript while preserving the v1.38 runtime behavior as the rollback reference.

No Supabase schema or data migration is required.

## Authoritative composition root

`assets/js/runtime/platform-services.ts` is now the platform composition root. `assets/js/runtime/platform-services.d.ts` has been removed.

The composition root constructs dependencies in one direction:

`auth → diagnostics/query/backend → Board repository → Board domain service`

It also exposes the typed route-policy service, application manifest validation, platform-capability policy, and normalized-error adapter. The Board repository and Board domain service share the same platform query-client singleton. The shell creates this graph once with `createPlatformServices({ auth })` and injects `platformServices.boards.service` into the Boards feature.

The production shell no longer asks the Board UI to construct its own repository/transport graph. `assets/js/boards-ui.ts` requires an injected Board domain service. A compatibility fallback remains only in `assets/js/features/boards/index.ts` for direct historical feature consumers; the normal application path uses the platform composition root.

## Controller migration

The following low-rendering-coupling controllers are authoritative TypeScript in v1.39.0:

- `assets/js/runtime/route-controller.ts`
- `assets/js/features/boards/boards-controller.ts`
- `assets/js/features/boards/controllers/history-controller.ts`

The route controller delegates authentication/disabled-account decisions to the pure route-policy service instead of owning string-based policy branches. It remains responsible for lifecycle side effects, navigation, renderer invocation, module detachment, and error-boundary execution.

The Boards controller receives a Board domain-service factory/injected instance and does not import repository or transport implementations.

The history controller retains the exact session-scoped undo/redo behavior while normalizing orchestration failures through the shared application-error layer.

## Domain/application services

Two orchestration services are introduced:

- `assets/js/runtime/services/route-policy.ts`
- `assets/js/features/boards/services/board-domain-service.ts`

The route-policy service is pure and deterministic. It owns only route-access decisions; it performs no navigation or rendering.

The Board domain service is intentionally behavior-preserving in this slice. It presents the existing Board application API over the typed repository boundary so controllers and JavaScript feature consumers stop depending on repository construction. Business rules can move behind this service incrementally without changing UI contracts.

## Dependency direction

The intended dependency direction is now explicit:

`feature rendering/UI → controllers → domain/application services → repositories → backend transport`

The v1.39 verifier rejects direct Board controller imports of the repository/backend client and rejects UI/DOM dependencies in the Board domain service.

## JavaScript interoperability boundary

Rendering-heavy Board controllers remain JavaScript by design because converting them now would cross into the next feature/UI migration boundary:

- activity workflows
- Board floating-menu controller
- column resize
- column workflows
- dialog controller
- drag/drop
- group workflows
- inline editing
- item-panel renderer
- item workflows
- Item Workspace controller
- member workflows
- overlay coordinator
- selection controller
- structure drag controller

Their existing `.js` contracts continue to consume the typed Board domain service through the unchanged method surface.

The `.js` files adjacent to newly migrated `.ts` runtime modules are compatibility re-export entries, not duplicate implementations.

## Declaration inventory

There are no remaining project-owned `.d.ts` migration shims under `src`, `assets/js`, or `config`. `platform-services.d.ts` is removed.

External/package declarations supplied by dependencies are outside this inventory.

## Verification

`verify-v1390-typescript-orchestration.mjs` covers:

- composition-root construction and singleton query identity
- transport → repository → domain-service wiring
- manifest/capability/error adapters
- route-policy decisions
- route-controller ownership lifecycle
- Board controller dependency injection
- Board history success/failure behavior
- absence of `platform-services.d.ts`
- absence of unsafe TypeScript migration escapes
- dependency-direction guards
- intentional retention of rendering-coupled JavaScript controllers

The full project release gate remains `npm run release:check`.
