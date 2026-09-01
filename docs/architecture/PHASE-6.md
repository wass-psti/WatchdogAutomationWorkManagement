# Architecture Phase Six — v1.27.0

## Scope

Phase Six moves the restructuring effort into the three embedded domain applications and the browser-level verification layer. The goal is to create stable internal domain boundaries without rewriting mature application behavior, while hardening the two Board interaction areas that still had meaningful asynchronous/lifecycle risk.

This is a client/runtime architecture, reliability, accessibility, and verification release. It does not change Supabase tables, RPC signatures, RLS policies, Storage policies, authentication records, module-state keys, or browser preference keys.

## Domain configuration boundaries

Each embedded application now loads an explicit domain configuration module before the shared module bootstrap and its existing runtime entry point.

### TimeTracker

`apps/time-tracker/domain-config.js` owns stable attendance policy/configuration such as:

- supported locations and departments;
- roles, permissions, and administrator-role definitions;
- attendance schedule/work-duration policy;
- GPS cache policy;
- persistence/audit/OT keys;
- the official 2026 Philippine holiday catalog.

`apps/time-tracker/app.js` consumes this boundary through `globalThis.WMTimeTrackerDomain`. Dynamic attendance state, GPS work, cloud persistence, UI behavior, and transactional clock logic remain in the established runtime.

### FuelTrack+

`apps/fueltrack-plus/domain-config.js` owns:

- role and permission definitions;
- vehicle/container directories;
- request statuses and valid transitions;
- priorities/routes;
- cloud-state keys;
- refresh constants;
- the initial-state factory.

`app.v3.17.0-wm6.js` continues to own runtime interaction/business flow while consuming stable configuration through `globalThis.WMFuelTrackDomain`.

### TradeLink

`apps/tradelink/domain-config.js` owns the large commercial/static configuration surface, including:

- persistence/configuration keys;
- document types and route maps;
- terms/payment/VAT/currency catalogs;
- workflow/status catalogs;
- predefined personnel/approval directory;
- vendor/template defaults.

`app.v1.42.0-wm1.js` now consumes these values from `globalThis.WMTradeLinkDomain`. Approval behavior, document state, persistence, PDF behavior, and interactive workflows remain in the established runtime.

This separation deliberately extracts stable domain policy before attempting deeper controller/view decomposition inside each embedded application.

## Item Workspace interaction controller

`assets/js/features/boards/controllers/item-workspace-controller.ts` now owns the Item Workspace interaction lifecycle:

- panel opening/closing;
- workspace loading;
- active tab changes;
- update submission/deletion;
- file uploads/open/delete;
- keyboard dismissal and focus containment;
- stale-request invalidation;
- feature/reset cleanup.

The controller uses separate load and upload epochs. Async operations capture the board/item that was active when the operation began. This fixes a concrete race where a file chosen for Item A could otherwise be registered against Item B if the user switched items while the upload was still running.

The controller also prevents a slow Item A workspace response from replacing Item B after rapid selection.

## Drag/drop interaction controller

`assets/js/features/boards/controllers/drag-drop-controller.ts` now owns low-level Kanban drag/drop bindings and transient drag state.

It provides:

- disposable event binding via `AbortController`;
- explicit visual/transient-state reset;
- server-write suppression for no-op drops;
- improved drag-leave handling inside nested targets;
- an `aria-live` status message for drag state/result feedback;
- cleanup during Board rerender/deactivation.

Keyboard users retain the existing Edit Item workflow for deterministic group/status movement, so drag/drop remains an enhancement rather than the only way to move an item.

## Browser-level integration verification

`tests/browser/run-browser-tests.sh` and `tests/browser/run-cdp.mjs` add a zero-package-manager browser integration harness using the installed Chromium runtime and Chrome DevTools Protocol.

The harness evaluates the actual application source modules inside a real browser execution environment and verifies:

1. manifest-backed route ownership and feature lifecycle transitions;
2. shared dialog focus trapping, Escape dismissal, and focus restoration;
3. module-host iframe identity/ready/detach lifecycle with strict event source/origin validation;
4. Board drag/drop behavior, live feedback, no-op suppression, and disposal;
5. Item Workspace stale-response rejection and upload-to-original-item isolation;
6. Item Workspace dialog/tab accessibility semantics.

The test runner launches Chromium at `about:blank` and injects the local source through CDP, avoiding any dependency on external web navigation, npm, Playwright, or Selenium.

## Accessibility refinements

Observed issues addressed in this phase include:

- Item Workspace now exposes dialog semantics and an accessible title;
- workspace navigation uses `tablist`, `tab`, `aria-selected`, `aria-controls`, and `tabpanel` semantics;
- the workspace controller traps focus while open and restores focus when safely possible;
- drag/drop communicates state/result through an `aria-live` status region;
- TradeLink route/tab scrolling respects `prefers-reduced-motion` instead of always forcing smooth scrolling.

## Performance refinements

The Board item-search field previously caused an immediate full board rerender on every raw input event. Search updates are now coalesced with `requestAnimationFrame`, cancelling the previous queued frame when newer input arrives.

The review also confirmed that TimeTracker already suppresses unnecessary visual ticking while the document is hidden, and FuelTrack+ already defers auto-refresh work for hidden/interacting states. Those established safeguards were retained rather than replaced with speculative optimization code.

## Compatibility strategy

Phase Six preserves all existing domain behavior and backend contracts. The new domain configuration modules are loaded before each existing application entry point, so the mature runtime continues to function while static policy/configuration becomes independently testable and maintainable.

No `v1.27.0` Supabase migration is required.
