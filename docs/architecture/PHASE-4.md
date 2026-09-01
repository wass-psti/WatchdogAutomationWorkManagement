# Architecture Phase Four — v1.25.0

## Scope

Phase Four continues the progressive restructuring by moving the remaining authentication and Settings route state out of the shell, extracting Table/Kanban presentation, and moving the largest column/modal workflows out of the Work Boards compatibility view.

This release changes client/runtime architecture only. It does not add or alter Supabase tables, RPC signatures, RLS policies, Storage policies, module state keys, or browser persistence keys.

## Authentication controller extraction

`assets/js/features/auth/index.ts` now owns the complete authentication route experience on top of the existing `core/auth.js` authority:

- Login rendering and transient busy/error state;
- Registration rendering and safe non-password draft preservation;
- verification/recovery rendering;
- resend/signup cooldown presentation;
- return-route consumption;
- login/register/resend/verification actions;
- route-aware asynchronous completion guards;
- feature activation/deactivation and cooldown cleanup.

`app.js` now delegates authentication actions/forms/inputs to the feature. Supabase Auth, database profiles, role mappings, and registration throttling remain unchanged.

## Settings controller extraction

`assets/js/features/settings/index.ts` now owns:

- theme mutation;
- shell density mutation;
- storage-health queries and persistence requests;
- module compatibility verification;
- platform/auth diagnostics;
- backup export and validated restore;
- shell-preference reset;
- Settings busy/diagnostic/compatibility state;
- route-aware rendering and async completion guards.

The shell keeps only launcher-specific preference state needed to render Home and receives explicit preference-change callbacks from Settings.

## Work Boards Table/Kanban view extraction

Two dedicated presentation modules were introduced:

- `views/table-view.js`
  - schema-empty state;
  - group/table structure;
  - filtered/no-item states;
  - add-item/add-group affordances;
  - sorted item-row composition through injected renderers.

- `views/kanban-view.js`
  - status lanes;
  - item cards;
  - assignee/group/due context;
  - drag/drop-compatible data attributes;
  - item-detail/edit/archive actions.

The compatibility view continues to own interaction orchestration and injects authorization/state/render helpers into these presentation modules.

## Board dialog controller

`controllers/dialog-controller.js` centralizes generic board modal behavior:

- focus capture/restoration;
- initial focus;
- focus trapping;
- Escape/backdrop/cancel close behavior;
- submit busy state;
- persistent inline error feedback;
- toast integration;
- close-all lifecycle cleanup.

This prevents each board workflow from reimplementing modal mechanics and ensures Board feature teardown can close all owned overlays reliably.

## Column workflow controller

`controllers/column-workflows.js` now owns the largest schema/cell dialog workflows:

- column filter;
- duplicate column;
- searchable column-type picker;
- create/edit column;
- change type with data-loss safeguards;
- Manage Columns;
- reorder columns;
- delete column and preference cleanup;
- typed cell editor and value normalization.

Picker context is controller-local rather than stored in long-lived board view state. `board-state.js` therefore no longer carries transient `addColumnPosition` or `changeTypeColumn` fields.

## Lifecycle refinements

Phase Four also closes two subtle asynchronous/listener gaps:

1. Item Workspace loads use their own epoch. Rapidly opening Item A then Item B, or closing the panel while A is still loading, can no longer allow the stale A response to overwrite the current panel.
2. Board resize listeners used for floating column menus are explicitly tracked and disposed during rerender/deactivation rather than waiting for a later browser resize to discover a detached root.

Settings storage-health requests also reject stale epoch results after feature deactivation.

## Compatibility strategy

`assets/js/app.ts` and `assets/js/boards-ui.ts` remain compatibility/orchestration boundaries. They are materially smaller, but established behavior is preserved while responsibilities move outward incrementally.

No backend fallback, alternate persistence adapter, or duplicate data model was introduced.

## Remaining safe targets

The remaining high-value restructuring work is narrower than in previous phases:

1. Home/application launcher presentation and state controller;
2. command-palette controller and command registry;
3. Work Boards group/item/member/activity workflow controllers;
4. finer extraction of column-header/cell rendering and board interaction bindings;
5. optional domain-internal decomposition of TimeTracker, FuelTrack+, and TradeLink after shell/Boards work is stable.

These are continuation/refinement targets rather than prerequisites for the current application to function.
