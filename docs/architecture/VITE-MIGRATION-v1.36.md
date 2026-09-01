# Work Management App v1.36 — Vite build-pipeline migration

## Purpose

v1.36 introduces Vite as the build and development pipeline without rewriting the existing Work Management product architecture. The native ES-module shell, Supabase integration, platform services, Boards engine, and same-origin embedded modules remain behaviorally compatible. This phase creates the package/build boundary required before a later TypeScript migration.

## Toolchain baseline

- **Vite 8.2.2**, pinned as a development dependency.
- **Node.js 20.19+ or 22.12+**, matching the Vite 8 engine requirement.
- **npm** as the documented package manager for this repository.
- `src/main.ts` is the only Vite-owned browser entry.
- Production output is written to `dist/`.
- Production source maps default to `hidden` and can be changed through `VITE_BUILD_SOURCEMAP`.
- Production build metadata is emitted through `.vite/manifest.json`.

## Entry-point migration

The former `index.html` loaded five stylesheets, backend configuration, two classic motion scripts, and the application module directly. In v1.36 the HTML owns only document metadata/public assets plus:

```html
<script type="module" src="/src/main.ts"></script>
```

`src/main.ts` imports the design-system styles, compatibility backend configuration, motion runtimes, applies Vite environment values, and then dynamically imports the existing shell. The dynamic import creates a stable asynchronous bundle seam while preserving the shell's established initialization order.

## Environment configuration

Public browser configuration uses Vite's `VITE_*` convention:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_BASE_PATH`
- `VITE_BUILD_SOURCEMAP`

Only public Supabase client configuration belongs in these values. Service-role keys and other privileged secrets must remain outside the browser build.

The checked-in `config/backend-config.js` remains a compatibility fallback for existing source-level tests and controlled development configurations. Vite environment values override that fallback before the authentication runtime is imported.

## Static embedded modules

TimeTracker, FuelTrack+, and TradeLink remain same-origin iframe compatibility islands for this migration. Their existing HTML, domain configuration, styles, and application scripts are copied into `dist/apps/` unchanged. This is intentional: forcing all three mature runtimes through Vite in the same release would combine build-system migration risk with domain-runtime migration risk.

The shared classic assets required by those modules are copied to their existing production paths:

- `assets/css/motion-design.css`
- `assets/js/runtime/motion-orchestrator.ts`
- `assets/js/runtime/motion-design.ts`
- `assets/js/runtime/module-bootstrap.ts`
- `assets/js/core/module-identity-bridge.ts`
- `assets/js/core/module-cloud-store.ts`

Future module-specific Vite entries can replace these compatibility copies incrementally.

## Production chunking

The shell receives three explicit architecture-oriented Rolldown code-splitting groups where they provide useful cache boundaries:

- `boards`
- `identity`
- `platform`

The application bootstrap is also separated from the shell by the dynamic `import()` in `src/main.ts`. The large embedded applications already load on demand through their iframe routes and therefore do not contribute to the initial shell bundle.

No generic vendor chunk is configured because the browser runtime currently has no third-party application dependencies that justify one.

The shell also handles Vite's `vite:preloadError` event in production. If a long-lived tab requests an obsolete hashed async chunk after deployment, the application performs a guarded one-time reload to recover onto the current asset graph without creating an infinite reload loop.

## Service worker

The service-worker implementation remains a stable root asset, but its precache manifest is now generated from Vite's emitted bundle instead of assuming source-module filenames in production. The source `config/runtime-assets.js` remains for source-level regression compatibility; the production build replaces `dist/config/runtime-assets.js` with the emitted hashed asset list.

The service worker is disabled during the Vite development server to prevent a production cache from controlling HMR/dev requests. Production hashed `/build/` assets use cache-first behavior, while the isolated embedded modules stay network-authoritative as before.

## Deployment base

`VITE_BASE_PATH=./` is the default because it is safe for GitHub Pages and other subdirectory/static deployments. Deployments that require an absolute base can set an explicit value such as `/work-management/` before `npm run build`.

The product uses hash routing, so direct route refreshes remain independent of server-side SPA rewrite rules.

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
npm run release:check
```

`release:check` verifies the Vite architecture contract, starts the development server, creates the production build, validates emitted files/source maps/service-worker assets, smoke-tests the preview server in Chromium, and runs the existing full Work Management regression suite.

## TypeScript readiness

This release deliberately does not perform a broad TypeScript rewrite. It establishes the prerequisites for that work:

- package-managed build tooling;
- a single browser composition entry;
- explicit environment boundaries;
- deterministic production output;
- source-map support;
- Vite/Rolldown chunk boundaries;
- build-time/static compatibility handling for embedded modules.

The recommended next phase is incremental TypeScript conversion starting with contracts, repositories, platform services, and configuration rather than UI implementation files.
