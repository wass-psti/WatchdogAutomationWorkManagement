# FuelTrack+ v3.17.0

## Work Management v1.27.0 internal domain boundary

FuelTrack+ now loads `domain-config.js` before the shared module bootstrap. Stable role/permission definitions, request transitions, vehicle/container directories, route/priority catalogs, cloud-state keys, refresh policy, and initial-state construction live in `WMFuelTrackDomain`; the established runtime continues to own authenticated request workflows, approvals, Activity, refueling completion, role behavior, and cloud synchronization. No FuelTrack+ data contract changes are required.


FuelTrack+ is the authenticated fuel-request operations module integrated into Work Management. The v3.17 business workflows and UI are preserved, while persistence, identity, authorization, synchronization, and Activity auditing are provided by the active Work Management/Supabase environment.

## Modules

1. Dashboard
2. Analytics
3. All Requests
4. New Fuel Request
5. Approvals
6. LightFuels
7. Activity
8. Roles (Admin-only, cloud directory view)

## Active-environment behavior

- Requires an authenticated Work Management session and an enabled FuelTrack+ module assignment.
- Uses shared Supabase workspace data for requests and inventory.
- Uses per-account Supabase state for preferences and Activity filters.
- Uses Work Management module assignments as the authoritative role source; no synthetic Local Admin or local role directory is created.
- Uses an append-only server Activity stream with server-authored actor identity/timestamps.
- Critical request state changes and their Activity events are committed atomically.
- Uses optimistic revisions and explicit conflict recovery rather than blind last-writer-wins updates.
- Synchronizes committed state on periodic refresh, tab visibility, focus, and reconnect.
- Contains no `localStorage`, `sessionStorage`, localhost endpoint, local-only service, or standalone-runtime fallback.
- Does not receive Supabase tokens or privileged database credentials; calls are brokered by the authenticated parent shell.

## Access model

- `Admin` — full operational access, Activity, exports, and cloud role-directory visibility.
- `Pump Attendant` — operational fulfillment permissions defined by the existing FuelTrack+ RBAC table.
- `User` — least-privilege request access, restricted to server-authorized records.

## Activity

Activity is immutable operational audit history. Use Refresh/Retry to recover from a transient stream error. Older events are paged from Supabase instead of being destructively capped in the browser. Search/filter state is saved per account.

## Deployment

FuelTrack+ is not intended to be opened as a standalone local application. Deploy it as part of Work Management and apply the current Supabase migrations first. See `INTEGRATION.md` and the root `README.md`.
