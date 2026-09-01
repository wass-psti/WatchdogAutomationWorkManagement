# Supabase setup — Work Management v1.17.0

Work Management is account-based and requires Supabase Auth plus the Work Management PostgreSQL schema.

## New Supabase project

1. Create a Supabase project.
2. Run the complete `schema.sql` in SQL Editor.
3. Enable Email/Password authentication.
4. Configure Authentication → URL Configuration with the exact GitHub Pages Site URL and redirect URL.
5. Copy only the project URL and **publishable** key (`sb_publishable_...`) into `config/backend-config.js`. Never put secret/service-role credentials in GitHub Pages.
6. Keep `accountBased: true`, `enabled: true`, and `requireAuthentication: true`.
7. Register accounts through Work Management. New accounts receive the **Employee** platform role automatically.

The account `lmsenagan@watchdogautomation.com.ph` is bootstrapped server-side as **Admin/General Manager**. The schema also protects that bootstrap administrator from being demoted or disabled through the normal administration RPC.

## Upgrade an existing Work Management Supabase project

If the project is already on the v1.14.2 RBAC schema, run:

`supabase/migrations/v1.15.0-cloud-module-state.sql`

This creates authenticated cloud persistence for TimeTracker, FuelTrack+, and TradeLink. The module-state table is not directly writable by browser clients; access is brokered through security-definer RPCs that verify the authenticated user has module access.

For older databases, first apply the RBAC reconciliation below.

Run the idempotent reconciliation migration:

`supabase/migrations/v1.14.2-rbac-reconciliation.sql`

It repairs the legacy CHECK-constraint ordering problem, converts old platform-role values, promotes the known bootstrap administrator, synchronizes module-role mappings, installs the protected user-directory/role-management RPCs, and installs `claim_bootstrap_admin()` for authenticated server-side recovery of the fixed bootstrap identity.

If upgrading directly from a v1.12.x database that does not yet contain the v1.13 account architecture, run `supabase/migrations/v1.13.0-account-architecture.sql` first, then run the v1.14.2 reconciliation migration, followed by `v1.15.0-cloud-module-state.sql`, then `v1.16.0-shared-data-architecture.sql`, then `v1.17.0-state-contract-and-activity.sql`.


## v1.17 upgrade

After v1.16.0, run `supabase/migrations/v1.17.0-state-contract-and-activity.sql`. This replaces regex-only state-key validation with an explicit policy registry, adds server data-integrity invariants and distributed operation locks, and adds the append-only FuelTrack+ Activity stream plus atomic request/activity commits. Workspace Backup v3 imports Activity through a protected Admin-only RPC. Run the migration before deploying the v1.17 static files.

## Supported platform roles

- `admin_general_manager` — **Admin/General Manager**
- `hr` — **HR**
- `supervisor` — **Supervisor**
- `employee` — **Employee** (default)

The platform role is authoritative. PostgreSQL synchronizes the corresponding module roles into `module_role_assignments` so the existing TimeTracker, FuelTrack+, and TradeLink authorization bridges continue to receive compatible role values.

## Security model

- Supabase Auth owns credentials and sessions.
- PostgreSQL/RLS is the server-side authorization boundary.
- The static client contains only public Supabase configuration.
- Admin directory reads use `list_user_directory()`.
- Admin role/status changes use `admin_set_user_access()`.
- The fixed bootstrap account can repair a partially migrated server-side role only through `claim_bootstrap_admin()`; that RPC verifies `auth.uid()` against the persisted bootstrap email and accepts no caller-supplied role.
- The RPC prevents losing the last active administrator and protects the bootstrap administrator.
- Normal users can update only their own display name through `update_own_profile()`.
- Work Management backups exclude `wm.platform.auth.*` and `wm.platform.identity.*`.

## Email rate limiting and SMTP

Work Management prevents duplicate registration submissions, enforces a local persisted cooldown for signup/resend operations, and does not automatically retry rate-limited email-producing Auth calls. A client-side cooldown cannot increase Supabase's server-side email quota.

For production use, configure **Authentication → Emails → SMTP Settings** with your own SMTP provider. The built-in Supabase mailer is intended for low-volume testing and can reach its project-wide email quota quickly. Also review **Authentication → Rate Limits** in the Supabase dashboard.

