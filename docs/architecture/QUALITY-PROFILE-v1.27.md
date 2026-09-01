# v1.27.0 Accessibility and Performance Quality Profile

This review is intentionally evidence-driven. It records concrete issues found while restructuring the current implementation and the corresponding change. It does not add analytics, KPIs, speculative instrumentation, or optimization code without an observed problem.

| Area | Observed condition | v1.27.0 action |
| --- | --- | --- |
| Item Workspace async state | Rapidly opening Item A then Item B could allow a late A response to overwrite B. | Dedicated workspace load epoch rejects stale responses. |
| Item file upload | Switching items during an in-flight upload could make completion logic depend on the newly active item. | Upload captures the original board/item and uses an independent upload epoch. |
| Item Workspace focus | Panel behaved as a modal workspace but did not fully own keyboard focus. | Added dialog semantics, focus entry/trap/restoration, Escape close, and proper tabs. |
| Kanban drag/drop lifecycle | Low-level listeners/transient drag state lived inside the compatibility view and required manual cleanup. | Extracted disposable drag/drop controller using `AbortController`. |
| Kanban no-op move | Dropping an item into its existing group/status could issue an unnecessary server mutation. | No-op destination comparison suppresses the write. |
| Drag accessibility | Pointer drag state/result lacked a live announcement. | Added an `aria-live` status channel; Edit Item remains the keyboard movement path. |
| Board item search | Every raw input event immediately rerendered the full board workspace. | Rerenders are coalesced to the next animation frame and obsolete frames are cancelled. |
| TradeLink route scrolling | Tab/route changes always requested smooth scrolling. | Scrolling switches to `auto` when `prefers-reduced-motion: reduce` is active. |
| TimeTracker background work | Visual ticker could have been a profiling target. | Existing visibility-aware tick scheduling was verified and retained. |
| FuelTrack+ background refresh | Auto refresh could have been a profiling target. | Existing hidden-tab/interaction deferral was verified and retained. |

## Browser verification coverage

The release adds a Chromium/CDP integration suite covering routing/feature ownership, modal focus, module iframe lifecycle, Board drag/drop, Item Workspace async isolation, and workspace accessibility semantics.

The browser runner is part of `verify-project.sh`, making these behaviors release gates rather than documentation-only expectations.
