# Architecture Phase Two — v1.23.0

## Completed in this phase

- Manifest-backed runtime feature registry.
- Central route controller for route dispatch and authentication gates.
- Explicit browser application-lifecycle installer/disposer.
- Feature lifecycle transitions on route-owner changes.
- Work Boards controller/view/service injection boundary.
- Shared Work Boards schema metadata/default naming.
- Shared Work Boards view-state factory/reset logic.
- Work Boards async/pending-write cleanup when leaving the feature.
- Runtime/cache manifest registration for every new architecture asset.

## Preserved contracts

- Supabase Auth/session behavior.
- Global RBAC and user-management authorization.
- Work Board RPC names and payloads.
- Board RLS and private Storage policies.
- Item Updates/Files/Activity persistence.
- TimeTracker/FuelTrack+/TradeLink module startup and cloud data.
- Application routes and deep links.
- Backup/recovery keys and browser preference keys.
- Zero-build static-host deployment model.

## Next decomposition targets

1. Extract account and user-management controllers/views from `app.js`.
2. Split board list, table/Kanban workspace, item workspace, and column workflows into smaller view modules.
3. Introduce scoped event controllers for shell and board actions instead of progressively growing delegated listener blocks.
4. Preserve compatibility facades until all regression suites consume the new feature boundaries directly.
