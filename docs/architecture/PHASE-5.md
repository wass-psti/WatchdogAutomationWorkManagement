# Architecture Phase Five — v1.26.0

## Scope

Phase Five completes the planned shell/Work Boards decomposition identified after v1.25.0. It extracts the Home/Application Launcher and global command palette from the shell, introduces a formal command registry, moves the remaining group/item/member/activity Board workflows into controllers, and extracts Board workspace header/control/cell presentation.

This is a client/runtime restructuring release. Existing Supabase tables, RPC signatures, RLS policies, Storage policies, module-state keys, authentication records, and browser preference keys remain unchanged.

## Home/Application Launcher feature

`assets/js/features/home/index.ts` now owns:

- module launcher presentation;
- launcher search state;
- favorites-only filtering;
- favorite mutations;
- recent-module presentation and updates;
- module availability/access presentation;
- install-app affordance;
- keyboard activation for application cards;
- cross-tab preference synchronization;
- launcher filter reset behavior.

The `#/` route is now owned by the `home` feature rather than the generic shell. The shell retains only shared chrome, route dispatch, module iframe hosting, and generic application lifecycle behavior.

## Command registry and palette

The command system is split into:

- `features/commands/command-registry.js`: duplicate-safe command registration, visibility predicates, lookup, execution, and read-only snapshots;
- `features/commands/index.js`: palette presentation, query/filter state, keyboard navigation, focus restoration, and built-in command registration.

Commands include accessible applications, Boards, Settings, authorized User Management, Account/sign-in, and workspace backup export. Module commands derive from the authoritative module registry and use the existing authorization boundary.

The shell no longer owns command selection state, command result arrays, palette markup, query filtering, focus restoration, or keyboard traversal.

## Board workflow controllers

The following controllers were added:

- `controllers/group-workflows.js`: group create/rename/delete, including destructive confirmation;
- `controllers/item-workflows.js`: item create/edit/archive/restore and base item validation;
- `controllers/member-workflows.js`: membership add/remove, owner protection presentation, and modal lifecycle-safe refresh;
- `controllers/activity-workflows.js`: immediate loading feedback, board activity presentation, and stale-request invalidation.

Board feature deactivation resets each workflow controller before closing dialogs. This prevents stale asynchronous activity or membership work from surviving route changes.

## Board workspace presentation extraction

`views/board-workspace-view.js` now owns:

- board detail header/action markup;
- Table/Kanban control bar markup;
- item-row composition;
- column-header/context-menu composition.

`boards-ui.js` retains interaction wiring and service orchestration but no longer contains the large workspace presentation templates directly.

## Reliability refinements

Phase Five adds or preserves these safeguards:

1. Home filter/favorite state is feature-owned and can be reset without mutating shell globals.
2. Command registration rejects duplicates and commands may expose runtime visibility predicates.
3. Command palette focus is restored only when the previously focused element is still connected.
4. Board activity loads show immediate feedback and reject responses after feature teardown or board changes.
5. Member removal closes through the shared dialog controller rather than removing modal DOM directly, preserving focus restoration and dialog bookkeeping.
6. Item archive adds an explicit destructive confirmation while restore remains direct.
7. All new Board workflow controllers participate in feature teardown.

## Compatibility strategy

No established routes, module IDs, Supabase contracts, board data, item data, attendance data, FuelTrack+ data, TradeLink data, or private file policies are changed.

`assets/js/app.ts` and `assets/js/boards-ui.ts` remain compatibility/orchestration boundaries but are substantially narrower than in v1.25.0.

## Remaining optional targets

The planned shell and Work Boards restructuring is now substantially complete. Further work is optional and should be justified by concrete maintenance or feature needs. Reasonable future targets are:

1. domain-internal decomposition of TimeTracker, FuelTrack+, and TradeLink;
2. further extraction of low-level Board drag/drop and item-workspace interaction bindings if those areas are actively modified;
3. automated browser-level integration tests around route transitions, modal focus, and iframe lifecycle;
4. accessibility and performance profiling driven by observed issues rather than speculative rewrites.
