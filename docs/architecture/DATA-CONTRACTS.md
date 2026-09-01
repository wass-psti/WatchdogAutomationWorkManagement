# Data and Authorization Boundaries

## Browser-local data

Only shell/user-interface preferences that are safe to remain device-local use `wm.platform.*` local storage. Authentication tokens and derived identity are excluded from workspace backups.

## Supabase Auth

Identity and session lifecycle remain authoritative in Supabase Auth. The parent shell publishes only a sanitized module identity context to same-origin application iframes.

## Cloud module state

TimeTracker, FuelTrack+, and TradeLink continue to use the authenticated `WMModuleStore` adapter and their registered storage keys. The restructuring does not rename keys or create parallel local fallbacks.

## Work Boards

Board schema and collaboration state remain server-authoritative through protected PostgreSQL RPCs. RLS and RPC authorization continue to enforce membership and Owner/Editor/Viewer boundaries.

## Item files

Files remain in the private `work-board-files` Supabase Storage bucket. Temporary signed links are created only after authenticated access. Metadata remains in Work Board tables.

## Migration policy

v1.22.0 requires no database migration. It is an application architecture/runtime restructuring over the v1.21.6 schema. Existing deployments must already have the migrations required by the features they use, through `v1.21.6-item-workspace.sql` for the complete current feature set.

## v1.23.0 architecture-only change

v1.23.0 adds route, lifecycle, feature-registry, and Work Boards controller/state/schema boundaries only. It introduces no new database tables, RPCs, RLS policies, Storage buckets, module state keys, or browser persistence keys. Existing deployments require no Supabase migration beyond the migrations already required by their enabled feature set.


## v1.24.0 architecture-only change

v1.24.0 extracts Account/User Management controllers and Board List/Item Workspace presentation modules. It introduces no new database tables, RPCs, RLS policies, Storage buckets, module-state keys, or browser persistence keys. Existing deployments require no additional Supabase migration.


## v1.25.0 architecture-only change

v1.25.0 extracts Authentication and Settings route controllers plus Work Boards Table/Kanban presentation, generic board dialogs, and column/cell workflows. It introduces no new database tables, RPCs, RLS policies, Storage buckets/policies, module-state keys, authentication schema, or browser persistence keys. Existing deployments require no additional Supabase migration.
