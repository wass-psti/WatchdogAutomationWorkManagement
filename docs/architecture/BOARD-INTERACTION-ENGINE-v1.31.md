# Work Boards interaction engine — v1.31.0

v1.31.0 turns the Work Boards Table view into an interaction-first workspace while retaining the existing authenticated Supabase/RPC boundary.

## Interaction ownership

The board feature now separates table mechanics into explicit controllers:

- `history-controller.js` — bounded session undo/redo for reversible board interactions.
- `selection-controller.js` — row/range selection and bulk actions.
- `inline-edit-controller.js` — optimistic typed-cell and item-title editing with rollback/validation.
- `column-resize-controller.js` — pointer-driven persistent column sizing.
- `structure-drag-controller.js` — optimistic column/group ordering.
- `drag-drop-controller.js` — item row ordering, cross-group movement and Kanban movement.

Existing workflow controllers continue to own groups, items, columns, members, activity, dialogs and Item Workspace behavior.

## Table behavior

The Item name is treated as row identity rather than a mandatory schema column. Boards therefore remain valid with zero configured columns. The table can still create and manipulate items while optional columns are added later.

Table interaction includes:

- inline item creation with Enter / Shift+Enter continuation;
- inline item-title editing;
- typed inline cell editors;
- row/range selection with a floating bulk toolbar;
- row reordering and cross-group drag/drop;
- group collapse and reorder;
- column reorder and resize;
- anchored searchable quick column picker;
- keyboard cell navigation;
- session undo/redo shortcuts;
- item context actions and details workspace.

## Typed cell engine

The existing PostgreSQL type validation remains authoritative. The client adds immediate editor-specific validation and optimistic feedback for text, long text, number, status, dropdown, people, date, checkbox, timeline, email and URL columns. Failed writes roll the optimistic state back.

## Persistent view configuration

Per-member board preferences now retain filters, sorts, wrapping, column widths, Item-name width and collapsed groups. Invalid/stale preference identifiers are sanitized server-side.

## Server changes

`v1.31.0-board-interaction-engine.sql` adds or replaces protected RPC behavior for:

- robust item positioning;
- group positioning;
- item duplication;
- permanent item deletion;
- deletion of legacy linked column definitions;
- expanded validated board preferences;
- backend capability reporting.

Ordering mutations use a board-scoped transaction advisory lock to reduce concurrent position collisions. Existing board-access checks remain server-authoritative.

## Undo/redo boundary

Undo/redo is deliberately session-scoped and records reversible actions performed through the current client. It does not attempt to reverse destructive permanent deletes or changes made by another collaborator. Every undo/redo operation persists through the normal protected RPCs.

## Accessibility and stability

- Table cells expose keyboard focus and arrow/Home/End movement.
- Enter activates the focused editor.
- Selection remains keyboard-operable.
- Drag/drop has an `aria-live` status path, while deterministic edit dialogs remain available for keyboard movement.
- Column resizing and popovers clean up event listeners on feature teardown.
- Reduced-motion behavior is inherited from the application motion system.
