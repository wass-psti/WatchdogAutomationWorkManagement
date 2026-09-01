# Architecture Phase Three — v1.24.0

## Scope

Phase Three removes two remaining shell-owned domain areas and begins splitting the large Work Boards presentation layer into focused, testable view modules.

The release is architecture-only from a data-contract perspective: no Supabase tables, RPCs, RLS policies, Storage rules, module state keys, or browser persistence keys are changed.

## Account feature extraction

`assets/js/features/account/index.ts` now owns:

- Account route rendering;
- profile mutation busy state;
- password-change workflow;
- local/global sign-out actions;
- access-context refresh;
- session-expiry presentation;
- module-access presentation;
- route-safe asynchronous rendering through lifecycle epochs.

The shell delegates account actions and forms to the feature rather than retaining `accountBusy`, account rendering helpers, and security/session mutation code in `app.js`.

The manifest now gives `#/account` its own `account` feature owner instead of grouping Account into the authentication route owner.

## User-management feature extraction

`assets/js/features/user-management/index.ts` now owns:

- administrator user-directory state;
- loading/error/retry state;
- directory search state;
- protected role/status mutations;
- per-user mutation busy state;
- route-safe list reloads;
- cached directory state across route transitions;
- activation/deactivation boundaries.

The shell now delegates user-directory click, input, and submit events to this controller. Server-side Supabase authorization remains authoritative.

## Authentication boundary refinement

The `auth` feature now owns only authentication lifecycle routes:

- login;
- registration;
- verification.

Account settings and administrator user management have independent manifest owners and runtime feature records.

## Work Boards view decomposition

Two presentation units were extracted from `assets/js/boards-ui.ts`:

- `views/board-list-view.js`
  - board tabs/toolbar;
  - board cards;
  - list loading/error/empty states;
  - archive/trash/restore action markup.

- `views/item-workspace-view.js`
  - Updates tab markup;
  - Files tab markup;
  - Activity tab markup;
  - item workspace header/tabs;
  - mention rendering;
  - attachment-size presentation.

The existing Boards interaction controller continues to own event handling, async data loading, authorization-aware actions, drag/drop, column workflows, and RPC/service calls. This keeps the extraction low-risk while meaningfully reducing presentation responsibility in the compatibility view.

## Manifest hardening

Application-manifest validation now rejects routes whose declared `owner` does not exist in the feature inventory. This catches route/feature drift before it becomes a runtime navigation failure.

## Lifecycle safety

Account and User Management now use route ownership and asynchronous epochs. If the user navigates away while an access refresh, directory load, or mutation is in progress, stale completion handlers do not repaint a different route.

## Remaining safe targets

The next decomposition targets are:

1. Table/Kanban Work Boards rendering;
2. board column/dialog workflows;
3. authentication form rendering/state extraction from the shell;
4. Settings controller extraction;
5. shell command/home presentation extraction.
