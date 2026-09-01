# Work Boards Overhaul — v1.32.0

## Scope

v1.32.0 begins the section-by-section application overhaul with Work Boards. The release is intentionally client-side and keeps the v1.31.0 Board database interaction contract unchanged.

## Problems reproduced

- Three-dot contextual menus could fail to appear reliably because row/group/board menus depended on overflow-sensitive `<details>` geometry and separate positioning paths.
- Routine Board state changes replaced large portions of the Board DOM, causing toolbar/header remounts, focus loss, repeated motion reveals, and visible bouncing.
- Opening Item Details reserved desktop padding and shifted the working Board horizontally.
- Kanban lanes used a comparatively short fixed minimum and did not behave like a full working canvas.
- The Add Item modal exposed status/assignee/due/notes but the create path persisted only the item title.

## Unified floating menu controller

`assets/js/features/boards/controllers/board-menu-controller.ts` owns Board, group, row, and board-card contextual menus. Menu content is rendered from local `<template>` elements into one viewport-aware fixed menu inside the feature root. The controller owns outside-click dismissal, Escape, arrow-key traversal, Home/End, resize repositioning, scroll cleanup, focus restoration, and `aria-expanded`. This removes reliance on the table overflow container for menu visibility.

## Stable workspace shell

The Board detail route now creates persistent hosts for header, controls, view content, selection toolbar, and Item Workspace. `renderBoardData()` patches a host only when its markup actually changes. Search rerenders only the view region, and horizontal table/Kanban scroll geometry is captured/restored around view replacement.

The Board root is marked `data-wm-motion-static="true"`. The shared motion runtime skips reveal binding beneath that boundary so cell edits, selection changes, filters, and data refreshes do not replay entrance motion. View switching uses only a restrained opacity response.

## Kanban workspace

Kanban now uses a full-height lane canvas with sticky lane headers, improved empty states, horizontal scroll containment/snap behavior, and per-lane `+ Add` actions. The Add Item workflow accepts lane defaults and persists the selected status, assignee, due date, and notes after item creation.

## Layout stability

The Item Workspace drawer overlays the Board on wide screens instead of changing Board padding. Board toolbar controls are grouped into stable primary/query/secondary regions and controls that previously appeared/disappeared (such as Clear view) retain a stable footprint through disabled state.

## Persistence

No v1.32.0 Supabase migration is required. v1.32.0 remains compatible with `v1.31.0-board-interaction-engine.sql`.
