# Work Boards Stabilization — v1.31.1

## Scope

v1.31.1 is a client-side stabilization patch for the v1.31.0 Board interaction engine. The defects were reproduced from the supplied interaction recording and traced to shared interaction/view boundaries rather than patched at individual clicks.

## Recorded defects and root causes

### Row context-menu clipping

The row action menu lived inside `.board-table-scroll`, whose horizontal overflow clipped the absolutely positioned menu. On a wide board the menu could collapse into a long horizontal strip and remain visible while another cell editor opened.

The fix keeps the menu in its semantic row DOM but positions its popup with viewport-fixed coordinates. The Board controller repositions the popup against the summary anchor, closes it when scrolling or beginning an unrelated edit, closes sibling menus, and supports Escape dismissal. Selection, drag, Item identity, and action utility cells are sticky so the row controls remain reachable during horizontal scrolling.

### Long Text / Timeline persistence ambiguity

The anchored form editor previously provided little distinction between pending, failed, and committed persistence. More importantly, the delegated submit listener was resolving `event.currentTarget`, which is the popover listener container rather than the submitted `<form>`. That could prevent Long Text/Timeline submissions from reaching the persistence step reliably and made the typed value appear to disappear.

Long Text and Timeline now use a recoverable submit lifecycle:

1. keep the editor mounted;
2. publish `aria-busy=true` and `Saving…`;
3. perform the existing optimistic cell write through `api.setCell`;
4. close and rerender only after success;
5. on failure, roll state back, keep the user's form draft intact, re-enable controls, and show a persistent inline retry explanation.

No local persistence layer is introduced; Supabase remains authoritative.

### Item Activity noise

The Item Workspace exposed repeated generic `item.cell_updated` audit events. The event payload already carries `column_id` and `column_name`, so the view now translates those events to field-level labels and compacts consecutive changes to the same field by the same actor within a short window. Raw internal event codes are not shown to users.

## Additional refinements

- Detail-open rows use a contextual violet highlight rather than a state that could be read as an error.
- Wide-board scrollbars are visually quieter while remaining discoverable.
- Item Activity count badges expose compacted event counts.
- Mobile continues to disable desktop sticky utility-cell geometry.

## Persistence contract

No v1.31.1 database migration is required. v1.31.1 remains compatible with the v1.31.0 Board database contract and requires the existing `v1.31.0-board-interaction-engine.sql` migration on deployments that have not already applied it.

No tables, RPC signatures, RLS policies, Storage policies, Board preference payloads, or role rules change in this patch.

## Regression protection

`verify-v1311-board-stabilization.mjs` protects the client-side source boundaries. The real Chromium gate additionally verifies:

- row menu popup fixed positioning outside table clipping;
- sticky row action geometry;
- visible Long Text pending state;
- failed Long Text draft retention and retry feedback;
- Item Activity field labels and compaction;
- absence of raw internal activity codes.
