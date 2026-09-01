# Item Workspace tab-transition stability — v1.32.4

## Problem

Updates, Files, and Activity shared one fixed drawer, but every tab change rebuilt the entire Item Workspace markup. That remounted the drawer, header, tablist, moving indicator, and scroll viewport. The result was visible bouncing, repeated drawer entrance motion, scroll resets, and race-prone transitions during rapid switching.

## Architecture change

`item-panel-renderer.js` now owns Item Workspace DOM reconciliation. A new item still mounts the complete drawer once, but same-item updates preserve the existing shell and synchronize only the pieces that can legitimately change.

Persistent nodes:

- drawer/scrim
- item header
- tablist and shared active indicator
- tab scroll viewport

Replaceable node:

- `.item-panel-tab-stage`

## Transition rules

- Only a genuine tab change receives the short 150 ms internal opacity/translate transition.
- Same-tab refreshes replace only the internal stage and do not replay choreography.
- Re-clicking the active tab does not rerender.
- Starting another tab transition cancels the previous Web Animation before replacing content.
- Reduced-motion mode skips the internal animation entirely.
- Each tab remembers its own scroll position and restores it when revisited.
- The scroll viewport uses stable scrollbar geometry and disables scroll anchoring to avoid unexpected vertical displacement.

## Accessibility

The existing dialog/tab semantics remain unchanged. Arrow Left/Right and Home/End now move among the three tabs in addition to existing pointer/keyboard activation. `prefers-reduced-motion` remains authoritative.

## Backend

No database or RPC contract changed. v1.32.4 remains compatible with the v1.31.0 Board interaction migration.
## Overlay layering correction

The Item Workspace action menu no longer renders inside the header's local `<details>` stacking context. The trigger now supplies its actions through the unified Board menu template contract, and `board-menu-controller.js` renders the floating surface into a dedicated `.board-overlay-layer` sibling inside the motion-static Board root. This places the popover above the drawer/header/tab layers without depending on drawer overflow or an arbitrary page-global z-index.

The overlay layer is pointer-transparent except for the menu itself. Existing viewport collision handling, resize positioning, outside-click dismissal, Escape/arrow/Home/End keyboard handling, `aria-expanded`, permissions, and action delegation are retained. Modals continue to close the menu before opening their own dialog flow.

