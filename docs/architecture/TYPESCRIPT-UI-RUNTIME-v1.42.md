# v1.42.0 controlled UI/rendering TypeScript runtime

## Scope

v1.42 completes the controlled TypeScript migration of the Work Management presentation/runtime layer without changing the verified v1.41 business, persistence, authorization, or routing semantics. The application remains framework-neutral and uses typed DOM/template rendering rather than introducing React solely for TSX coverage.

The TypeScript-authoritative boundary now includes:

- `src/main.ts` and the application shell/navigation runtime;
- shared presentation, icon, formatting, command, settings, account, and user-management boundaries;
- Boards list/workspace/Table/Kanban rendering;
- Board coordinator, dialogs, columns, groups, items, members, activity, selection, drag/drop, resize, menus, overlays, and inline editing;
- configurable Status rendering/editing with stable label identifiers;
- Item Workspace Updates/Files/Activity rendering and interaction lifecycle;
- shared motion orchestration and progressive motion enhancement.

## Board and Status contracts

Board column rendering uses the authoritative Board discriminated unions and exhaustive handling. Configurable Status identity is the stable label ID rather than visible text. Historical Status option payloads continue to normalize into stable typed label configurations. Deleting a Status label follows the established `clear-on-label-delete` reference policy.

Inline rename/edit workflows retain explicit confirmation semantics: Enter and the check control confirm, Escape and the X control cancel, and supported rename flows do not save on blur. Overlay ownership remains centralized so incompatible root overlays replace one another and outside dismissal cannot leak the same click into an underlying Board action.

## JavaScript boundary after v1.42

There are no paired JavaScript/TypeScript Work Management UI authorities under `src/` or `assets/js/`. Remaining JavaScript is intentionally outside this migration boundary:

- TimeTracker, FuelTrack+, and TradeLink internal iframe application implementations;
- static/build boundaries such as Vite configuration, service worker, public runtime configuration, and browser harness support.

The embedded applications continue behind typed host/session/persistence/message contracts established in v1.41. They are not duplicate Work Management UI implementations.

## Compiler policy

The TypeScript project uses `strict`, `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, and `isolatedModules`. v1.42 additionally sets `allowJs: false`, `noUnusedLocals: true`, and `noUnusedParameters: true`. External/persisted data remains runtime-validated at trust boundaries.

## Architecture invariants

Dependency direction remains presentation/controllers -> domain services -> repositories -> transport. UI migration does not move persistence or authorization rules into rendering code. Vite remains the production build boundary, and embedded applications retain route-level iframe isolation. No v1.42 Supabase migration is required.
