# FuelTrack+ v3.17.0 — Work Management v1.17 Integration

## Runtime boundary

FuelTrack+ runs only through `apps/fueltrack-plus/runtime.html` inside an authenticated Work Management session. Work Management provides the token-free identity bridge and authenticated Supabase data broker; FuelTrack+ never receives access/refresh tokens, database credentials, or service-role keys.

The active integration assets are `app.v3.17.0-wm6.js` and `styles.v3.17.0-wm6.css`. The original v3.17.0 files remain in the module directory for source provenance, but the Work Management runtime is authoritative for deployed behavior.

## Authoritative data

Operational state is workspace-scoped in Supabase:

- `fueltrackplus.requests.v3` — shared request registry.
- `fueltrackplus.inventory.v3` — shared inventory state.
- `fueltrackplus.preferences.v3` — per-account preferences and Activity filters.

`fueltrackplus.activity.v3` is retained only as a legacy migration/backup key and is no longer writable. FuelTrack+ Activity is an append-only PostgreSQL audit stream in `module_activity_events`.

The module-local `fueltrackplus.userroles.v3` directory is no longer authoritative. Work Management/Supabase module assignments provide the effective `Admin`, `Pump Attendant`, or `User` role, and the Roles screen is a read-only view of that cloud directory.

## Activity architecture

FuelTrack+ Activity is operational audit history, not replaceable client state.

- Actor user ID, email, display name, module role, sequence, and timestamp are server-authored.
- Request creation/submission, lifecycle transitions, refueling completion, and deletion use `commit_fueltrack_requests_with_activity()` so request state and its Activity event commit in one PostgreSQL transaction.
- Event IDs make retries idempotent.
- Activity is paged from Supabase and can load older events without truncating history.
- Activity filters are per-account preferences and survive navigation/refresh/session restoration.
- Activity stream failures are isolated from the rest of FuelTrack+ and expose Refresh/Retry recovery controls.
- Workspace Backup v3 exports/imports Activity through protected Admin-only RPCs rather than rewriting the legacy aggregate key.

## Shared-data consistency

All shared writes use optimistic revisions. A stale request mutation receives `WM_STATE_CONFLICT`; the latest cloud revision is loaded instead of silently overwriting another user's work. Server invariants reject duplicate request IDs. Normal `User` accounts are restricted to their owned requests; broader workflows remain available only to the assigned Pump Attendant/Admin roles.

Work Management refreshes cloud state while the module is visible and on focus/reconnect, so authorized accounts on other browsers/devices receive committed changes without relying on browser storage.

## v1.17 database requirement

Existing deployments must run:

`supabase/migrations/v1.17.0-state-contract-and-activity.sql`

before deploying the v1.17 static files. This installs the state-key policy registry, revision-safe RPCs, data-integrity rules, distributed operation locks, append-only Activity stream, atomic request/activity commit, and backup Activity import.

## Work Management v1.18.0 Activity triage

The Activity audit stream remains append-only and server-authored. Work Management adds a separate per-user triage state (`fueltrackplus.activity.workspace.v1`) for Timeline/Archived organization, event selection, and reversible archive/restore actions. Archiving never changes or deletes `module_activity_events`; it only changes the authenticated user's Activity presentation. The state key is registered as user-scoped by `supabase/migrations/v1.18.0-activity-triage-workspace.sql`.
