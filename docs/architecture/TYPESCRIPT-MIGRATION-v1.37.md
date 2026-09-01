# Incremental TypeScript migration — v1.37.0

## Scope and migration boundary

v1.37.0 begins the TypeScript migration after the verified Vite conversion. It intentionally does **not** convert the application UI wholesale. The release establishes strict typed boundaries first and keeps the proven JavaScript feature/runtime implementations interoperable during the transition.

### Completed in this release

1. **Platform contracts and shared types — complete foundation**
   - Stable identifiers, users, roles, capabilities, module definitions, application-manifest structures, application errors, persistence envelopes, pagination contracts, and asynchronous-state unions are defined under `src/types/`.
   - The shared type layer is split by responsibility rather than concentrated in one generic file.

2. **Transport, query and repository infrastructure — typed boundary complete; implementation migration in progress**
   - Explicit `AuthTransportPort`, `BackendClient`, `QueryClient`, repository result, diagnostics and query-event contracts are defined.
   - Existing JavaScript infrastructure modules expose `.d.ts` compatibility contracts so new TypeScript consumers receive strict signatures immediately.
   - The platform composition root has an explicit `.d.ts` contract; its JavaScript implementation remains unchanged until the next implementation-conversion slice is production-build verified.
   - The underlying backend client, query client and Board repository implementations intentionally remain JavaScript for this release and are the first implementation files scheduled for the next migration slice.

3. **RBAC capabilities and application manifest — typed boundary complete**
   - `PlatformRole`, `BoardRole`, `Capability`, module access inputs, typed capability matrices, module-role mappings, application routes/features/modules and manifest structures are explicit.
   - Runtime permission enforcement remains unchanged; existing Supabase/RPC/RLS authorization continues to be authoritative.

4. **Board schemas and column/status contracts — typed foundation complete**
   - Boards, groups, items, members, values and workspace payloads have explicit contracts.
   - Column types are represented with a discriminated union over `data_type`.
   - Status labels use stable `StatusLabelId` references and explicitly model name, color, ordering, active/deactivated state and description.
   - `parseStatusColumnConfig` and `assertStatusValue` provide runtime narrowing for untrusted status configuration/value boundaries.

### Intentionally not migrated yet

5. Controllers and domain services — pending.
6. Feature modules — pending.
7. UI/rendering code — deliberately last.

## Compiler policy

`tsconfig.json` uses strict checking, `strictNullChecks`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `verbatimModuleSyntax`, `isolatedModules`, and Vite-compatible `moduleResolution: Bundler`.

`allowJs` remains enabled only for the staged JS/TS interoperability period. `checkJs` remains disabled globally to avoid converting every historical implementation into an implicit compiler migration. JavaScript modules receive targeted declaration sidecars instead. The intended progression is to remove declarations as their implementations become `.ts`, then disable `allowJs` once the remaining feature/UI migration is complete.

The new TypeScript surface contains no broad `any`, `@ts-ignore`, or `@ts-nocheck` escape hatches.

## Dependency direction

The intended migration dependency direction is:

`shared types → platform contracts → domain contracts → repositories/services → controllers → features → UI`

Type-only imports use `import type`. No barrel is introduced across runtime/domain boundaries where it would create cycle risk.

## Verification

The migration adds:

- `npm run typecheck`
- `npm run verify:types`
- `verify-v1370-typescript-foundation.mjs`
- compile-time contract tests under `tests/types/`

`release:check` now runs the TypeScript compiler and migration-contract verifier before the Vite/dev/build/browser regression gates.

## Next slice

The next safe implementation conversion should migrate, in order:

1. normalized application errors;
2. query client;
3. backend transport client;
4. Board repository and repository response contracts;
5. RBAC policy implementation and application manifest data;
6. Board column/status normalization runtime;
7. controllers/domain workflows one bounded vertical slice at a time.

This preserves the current behavior while progressively moving the source of truth from declaration sidecars to typed implementations.