## Email confirmation

A row in `public.profiles` confirms that registration reached the database trigger; it does not by itself prove email verification is complete. Inspect **Authentication → Users** when diagnosing `Email not confirmed`.

## Work Boards (v1.19.0)

Run `migrations/v1.19.0-work-boards.sql` after the v1.18 migration for existing deployments. It creates normalized workspace boards, members, groups, items and append-only board events with protected RPC access. The browser receives no direct table privileges; all board operations are authorized from `auth.uid()` and workspace/board membership on the database side.


## Flexible board columns (v1.20.0)

Run `migrations/v1.20.0-board-columns.sql` after the v1.19 Work Boards migration. It introduces normalized board column definitions and typed per-item custom values, migrates existing boards to core column metadata, adds protected schema/cell RPCs, and updates board creation/duplication so schemas and values remain consistent. Core columns can be renamed/hidden (except Item visibility) but cannot be deleted; custom columns support server-side type and option validation.


## Board productivity and column context workflows (v1.21.0)

Run `migrations/v1.21.0-board-productivity.sql` after v1.20.0. The migration adds per-member board view preferences plus protected RPCs for inserting a column at a specific position, duplicating a column with optional values, and safely changing custom column types. Board filters, sorting, and wrap preferences remain account-specific while work items and schema stay shared. Core column types remain immutable and incompatible custom type changes require explicit value clearing.


## v1.21.6 item workspace
Run `migrations/v1.21.6-item-workspace.sql` after v1.21.5. It adds persistent item Updates, private Files via the `work-board-files` Storage bucket, item-scoped Activity, server-authorized collaboration RPCs, and PostgREST schema refresh.


## v1.31.0 interactive board engine

For an existing deployment that already includes the Work Boards/item-workspace migrations, run `migrations/v1.31.0-board-interaction-engine.sql` before deploying the v1.31 client. It extends validated per-member board preferences with persistent column widths and collapsed groups, normalizes item/group ordering, adds protected item duplication/permanent deletion and group-reorder RPCs, permits removal of legacy linked column definitions, publishes backend capability version `1.31.0`, and requests a PostgREST schema reload. The migration does not weaken the existing board membership/access checks.

## Work Boards configurable Status labels (v1.34.0)

For an existing deployment already on the v1.33.0 grouped Board Sheet backend, run `migrations/v1.34.0-configurable-status-labels.sql` before deploying the v1.34 client. The migration removes the legacy fixed Status CHECK constraint, converts Status column configuration to stable label objects, migrates legacy custom Status option values from visible text to stable IDs, installs the protected `wm_set_board_status_labels` RPC, and updates Board item/cell validation so Status labels can be renamed, recolored, reordered, activated/deactivated, added, or safely removed without coupling persistence to display text. Deleting a label clears references to the removed ID; all existing board membership/edit authorization checks remain server-enforced. Fresh deployments can use the consolidated `schema.sql`.



## v1.41.0 transactional backup/restore

For an existing deployment already on the configurable-Status backend, run `migrations/v1.41.0-transactional-backup-restore.sql` before using Workspace Backup v4 restore. It installs the server-side transactional restore RPC so a failed restore cannot leave the workspace partially applied. Fresh deployments can use the consolidated `schema.sql`.

## v1.43.2 production hardening

Before deploying v1.43.2 to an existing Supabase project, run `migrations/v1.43.0-production-hardening.sql` after the v1.41.0 migration. This migration closes the remaining disabled-account Board access gap by requiring an **active profile** at the authoritative workspace and Board access helpers, in addition to active workspace membership. A disabled account with an otherwise unexpired Supabase JWT therefore cannot continue invoking protected Board RPCs directly. The migration preserves the existing role/capability model and refreshes the PostgREST schema cache. Fresh deployments should use the current consolidated `schema.sql`, which contains the same enforcement.

For production validation, test both UI revocation and direct RPC denial with an account whose status is changed to `disabled` from a second authenticated administrator session. The browser is expected to clear cached server state and detach any now-forbidden embedded module, while PostgreSQL remains the final enforcement boundary.
