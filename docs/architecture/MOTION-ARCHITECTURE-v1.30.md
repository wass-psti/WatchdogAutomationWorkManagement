# Motion Architecture — v1.30.0

## Objective

v1.30.0 turns motion from a final decorative stylesheet into an explicit interaction architecture. The release keeps the established Architecture Version 7 ownership model and all business/data contracts intact while introducing shared choreography, stable-shell navigation, reusable motion tokens, and lifecycle-aware transitions across the Work Management shell, Work Boards, TimeTracker, FuelTrack+, and TradeLink.

## Core rules

1. **Persistent chrome does not animate.** Sidebar, workspace shell, persistent top bars, and module chrome remain mounted and are never scaled during route transitions.
2. **Route motion is content-scoped.** Only the replaceable route-owned content region can perform an exit/entry transition.
3. **State refreshes do not replay route transitions.** Search, filtering, data refreshes, board preference changes, and other same-route updates remain immediate.
4. **Transform/opacity first.** Motion favors GPU-friendly transform and opacity. No application-wide layout-measurement loop is introduced.
5. **Motion is optional.** All functionality remains available when `prefers-reduced-motion: reduce` is active or when the motion runtime is unavailable.
6. **Business state remains authoritative.** Motion code never owns routing, authentication, permissions, persistence, RPC behavior, board schemas, or embedded-domain state.

## Shared choreography tokens

`assets/css/foundation/tokens.css` now defines one reusable duration/easing/distance vocabulary:

- micro: 90 ms
- fast: 140 ms
- standard: 220 ms
- deliberate: 320 ms
- view: 420 ms
- expressive: 560 ms
- standard, enter, exit, and emphasized easing curves
- XS/SM/MD/LG travel distances
- press scale, hover lift, blur, and stagger limits

`assets/css/motion-design.css` consumes these tokens across all four UI surfaces rather than allowing every component to invent its own animation timing.

## Motion orchestrator

`assets/js/runtime/motion-orchestrator.ts` provides the shared choreography runtime. It is deliberately independent from the business/runtime feature registry.

Responsibilities:

- publish full/reduced motion and coarse/fine input modes;
- perform race-safe content exits through `exitThen()`;
- cancel stale transition epochs;
- provide lightweight acknowledgement pulses;
- generate and move active-navigation indicators;
- rebind indicators when persistent navigation containers replace their children;
- mark dialogs, menus, popovers, and drawers for consistent entrance/exit styling;
- enhance dynamically inserted UI through MutationObserver;
- refresh indicator geometry through ResizeObserver without continuous polling.

The orchestrator explicitly cancels fill-forwards Web Animations before committing a view update so a persistent `#main` container can never remain faded or translated after a route transition.

## Stable shell

The Work Management shell now preserves the existing sidebar, workspace, topbar, and main containers between compatible routes. The renderer patches topbar/main contents rather than remounting the full shell. This prevents page-wide shrink, flash, and navigation displacement.

The shell's route key is based on the actual hash, so Board list → Board detail can receive a content transition while same-route data refreshes do not replay navigation choreography.

## Embedded applications

### TimeTracker

The application shell, topbar, main region, footer, and modal host remain mounted across tab changes. Navigation commits are content-scoped through the shared motion orchestrator; `document.startViewTransition()` is intentionally not used because it can capture and transform persistent chrome. Custom selects, cards, Clock controls, Calendar, Records, RBAC, OT, and modal surfaces share the same motion grammar.

### FuelTrack+

The persistent sidebar/topbar remain stable. A route change can soften only the first route-content node before the renderer commits the next view. Same-route cloud refreshes remain immediate. Light and Dark Modes share identical choreography while retaining theme-specific surfaces and contrast.

### TradeLink

The persistent topbar, main-view container, company-panel host, and modal host remain mounted. Primary tab changes transition only the current main-view content. Document tabs, company panels, form sections, menus, dialogs, and repeated item rows use the shared motion tokens without modifying document workflow logic.

## Navigation indicators

Supported primary/secondary navigation groups receive a generated `.wm-motion-indicator`. The indicator moves between active items rather than causing the navigation container itself to animate. The runtime supports both horizontal underline and vertical rail modes.

Because several applications preserve the navigation container but replace its children, the indicator binding detects a removed generated indicator and recreates it automatically.

## Overlays and feedback

Dialogs, menus, popovers, drawers, validation states, busy controls, toasts, empty states, lists, tables, and common buttons now share consistent motion primitives. Work Board dialogs use a short exit animation before teardown while retaining focus restoration and modal registry cleanup.

Native `select` elements receive a consistent non-native visual treatment while preserving browser semantics; TimeTracker's custom select retains its fully animated application-owned popup.

## Responsive behavior

Travel distances and hover behaviors are reduced on smaller/coarse-pointer interfaces. Touch layouts avoid desktop hover-lift choreography. Persistent navigation and headers remain stable across breakpoints.

## Reduced motion

Under `prefers-reduced-motion: reduce`:

- shared durations collapse to effectively immediate transitions;
- decorative overlays/menu/drawer entrance motion is disabled;
- active navigation indicators move without transition;
- hover travel is disabled;
- busy shimmer and TimeTracker orbit animation are disabled;
- scrolling uses non-smooth behavior;
- focus, keyboard semantics, state changes, and all functionality remain intact.

## Browser verification

The Chromium release gate now verifies the motion orchestrator directly, including:

- v1.30 runtime availability;
- shared navigation-indicator generation and movement;
- indicator recovery after persistent navigation replaces its children;
- content-scoped route transition commits;
- preservation of surrounding persistent chrome;
- Board dialog close/focus lifecycle;
- the pre-existing routing, iframe, drag/drop, Item Workspace, accessibility, and theme/contrast gates.

## Backend compatibility

No v1.30.0 Supabase migration is required. PostgreSQL tables, RPC signatures, RLS, private Storage, authentication, module-state contracts, browser preference keys, and embedded-domain data remain unchanged.
