# Board Sheet Architecture — v1.33.0

The v1.33.0 Board Table redesign keeps the existing Work Boards domain model and controllers while changing the presentation into a grouped spreadsheet-like working surface.

## Principles

- **Groups remain first-class sections.** Each group owns collapse state, reorder behavior, contextual actions, item creation, and a persisted accent color.
- **The schema remains shared.** Every expanded group renders the same visible column schema and width preferences. Horizontal scrolling is synchronized across group tables to prevent header/value desynchronization.
- **Identity remains sticky.** Selection, drag context, the item-name column, and row actions remain reachable during horizontal scrolling where the viewport permits it.
- **Menus stay outside clipping geometry.** Existing floating-menu infrastructure continues to portal board/group/item/column menus into the Board overlay layer.
- **Updates are scoped.** Cell edits, group collapse, sorting, creation, and contextual actions update the smallest relevant surface and preserve board geometry where possible.
- **No reference implementation is embedded.** The external Boards markup supplied as design reference is not copied into the runtime; the application retains its own classes, renderers, tokens, and interaction architecture.

## New persistence

`work_board_groups.accent_color` stores a validated six-digit hex accent. `wm_set_board_group_accent(uuid,text)` enforces Board edit permission and logs the change.

Existing installations apply `supabase/migrations/v1.33.0-board-sheet-groups.sql`.
