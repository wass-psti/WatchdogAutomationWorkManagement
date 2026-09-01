# Work Management App v1.43.2 — Embedded Runtime Production Hotfix

## Scope

v1.43.2 addresses the production-only failure where TimeTracker, FuelTrack+, and TradeLink iframe shells loaded from GitHub Pages but their application runtime did not initialize.

The copied embedded HTML imports the named `startEmbeddedModule` API from the stable Vite production entry `assets/js/runtime/module-bootstrap.js`. The production bundler now preserves that entry signature explicitly, and release verification executes the emitted entry rather than merely checking that the file exists.

## Regression protection

- production bootstrap entry must export `startEmbeddedModule`;
- all three copied embedded pages are browser-smoked in Vite preview;
- a direct embedded page must reach an explicit recoverable authentication/startup state instead of remaining blank;
- GitHub Pages continues to deploy only `dist/`;
- no Supabase migration is required.

## Deployment

The included `.github/workflows/deploy-pages.yml` runs the complete release gate and uploads only `./dist` to GitHub Pages. The workflow validates the v1.43.2 service-worker marker before publishing.
