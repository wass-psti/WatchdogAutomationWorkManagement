# Work Management App v1.43.2

## v1.43.2 — Board compatibility hotfix

v1.43.2 is a narrowly scoped compatibility hotfix on top of the verified v1.43.0 production-hardening baseline. It corrects a Board envelope validation regression that rejected valid flexible Boards with no built-in `system_key='status'` column when historical `work_board_items.status` values remained populated. The legacy core status is now interpreted against stable Status-label IDs only when an authoritative system Status column exists; custom Status columns remain independently validated through their own typed configuration and cell contracts.

**Architecture:** Architecture Version 15 remains unchanged. Authentication, RBAC, persistence, Board permissions, custom Status lifecycle, Item Workspace, module runtimes, and the v1.43.0 backend hardening remain unchanged. No new Supabase migration is required; existing deployments keep `supabase/migrations/v1.43.0-production-hardening.sql`.

## v1.42.0 — Controlled UI/rendering TypeScript runtime

v1.42.0 completes the controlled Work Management shell/UI TypeScript migration on top of the verified v1.41 non-visual runtime. Shared presentation contracts, shell/navigation, Boards rendering and interaction controllers, Item Workspace collaboration UI, forms/overlays, and shared motion runtimes are TypeScript-authoritative while preserving the v1.41 behavioral baseline.

**Architecture:** **Architecture Version 15 / `typescript-authoritative-ui`**. The Work Management shell, feature rendering boundaries, Boards coordinator/grid interactions, Item Workspace, configurable Status management, shared overlays, and motion infrastructure now execute from TypeScript sources. Obsolete Work Management JavaScript compatibility facades and project-owned declaration migration shims have been removed after all consumers were redirected. TimeTracker, FuelTrack+, and TradeLink remain intentionally isolated same-origin embedded application compatibility islands; this release types their host/runtime integration boundary but does not rewrite their internal domain UIs.

**Database:** v1.42 introduces no new database schema migration. Existing deployments must already include `supabase/migrations/v1.41.0-transactional-backup-restore.sql`; fresh deployments are covered by the consolidated `supabase/schema.sql`.

**Verification/package status:** **fully verified and packaged**. The exact v1.42.0 source passed clean `npm ci`, strict TypeScript, all typed-runtime verifiers, Vite development smoke, production build, dist verification, production preview, the complete historical regression chain, and Chromium/CDP integration on the release-validation host. The final verified v1.42.0 archive is the rollback/reference baseline for this v1.43 hardening release.

See `docs/architecture/TYPESCRIPT-UI-RUNTIME-v1.42.md` and `docs/architecture/TYPESCRIPT-UI-RUNTIME-VERIFICATION-v1.42.md` for the migration boundary, audit results, browser coverage, and exact promotion sequence.

## Previous release: v1.40.0

## v1.40.0 — TypeScript non-visual feature runtime + cloud boundary hardening

v1.40.0 advances the verified v1.39.0 orchestration baseline upward into the remaining **non-visual feature runtime** while deliberately leaving broad rendering/UI conversion for a later stage. Board loading, commands, preferences, selectors, bulk selection, Item Workspace asynchronous state, configurable Status editing, activity loading, overlay coordination, command registration, module hosting, lifecycle/error infrastructure, and the Work Management runtime client now execute from authoritative TypeScript implementations behind thin JavaScript compatibility entries where presentation code still imports stable `.js` paths.

The authenticated cross-feature `cloud-module-data` bridge is now TypeScript-owned and treats every browser message as `unknown` until origin, frame/source identity, module identity, operation, payload, request identifier, authorization, and revision semantics are validated. Malformed, unauthorized, stale/out-of-order, and execution-failure cases remain distinct observable outcomes. The Vite public runtime configuration resolver is also TypeScript-authoritative in this release.

**Architecture:** Architecture Version 14 / `typescript-nonvisual-core`. Dependency direction remains UI/presentation → typed controllers/feature runtime → domain services → repositories → transport. No project-owned `.d.ts` migration shims remain, and no v1.40 Supabase schema migration is required.

**Verification/package status:** **fully verified**. The exact v1.40.0 source passed `npm ci` with 0 vulnerabilities and the complete `npm run release:check` pipeline on macOS, including strict TypeScript, both dedicated v1.40 runtime verifiers, Vite architecture verification, Vite dev startup, production build, dist verification, production preview, the full historical regression chain, and Chromium integration. See `docs/architecture/TYPESCRIPT-FEATURE-RUNTIME-v1.40.md` and `docs/architecture/TYPESCRIPT-FEATURE-RUNTIME-VERIFICATION-v1.40.md`.

**Remaining JavaScript boundary:** broad shell/feature rendering and DOM-heavy Board controllers remain JavaScript intentionally. Additional non-visual JavaScript that still warrants a later bounded migration includes the central auth/session runtime, backup/restore orchestration, and classic-script embedded-module bootstrap/identity/store surfaces; those are deferred because they cross high-risk session/deployment boundaries rather than because TypeScript coverage is unavailable.

## Previous release: v1.39.0

### v1.39.0 — TypeScript composition, controllers, and domain services

v1.39.0 made the platform composition root, route policy/controller, Boards controller, Board domain service, Board history controller, and diagnostics runtime authoritative TypeScript. `platform-services.d.ts` and all other project-owned declaration migration shims were removed. The exact v1.39 source passed the full `npm run release:check` pipeline and remains the rollback/reference checkpoint for v1.40. See `docs/architecture/TYPESCRIPT-ORCHESTRATION-v1.39.md` and `docs/architecture/TYPESCRIPT-ORCHESTRATION-VERIFICATION-v1.39.md`.

## v1.38.0 — Authoritative TypeScript runtime infrastructure

This release completes the next incremental TypeScript implementation slice. Error normalization, query/server-state runtime, Supabase transport, Boards repository/DTO mapping, RBAC capability policy, application/module manifest runtime, configurable Status logic, and the Board column-type registry now execute from TypeScript source. Historical `.js` import paths remain as compatibility entries while Vite follows the TypeScript implementations. Declaration shims for these migrated layers have been removed. No v1.38.0 Supabase migration is required. See `docs/architecture/TYPESCRIPT-RUNTIME-v1.38.md`.

**Verification/package status:** the v1.38.0 TypeScript runtime slice is fully verified. `npm install` completed with 0 vulnerabilities and generated the committed `package-lock.json`; strict TypeScript checks, runtime contract verification, Vite development startup, production build, dist/source-map verification, production preview, the complete historical Work Management regression suite, and the Chromium/CDP browser integration suite all pass. See `docs/architecture/TYPESCRIPT-RUNTIME-VERIFICATION-v1.38.md`.

## v1.37.0 — Incremental TypeScript foundation

This release begins the post-Vite TypeScript migration at architectural boundaries rather than converting rendering code wholesale. It adds strict TypeScript compiler configuration, shared platform/domain contracts, typed transport/query/repository interfaces, typed RBAC and application-manifest contracts, and robust Board column/status models with stable status-label identifiers and runtime status-schema validation. The platform composition root and existing infrastructure now expose strict declaration boundaries while their proven JavaScript implementations remain unchanged for this foundation release.

The migration is intentionally staged. JavaScript feature/controller/UI implementations remain operational and are covered by declaration contracts while lower-level implementations are converted progressively. `npm run release:check` now starts with `npm run typecheck` and `npm run verify:types`. No v1.37.0 Supabase migration is required. See `docs/architecture/TYPESCRIPT-MIGRATION-v1.37.md` for the exact completed/pending boundary.

## v1.36.0 — Vite build-pipeline migration

- Migrates the Work Management shell to **Vite 8.2.2** with a standard npm package/build pipeline and Node.js 20.19+ or 22.12+ engine contract.
- Adds `src/main.ts` as the single browser composition entry. It owns shell styles, Vite environment application, shared motion-runtime startup, and asynchronous shell loading.
- Replaces direct shell CSS/JavaScript loading from `index.html` with Vite-managed bundles while preserving the existing native ES-module application architecture.
- Adds production output under `dist/`, hidden production source maps by default, Vite manifest generation, CSS code splitting, and architecture-oriented Rolldown chunk groups for Boards, identity, and platform infrastructure.
- Adds standard public-client environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_BASE_PATH`, and `VITE_BUILD_SOURCEMAP`. Privileged Supabase keys remain forbidden from client configuration.
- Preserves TimeTracker, FuelTrack+, and TradeLink as same-origin lazy iframe compatibility islands in this phase. Their required runtime files are copied into the production build without changing domain behavior.
- Converts service-worker precaching to a build-generated runtime-asset manifest containing Vite's hashed output, while retaining network-authoritative embedded application loading. Service-worker registration is disabled during Vite development.
- Adds production-output verification and Vite dev/preview smoke scripts, including Chromium startup checks and static module-route checks.
- Establishes **Architecture v10 / `vite-esm`** as the build/runtime baseline and documents the TypeScript-ready migration seam in `docs/architecture/VITE-MIGRATION-v1.36.md`.
- No **v1.36.0** Supabase migration is required.
- Historical packaging-environment note: earlier handoffs could not execute local Vite gates in the packaging environment. For v1.40.0 this limitation is closed by external verification: the exact source passed `npm ci && npm run release:check` on macOS, including Vite dev/build/dist/preview and Chromium integration. See `docs/architecture/TYPESCRIPT-FEATURE-RUNTIME-VERIFICATION-v1.40.md`.


## v1.35.0 — Platform architecture modernization

- Introduces a framework-neutral **platform services layer** for normalized errors, sanitized diagnostics, server-state/query caching, authenticated backend transport, capability policies, and shared overlay lifecycle management.
- Moves Boards RPC/private-Storage knowledge into `features/boards/data/board-repository.js`; `core/boards.js` remains a compatibility facade so existing consumers keep working while transport details stop leaking into UI code.
- Adds request de-duplication, stale-time caching, targeted invalidation, and user-scoped query keys for Board server state while retaining forced fresh reads for permission-sensitive permanent deletion.
- Centralizes platform and Board authorization around stable capabilities such as `role.manage`, `board.edit`, and `board.manage`; existing role behavior and backend RLS/RPC enforcement remain unchanged.
- Generalizes the Board single-overlay behavior into a reusable platform overlay manager with replacement, parent/child overlays, Escape dismissal, outside-click handling, focus restoration hooks, and click-through suppression.
- Adds runtime response contracts and an extensible Board column-type registry so future field types can move toward registered render/editor/validation behavior instead of expanding global conditional blocks.
- Adds a route-owned error boundary plus a bounded local diagnostic buffer. User-facing recovery stays concise while support diagnostics remain sanitized and are not uploaded to an analytics service.
- Documents the application-wide state ownership model, repository rules, module boundaries, code-splitting strategy, testing architecture, and framework/library decisions in `docs/architecture/PLATFORM-MODERNIZATION-v1.35.md`.
- Deliberately does **not** rewrite the UI in React/Vue/Svelte or replace the mature Board grid. Vite + TypeScript, declarative schema validation, Playwright/Vitest, and optional query/overlay libraries are recommended as later incremental phases behind the interfaces established here.
- No **v1.35.0** Supabase migration is required. Existing deployments still require previously released migrations through `v1.34.0-configurable-status-labels.sql`.
- Advances application/platform/service-worker metadata to **v1.35.0 / Architecture v9**.

## v1.34.0 — Configurable Status labels + explicit Board editing

- Replaces the fixed Status-value model with **per-Status-column configurable labels** backed by stable internal label IDs. Existing `not_started`, `in_progress`, `blocked`, and `done` values remain compatible and are migrated into editable label definitions.
- Adds a compact Status picker for fast cell updates plus a dedicated **Manage labels** mode for inline label rename, creation, deletion, activation/deactivation, color selection, reordering, optional descriptions, and default-label selection.
- Persists Status label configuration through the protected `wm_set_board_status_labels` RPC. Deleting a label safely clears item/custom-cell references to that ID instead of leaving stale values.
- Normalizes legacy custom Status option text into stable identifiers during migration so visible label text can change without rewriting every associated item value.
- Makes Item Workspace status metadata and Kanban lanes resolve the current configured Status name/color instead of relying on immutable application constants.
- Standardizes direct Board rename interactions around an explicit **✓ Save / × Cancel** contract. Item, group, column, and fast single-line cell editors support Enter to confirm and Escape to cancel and do not silently save on blur.
- Introduces a shared Board overlay coordinator so incompatible contextual menus/editors replace each other instead of stacking. Escape closes the top active overlay first, outside interaction dismisses it, and dismissal clicks are prevented from leaking into underlying item-opening/selection/drag actions.
- Keeps floating Board/column/item menus outside table clipping contexts and preserves viewport-aware positioning, keyboard menu navigation, focus restoration, sticky columns, drag/drop, selection/history, filters, sorting, Item Workspace, and Updates/Files/Activity behavior.
- Existing Supabase deployments must apply `supabase/migrations/v1.34.0-configurable-status-labels.sql` after the v1.33.0 Board Sheet migration. Fresh deployments are covered by the consolidated `supabase/schema.sql`.
- Advances application/platform/service-worker metadata to **v1.34.0** and pre-caches the new Status/overlay runtime modules.


## v1.33.0 — Grouped Board Sheet redesign

- Reorganizes Table view into a cleaner grouped spreadsheet surface inspired by familiar work-management patterns without copying the supplied reference implementation or proprietary class structure.
- Gives each group a persisted accent color, collapse/expand control, item count, contextual menu, reorder handle, and accent boundary that continues into its table.
- Adds a protected `wm_set_board_group_accent` RPC and `accent_color` group field. Existing deployments must apply `supabase/migrations/v1.33.0-board-sheet-groups.sql`.
- Synchronizes horizontal scrolling between expanded group tables so the shared schema remains visually aligned while preserving each group as an independent interaction boundary.
- Keeps selection, drag handles, item identity, and row actions sticky where practical while allowing typed value columns to scroll naturally.
- Changes the item-name surface into the direct item-opening target; renaming remains available through an explicit inline pencil control and the existing item menu.
- Adds one-click column sort cycling (ascending → descending → clear), while retaining filter, wrap, duplicate, type-change, hide, add-right, resize, reorder, and permanent-delete workflows.
- Refines the end-of-schema Add Column control into an explicit `+ Column` action without changing column creation logic.
- Introduces a per-group inline Add item footer with Enter / Shift+Enter creation guidance and a lightweight Add new group separator after the final group.
- Adds group-aware hover, focus, selection, sticky-column, dark-theme, forced-colors, responsive, and long-content treatments without dashboard/KPI additions.
- Preserves Board persistence, permissions, Item Workspace integration, optimistic cell editing, undo/redo, bulk selection, drag/drop, floating menus, and stable Updates/Files/Activity behavior.

## v1.32.9 — Item Workspace tab cascade/root-cause accessibility fix

- Fixes the obsolete `.item-panel-tabs span` badge rule that was forcing the visible Updates / Files / Activity labels down to 8 px even when the buttons themselves were enlarged.
- Moves definitive tab geometry into the later-loaded motion-design cascade so shell-scoped padding can no longer override the intended navigation sizing.
- Raises desktop tab labels to 18 px with 76 px targets inside an 86 px navigation rail, with equal geometry and responsive 17/16 px fallbacks.
- Enlarges nearby item-panel metadata, status/due chips, header action targets, section eyebrow labels, Board members visibility pill, TYPE label, keyboard hints, character counter, and empty-state controls.
- Preserves tab roles/ARIA, keyboard behavior, content-scoped transitions, reduced-motion behavior, and panel state handling.
- Advances the service-worker/platform release to v1.32.9.

## v1.32.8 — Item Workspace tab readability refinement

- Enlarges the Updates, Files, and Activity tabs to 16 px / 800-weight desktop labels with 66 px tab targets and a 78 px navigation rail.
- Gives all three tabs identical sizing, alignment, spacing, hover, focus, selected, and keyboard-navigation treatment.
- Rebalances the active underline/animated indicator to a 3 px inset treatment that stays separated from the navigation divider.
- Preserves horizontal scrolling at narrow widths while keeping 15 px labels and large touch/click targets.
- Advances the service-worker/platform version to v1.32.8 so deployed clients receive the new tab sizing.

## v1.32.7 — Board accessibility and readability refinement

- Raises Board-specific typography for titles, item names, metadata, status labels, menus, controls, forms, Item Workspace tabs, Updates, Files, and Activity while retaining a clear hierarchy.
- Expands key control heights, table rows, menu targets, and responsive spacing so larger text does not clip or crowd interactive components.
- Improves wrapping, long-name resilience, secondary-text contrast, placeholder legibility, horizontal tab handling, and high-contrast/forced-colors support.
- Keeps Board data keys, selectors, permissions, RPC contracts, persistence, animation architecture, and interaction behavior unchanged.
- Advances the application service-worker cache to v1.32.7 so deployed clients receive the accessibility refinements.

## v1.32.5 — Board written-experience refinement

- Extends the Board-wide content-design pass across board creation/editing, list states, item workflows, column editing, group deletion, board access, bulk actions, Updates, Files, Activity, and backend-facing recovery messages.
- Replaces remaining generic inline labels with contextual actions such as **Clear value**, **Clear dates**, **Save dates**, **Save text**, **Save field value**, **Export CSV**, **Remove access**, and **Delete permanently**.
- Makes destructive confirmations and success feedback more specific to the affected board object and consequence while preserving existing permissions and state transitions.
- Improves placeholders, helper copy, accessibility labels, metadata line height, long-text readability, and responsive bulk-action behavior.
- Removes migration/version implementation detail from user-facing Board setup errors and directs users to an administrator instead.
- Advances the application and service-worker cache to v1.32.5 so deployed clients receive the refined Board assets.
- No Supabase migration is required; the existing v1.31 Board backend contract remains authoritative.

## v1.32.4 — Item Workspace tab transition stability + Board content design

### Board-wide product language refinement

- Standardizes user-facing Board terminology across boards, groups, items, columns, members, Updates, Files, Activity, menus, dialogs, empty states, validation, errors, success feedback, and accessibility labels.
- Separates presentation labels from internal status/role keys so clearer copy does not alter persisted values, selectors, RPC payloads, or authorization logic.
- Rewrites destructive actions to state their consequence explicitly, including archive, trash, permanent Board/item/column/group deletion, file removal, and update deletion.
- Reworks loading, empty, recoverable-error, and success copy to tell users what happened and what they can do next instead of exposing generic or technical wording.
- Refines Board/list/Table/Kanban/Item Workspace typography, wrapping, truncation, line-height, and native title tooltips for long names without adding visual clutter.
- Uses consistent action language such as Add, Edit, Duplicate, Move, Archive, Restore, Remove, Reset view, and Delete permanently throughout related workflows.
- Keeps internal identifiers and the v1.31.0 Board persistence contract unchanged; no v1.32.4 database migration is required.

### Item Workspace transition stability

- Moves the Item Workspace three-dot actions onto the unified Board floating-menu overlay layer so Edit/Archive are never rendered behind the drawer header, tabs, or tab-transition content.
- Keeps the action menu anchored to the trigger with viewport collision handling and repositions it during resize while preserving outside-click, Escape, arrow-key, Home/End, focus, and permission behavior.
- Removes the drawer-local `<details>` stacking context that caused the menu to be obscured by Item Workspace chrome.
- Keeps the Item Workspace drawer, header, tab navigation, and scroll viewport mounted while switching Updates / Files / Activity.
- Replaces and animates only the internal tab stage, preventing drawer re-entry, header bounce, tab recreation, and scroll-container resets.
- Cancels in-flight tab animations during rapid switching and guarantees the latest requested tab wins.
- Remembers an independent scroll position for Updates, Files, and Activity and restores it when revisiting a tab.
- Re-clicking the active tab is a no-op instead of replaying rendering or motion.
- Adds Arrow Left / Arrow Right / Home / End keyboard navigation across Item Workspace tabs.
- Reduced-motion users receive immediate tab changes with no content transition animation.
- No Supabase migration is required; the v1.31.0 Board interaction backend remains authoritative.

## v1.32.3 — Item Workspace tab indicator refinement

- Consolidated the Updates / Files / Activity selected state onto the shared moving indicator.
- Removed the overlapping legacy per-tab underline.
- Inset and vertically separated the active indicator from the tab-bar divider.
- Refined hover, focus-visible, selected, and reduced-motion states without changing Item Workspace behavior.
- No Supabase migration is required.
- Added `verify-v1323-item-tabs.mjs` and `docs/architecture/ITEM-TABS-v1.32.3.md`.

## v1.32.2 — Item Workspace Updates visual integration

- Reworked the Updates experience into a compact, Board-native collaboration surface with tighter item header/tab proportions and stable spacing.
- Reorganized the composer into an update header, semantic update-type toolbar, focused editor, and fixed action footer so writing does not consume excessive vertical space.
- Preserved Progress, Decision, Blocker, and Handoff shortcuts while adding pressed-state feedback that follows the current typed prefix.
- Added a contextual Clear action, near-limit character feedback, unchanged Ctrl/Cmd+Enter posting, visibility messaging, and stable loading/disabled states.
- Redesigned update cards with compact author metadata, inferred update-type badges/semantic rails, restrained hover behavior, clearer mentions, and preserved delete authorization.
- Replaced the oversized empty placeholder with a compact inline first-update call to action that keeps the timeline visually connected to the composer.
- Improved mobile wrapping and action placement without reintroducing Board drawer layout shifting or repeated reveal motion.
- No `v1.32.2` Supabase migration is required; the existing v1.31 Board collaboration backend remains authoritative.
- Added `verify-v1322-item-updates-integration.mjs` and `docs/architecture/ITEM-UPDATES-REDESIGN-v1.32.2.md`.

## v1.32.0 — Work Boards workspace overhaul

This release begins the section-by-section UI overhaul with Work Boards. It fixes the non-opening three-dot menus by replacing overflow-sensitive `<details>` menus with a unified floating menu controller, stabilizes the Board workspace so header/toolbar chrome is not remounted on routine state updates, preserves horizontal table/Kanban scroll during rerenders, removes repeated reveal motion from dynamic Board content, and expands Kanban into a full-height working surface with lane quick-add actions. Existing v1.31.0 Board persistence/RPC contracts remain authoritative.

### Board stability and interaction refinements

- Board, group, item-row, and board-card three-dot menus use one viewport-aware floating-menu controller with outside-click, Escape, arrow-key, Home/End, resize, and scroll lifecycle handling.
- The Board detail page now keeps persistent header, controls, view, selection, and Item Workspace hosts instead of replacing the entire Board DOM on every state change.
- Search/filter/selection/cell updates rerender only the Board-owned view region needed for the change; search focus and surrounding chrome remain stable.
- Table and Kanban horizontal scroll positions are captured/restored across data rerenders.
- Dynamic Board content is marked motion-static so the global reveal runtime does not replay entrance choreography after every edit, selection, filter, or refresh.
- Item Workspace opening no longer shifts the entire Board layout on desktop; the drawer overlays the workspace to avoid large horizontal jumps.
- The Board toolbar is reorganized into primary, query/filter, and secondary-action groups with stable button footprints.
- Kanban lanes now fill a practical viewport-height workspace, use sticky lane headers, improved empty states, horizontal scroll-snap behavior, and per-lane `+ Add` actions.
- Creating an item through the full Add Item workflow now persists the selected status, assignee, due date, and notes instead of discarding those form values.

### Persistence and compatibility

- No `v1.32.0` Supabase migration is required. Existing deployments still require `supabase/migrations/v1.31.0-board-interaction-engine.sql`.
- No database tables, RPC signatures, RLS policies, Storage policies, board records, preference payloads, authentication, or authorization rules are changed.

### Verification

- Added `verify-v1320-board-overhaul.mjs` and `docs/architecture/BOARD-OVERHAUL-v1.32.md`.
- The Chromium release gate now opens the real floating Board menu controller, verifies that it escapes overflow clipping, checks Escape/ARIA state, and confirms dynamic Board workspace content is excluded from repeated reveal motion.


## v1.31.1 — Work Boards stabilization

This patch is based on the supplied v1.31.0 interaction recording. It fixes the defects visible during real board use without changing the v1.31.0 persistence contract: row context menus now escape the horizontally scrollable table instead of being clipped into a long strip, utility columns stay reachable while scrolling, Long Text/Timeline saves expose pending and recoverable failure states, and Item Activity now presents compact field-level history instead of raw repetitive `item.cell_updated` entries. The existing v1.31.0 Board interaction engine remains authoritative.

### Recorded interaction fixes

- Row three-dot menus use viewport-aware fixed positioning, close when unrelated editing begins, close on table scroll/outside interaction, and support Escape dismissal.
- Selection, drag, Item identity, and row-action utility columns use stable sticky geometry so horizontal scrolling does not hide the controls needed to operate the row.
- The detail-open row state uses a neutral/violet contextual highlight rather than an error-like treatment.
- Long Text and Timeline editors keep the editor open while saving, publish `aria-busy`, show `Saving…`, and preserve the user's draft with an inline retry message if persistence fails.
- Item Activity translates internal event codes to user-facing labels, names the changed field, and compacts consecutive same-field changes from the same actor into one entry with a count.
- Board scrollbars and repeated utility surfaces were visually refined so the wide interactive table remains usable without changing its column/data model.

### Persistence and compatibility

- No `v1.31.1` Supabase migration is required. Existing deployments must still have `supabase/migrations/v1.31.0-board-interaction-engine.sql` applied.
- No RPC signatures, tables, RLS rules, Storage policies, board records, preference payloads, or authorization behavior are changed in this patch.
- The fixes are client-side interaction/lifecycle corrections and remain compatible with the v1.31.0 Board schema.

### Verification

- Added `verify-v1311-board-stabilization.mjs` and `docs/architecture/BOARD-STABILIZATION-v1.31.1.md`.
- The Chromium gate now reproduces the recorded menu-clipping geometry, verifies sticky row actions, forces a failed Long Text save to confirm draft recovery, and verifies Item Activity compaction/user-facing labels.

## v1.30.0 — motion architecture and stable-shell redesign

This release deepens the v1.28 motion-focused presentation into a formal application-wide motion architecture. It introduces shared choreography tokens and a motion orchestrator, keeps persistent shell/navigation chrome mounted during navigation, scopes route transitions to replaceable content regions, and standardizes navigation indicators, menus, dialogs, drawers, validation, loading feedback, forms, lists, tables, and responsive motion across Work Management, Work Boards, TimeTracker, FuelTrack+, and TradeLink. Existing business logic, authentication, RBAC, routing, Supabase persistence, module state, and domain workflows remain unchanged.

### Stable-shell choreography

- Added `assets/js/runtime/motion-orchestrator.ts` as the shared lifecycle-safe choreography boundary.
- Work Management now preserves the sidebar, workspace, topbar, and main containers between compatible route renders instead of remounting the global shell.
- TimeTracker preserves its application shell/topbar/main/footer/modal hosts between tabs and no longer uses document-wide View Transitions.
- TradeLink preserves its topbar/main/company-panel/modal hosts between primary routes.
- FuelTrack+ distinguishes true route changes from same-route data refreshes and animates only the route-owned content node.
- State refreshes, filtering, search, cloud synchronization, and other same-route updates do not replay route entrance/exit animation.

### Shared motion system

- Added reusable duration, easing, travel-distance, blur, press-scale, hover-lift, and stagger tokens to the design foundation.
- Added generated active-navigation indicators that move between selections in shell navigation, TimeTracker tabs, FuelTrack+ navigation, TradeLink tabs, Board tabs, and Item Workspace tabs.
- Indicator bindings recover automatically when a persistent navigation container replaces its children.
- Standardized menu/popover origins, modal/drawer entrance and exit behavior, busy feedback, validation pulses, toast feedback, empty-state settlement, row feedback, and styled native selects.
- Board dialogs now perform a short controlled exit before teardown while retaining focus restoration and controller bookkeeping.

### Accessibility and performance

- Persistent chrome is explicitly excluded from transform/scale animation to prevent shell shrink, layout jumps, flashing, and navigation instability.
- Content exits reject stale transition epochs and cancel Web Animation fill state before committing the next view, preventing persistent containers from remaining faded or translated.
- Motion continues to favor transform/opacity, with no continuous application-wide layout loop.
- Smaller/coarse-pointer interfaces use shorter travel and suppress desktop-only hover movement.
- `prefers-reduced-motion: reduce` removes nonessential movement, shimmer, orbit animation, and transition delays while keeping all functionality and focus behavior available.

### Verification

- Added `verify-v1300-motion-architecture.mjs` and `docs/architecture/MOTION-ARCHITECTURE-v1.30.md`.
- Expanded the real Chromium gate to verify the v1.30 orchestrator, moving navigation indicators, persistent-chrome preservation, indicator recovery after child replacement, and content-scoped transition commits alongside existing routing, modal, iframe, Board drag/drop, Item Workspace, accessibility, and theme/contrast checks.
- No Supabase migration is required for v1.30.0. Architecture remains Version 7 because the release changes interaction/presentation choreography rather than business-feature ownership.

# Work Management App v1.29.1

## v1.29.1 — TimeTracker palette completion

This patch completes the TimeTracker migration from the pre-motion warm-neutral palette to the current cool-neutral design system. It targets the remaining Overview filter dock, Attendance Records summary/table, Calendar, RBAC, audit/evidence, modal, skeleton, and utility styles that still contained legacy neutral colors after v1.29.0. No attendance logic, permissions, persistence, routes, or data contracts are changed.

### TimeTracker refinements

- Replaced the remaining warm beige Overview filter-dock surface with the current neutral glass surface.
- Replaced the Attendance Records table header's old cream background with the current cool muted surface.
- Added semantic TimeTracker surface, text, border, track, and subtle-state tokens so Overview, Records, Calendar, Roles, OT, evidence, and utility components share one palette.
- Migrated legacy warm-gray text values in Calendar and supporting UI to the current `--muted`, `--subtle`, `--green`, and `--orange-dark` semantic tokens.
- Normalized old warm shadow/border RGB values to the current blue-gray neutral family.
- Aligned status dots, empty states, inactive permissions, skeletons, and supporting tracks with current neutral/status tokens.
- Kept the coral accent, green success semantics, motion system, custom dropdown behavior, responsive layouts, and reduced-motion behavior intact.
- Added final motion-layer guards for the Overview controls and Attendance Records surfaces so later presentation layers cannot reintroduce the legacy palette.

### Verification

- Added a dedicated v1.29.1 TimeTracker palette-completion verifier.
- Extended the Chromium computed-style theme gate to check the Overview filter dock and Attendance Records header in addition to the custom dropdown.
- The release remains presentation-only; no Supabase migration is required.

## v1.29.0 — embedded theme coherence and contrast refinement

This release performs a targeted visual-system correction across TimeTracker, FuelTrack+, and TradeLink after the v1.28.0 motion redesign. The fixes are applied at each application's theme/token and shared motion layers so related controls inherit the corrected behavior instead of relying on screenshot-specific overrides. Existing business logic, routes, RBAC, state management, Supabase persistence, and motion behavior remain unchanged.

### TimeTracker

- Removed the remaining warm/cream legacy palette from the active TimeTracker component layer and migrated controls to the current cool-neutral design system.
- Reworked the custom/portaled select component so its trigger, menu, options, selected state, hover state, focus state, borders, disabled state, and text all inherit the current semantic surfaces.
- Removed the legacy `#fffaf3`, `#fbe9df`, `#f7f1e7`, and related warm translucent control backgrounds that could bypass the v1.28 presentation layer.
- Updated the TimeTracker page theme color and shared motion surface to match the current neutral canvas.

### FuelTrack+

- Corrected the Light Mode root cause where the v1.28 motion layer could force dark canvas/sidebar/topbar/card surfaces while the application's light tokens supplied dark text.
- Added explicit semantic motion-surface variables for light and dark modes and moved shell/card/dialog/table/skeleton treatments onto those variables.
- Strengthened tertiary typography contrast in both modes and improved disabled-control legibility.
- Added theme-UI synchronization so the browser theme color and theme-toggle accessibility text reflect the active theme.
- Dark Mode retains its established visual identity while sharing the same component hierarchy and state language as Light Mode.

### TradeLink

- Corrected legacy dark-chrome typography rules that survived underneath the newer light motion surfaces and produced white/low-contrast text on white backgrounds.
- Migrated the top bar, brand, navigation, vendor control, document command bar, document status, metadata, labels, help text, placeholders, and disabled fields to readable semantic text colors.
- Strengthened muted/secondary typography tokens and added final-layer contrast guards so older component selectors cannot reintroduce unreadable inherited colors.

### Verification

- Extended the real Chromium integration gate with computed-style contrast checks for TimeTracker dropdown states, FuelTrack+ Light/Dark surfaces and tertiary text, and TradeLink brand/navigation/document/placeholder/disabled states.
- Added `verify-v1290-theme-refinement.mjs` and `docs/architecture/THEME-REFINEMENT-v1.29.md`.
- No Supabase migration is required for v1.29.0; this release changes presentation/theme contracts only.



## v1.28.0 — complete motion-focused UI redesign

This release applies a cohesive motion-driven visual system across the Work Management shell, Work Boards, authentication/account/settings/user-management, module hosting, TimeTracker, FuelTrack+, and TradeLink. The redesign changes presentation, layout chrome, interaction feedback, transitions, motion, focus treatment, and responsive behavior while preserving all established business logic, routing, RBAC, Supabase persistence contracts, and module data.

### Shared motion design system

- Added `assets/css/motion-design.css` as the final presentation layer for the shell and every embedded application.
- Added `assets/js/runtime/motion-design.ts` for progressive reveal staging, kinetic press feedback, pointer-aware ambient gradients, dynamic-view enhancement, and reduced-motion detection.
- The Work Management shell now uses floating navigation/topbar surfaces, deeper visual hierarchy, kinetic active-navigation indicators, layered hero treatment, motion-responsive cards, and consistent glass/elevation semantics.
- Work Boards now carries the same design language through Board cards, Table, Kanban, controls, dialogs, column workflows, and the Item Workspace.
- Authentication, Account, Settings, User Management, the command palette, and module-host chrome now use the same focus, radius, depth, and motion vocabulary.
- TimeTracker, FuelTrack+, and TradeLink each retain their domain identity while using the same interaction/motion grammar.

### Interaction and accessibility

- Buttons and interactive cards use consistent lift/press feedback without changing their event behavior.
- High-value cards and panels receive IntersectionObserver-based entrance staging; dynamically rendered content is covered through MutationObserver enhancement.
- Pointer-aware ambient gradients are requestAnimationFrame-throttled and do not trigger application rerenders.
- `prefers-reduced-motion: reduce` disables decorative motion and effectively eliminates transition delays while preserving all controls and focus behavior.
- Existing keyboard/focus semantics remain authoritative; the redesign adds consistent focus-visible presentation rather than replacing interaction logic.

### Verification and backend compatibility

- Browser integration now verifies the motion runtime initializes alongside routing, modal focus, iframe lifecycle, Board drag/drop, and Item Workspace concurrency tests.
- Added `verify-v1280-motion-design.mjs` to verify all four application surfaces load the shared presentation/runtime layer and that the release cache includes both assets.
- No Supabase migration is required for v1.28.0. PostgreSQL tables, RPC signatures, RLS, private Storage policies, authentication records, and module state remain unchanged.

The design implementation and reduced-motion/performance contract are documented in `docs/architecture/MOTION-DESIGN-v1.28.md`. Architecture remains **Version 7** because this release changes the presentation system rather than the business/runtime ownership model.

## v1.27.0 — domain decomposition, browser verification, and interaction hardening

This release moves the established restructuring boundaries into TimeTracker, FuelTrack+, and TradeLink, adds browser-level integration verification, and extracts the remaining actively modified Board Item Workspace/drag-drop interaction lifecycles. It also applies targeted accessibility/performance fixes discovered during the review. Existing Supabase contracts, RBAC, routes, storage keys, module-state records, and user data remain unchanged.

### Embedded domain boundaries

- Added `apps/time-tracker/domain-config.js` for attendance policy, locations/departments, roles/permissions, GPS/storage configuration, and the official 2026 Philippine holiday catalog.
- Added `apps/fueltrack-plus/domain-config.js` for request roles/permissions, status transitions, vehicle/container directories, routes/priorities, cloud-state keys, refresh constants, and initial-state construction.
- Added `apps/tradelink/domain-config.js` for document/workflow/payment/VAT/currency/personnel/template/route catalogs and stable TradeLink configuration.
- Each embedded runtime HTML loads its domain config before the shared module bootstrap and existing application entry point. Dynamic business logic and existing cloud persistence remain in the established runtime.

### Board Item Workspace and drag/drop controllers

- Added `item-workspace-controller.js` for Item Workspace loading, tabs, Updates, Files, keyboard focus lifecycle, stale-request invalidation, and feature reset.
- Item workspace loads and uploads use independent epochs and capture the original board/item so rapid item switching cannot overwrite a newer selection or attach an in-flight file to the wrong item.
- Added `drag-drop-controller.js` with disposable `AbortController`-based bindings, explicit transient-state cleanup, no-op move suppression, improved nested drag-leave handling, and `aria-live` status feedback.
- Board feature teardown now disposes both controllers instead of leaving low-level interaction state inside the compatibility view.

### Browser-level integration tests

- Added `tests/browser/run-browser-tests.sh` and `tests/browser/run-cdp.mjs`.
- The test harness uses installed headless Chromium and Chrome DevTools Protocol with no npm/Playwright/Selenium dependency.
- Browser release gates cover route/feature ownership, shared modal focus trapping/restoration, module iframe identity/ready/detach lifecycle, Board drag/drop behavior and disposal, Item Workspace stale-response/upload isolation, and workspace accessibility semantics.

### Accessibility and performance refinements

- Item Workspace now exposes `dialog`, `tablist`, `tab`, and `tabpanel` semantics with active-state relationships.
- The workspace controller traps focus, supports Escape dismissal, and safely restores prior focus.
- Drag/drop publishes live status feedback while retaining Edit Item as the deterministic keyboard movement path.
- Board item-search rerenders are coalesced with `requestAnimationFrame` rather than performing a full workspace rerender for every raw input event.
- TradeLink tab/route scrolling now respects `prefers-reduced-motion`.
- Existing TimeTracker hidden-document tick suppression and FuelTrack+ visibility/interaction-aware refresh deferral were verified and retained rather than replaced speculatively.

### Data/backend compatibility

No Supabase migration is required for v1.27.0. This release does not change PostgreSQL tables, RPC signatures, RLS policies, private Storage policies, authentication schema, module-state keys, or browser preference keys.

### Architecture documentation

Phase Six is documented in `docs/architecture/PHASE-6.md`, with the evidence-driven accessibility/performance findings in `docs/architecture/QUALITY-PROFILE-v1.27.md`. The architecture reference is now **Architecture Version 7**.

## v1.26.0 — architecture restructuring phase five

This release completes the planned shell and Work Boards restructuring pass identified after v1.25.0. It extracts the Home/Application Launcher and global command system from shell-local state, introduces a formal command registry, moves Board group/item/member/activity workflows into dedicated controllers, and extracts the remaining high-value Board workspace presentation templates. Existing Supabase contracts, RBAC, application modules, routes, storage keys, and user data remain unchanged.

### Home/Application Launcher feature

- Added `assets/js/features/home/index.ts` as the owner of launcher rendering, search, Favorites filtering, recent applications, favorite mutations, install-app presentation, and keyboard card activation.
- The `#/` route is now owned by the manifest-declared `home` feature instead of the generic shell.
- Cross-tab preference updates synchronize through the Home feature instead of mutating launcher-specific shell globals.
- `assets/js/app.ts` no longer owns `appFilter`, `favoritesOnly`, module-card markup, Recent presentation, launcher filtering, or Favorites actions.

### Command registry and palette

- Added `assets/js/features/commands/command-registry.ts` for duplicate-safe command registration, runtime visibility predicates, lookup, execution, and diagnostics snapshots.
- Added `assets/js/features/commands/index.ts` for command-palette markup, filtering, selection, keyboard navigation, focus trapping/restoration, and built-in command registration.
- The existing `⌘/Ctrl+K` workflow remains available, including application navigation, Boards, Settings, authorized User Management, Account/sign-in, and workspace backup export.
- `assets/js/app.ts` no longer owns command selection arrays, query results, palette markup, focus restoration, or keyboard traversal.

### Work Boards workflow extraction

- Added `controllers/group-workflows.js` for add/rename/delete group workflows.
- Added `controllers/item-workflows.js` for add/edit/archive/restore item workflows and an explicit archive confirmation safeguard.
- Added `controllers/member-workflows.js` for board member add/remove flows using the shared modal lifecycle rather than direct DOM removal.
- Added `controllers/activity-workflows.js` for immediate loading feedback, board Activity rendering, and stale-response invalidation.
- All new controllers participate in Work Boards feature teardown.

### Board workspace presentation extraction

- Added `views/board-workspace-view.js` for the board detail header, view/search controls, Table item-row markup, and column-header/context-menu presentation.
- `boards-ui.js` remains the compatibility interaction/orchestration boundary but no longer owns these large templates directly.
- Together with the previous Board List, Table, Kanban, and Item Workspace views, the primary Work Boards presentation structure is now separated from service/workflow code.

### Reliability refinements

- Board Activity requests reject stale results after board changes or feature deactivation.
- Board Activity now opens immediately with a clear loading state rather than appearing unresponsive while the server request is pending.
- Member removal closes through the shared dialog controller, preserving focus restoration and dialog bookkeeping.
- Command palette focus restoration checks that the previous element is still connected before focusing it.
- Home feature activation refreshes persisted launcher preferences so route entry is synchronized with cross-tab changes.

### Data/backend compatibility

No Supabase migration is required for v1.26.0. This release does not change PostgreSQL tables, RPC signatures, RLS policies, Storage policies, module-state keys, authentication schema, or browser preference keys. Existing deployments remain compatible with the backend migrations already required by the enabled feature set.

### Architecture documentation

Phase Five is documented in `docs/architecture/PHASE-5.md`. The architecture reference is now **Architecture Version 6**. The planned shell/Home/command and primary Work Boards presentation/workflow restructuring targets are now substantially complete; further decomposition is optional and should be driven by concrete maintenance or feature needs.

## v1.25.0 — architecture restructuring phase four

This release completes the next planned client-side restructuring milestone. It extracts Authentication and Settings from shell-local state, splits Work Boards Table/Kanban presentation into dedicated views, centralizes Board modal mechanics, and moves the largest column/cell workflows into a dedicated controller. Existing Supabase contracts, application modules, routes, RBAC, storage keys, and user data remain unchanged.

### Authentication feature controller

- `assets/js/features/auth/index.ts` now owns login, registration, verification/recovery rendering, transient busy/error state, safe registration draft fields, confirmation cooldown presentation, return-route consumption, auth form submission, and auth-specific actions.
- `assets/js/app.ts` delegates authentication click/form/input handling instead of retaining authentication presentation state.
- `core/auth.js` remains the authoritative Supabase Auth/session/RBAC integration; no alternate identity store was introduced.

### Settings feature controller

- Added `assets/js/features/settings/index.ts` as the dedicated Settings controller/view boundary.
- Settings now owns theme/density changes, shell-storage health, persistence requests, module compatibility checks, platform/auth diagnostics, backup export/validated restore, reset behavior, and Settings busy/result state.
- The shell receives explicit preference-change callbacks so Home/launcher state remains synchronized without owning Settings internals.

### Work Boards view/workflow decomposition

- Added `assets/js/features/boards/views/table-view.ts` for schema-empty, grouped-table, filtered-empty, item-row composition, and table-level add actions.
- Added `assets/js/features/boards/views/kanban-view.ts` for status lanes, cards, assignee/group/due context, drag/drop data attributes, and item actions.
- Added `assets/js/features/boards/controllers/dialog-controller.ts` for focus trapping/restoration, Escape/backdrop close behavior, submit busy state, persistent inline errors, and feature-wide modal cleanup.
- Added `assets/js/features/boards/controllers/column-workflows.ts` for filtering, duplication, searchable type selection, create/edit, type conversion safeguards, Manage Columns, reordering, deletion, preference cleanup, and typed cell editing.
- `board-state.js` no longer stores transient picker position/type-change context; those details are scoped to the workflow controller.

### Reliability refinements

- Item Workspace requests now use a dedicated epoch so a stale response from Item A cannot overwrite Item B after rapid selection or panel closure.
- The Board floating-column-menu resize listener is explicitly disposed on rerender/deactivation instead of waiting for a later resize to notice a detached board root.
- Settings storage-health requests reject stale feature-epoch results after navigation.
- Board feature teardown still invalidates board loads, cancels preference writes, clears drag state, closes Board dialogs, resets Item Workspace state, and removes global panel classes.

### Data/backend compatibility

No Supabase migration is required for v1.25.0. This release does not change PostgreSQL tables, RPC signatures, RLS policies, Storage policies, module-state keys, authentication schema, or browser preference keys. Existing deployments remain compatible with the backend migrations already required by the enabled feature set.

### Architecture documentation

Phase Four is documented in `docs/architecture/PHASE-4.md`. The architecture reference is now **Architecture Version 5**, and the restructuring checklist records Authentication, Settings, Table/Kanban, and Board column/dialog workflow extraction as complete.

## v1.24.0 — architecture restructuring phase three

This release continues the progressive Work Management restructuring by moving Account and User Management out of shell-local state and beginning deeper decomposition of the Work Boards presentation layer. It preserves the established static-host runtime, Supabase contracts, RBAC behavior, application modules, routes, storage keys, and existing user data.

### Account and user-management extraction

- Added `assets/js/features/account/index.ts` as the dedicated Account controller/view boundary for profile settings, password changes, access refresh, session controls, and sign-out workflows.
- Added `assets/js/features/user-management/index.ts` as the administrator directory controller for loading, search, retry, role/status mutations, busy state, and route-safe asynchronous completion.
- `#/account` now has its own `account` route owner in the application manifest; authentication now owns only login/register/verification routes.
- Removed shell-local account busy state and user-directory state/render/mutation implementations from `assets/js/app.ts`; shell event handling now delegates to the feature controllers.
- Account/User Management lifecycle epochs prevent stale async completions from repainting the UI after route changes.

### Work Boards presentation decomposition

- Added `features/boards/views/board-list-view.js` for board toolbar/card/loading/error/empty-state markup.
- Added `features/boards/views/item-workspace-view.js` for Updates, Files, Activity, item workspace header/tabs, mention rendering, and attachment-size presentation.
- `boards-ui.js` retains interaction, authorization, drag/drop, async orchestration, dialogs, Table/Kanban, and column workflows while delegating these extracted presentation concerns.
- Existing direct board opening, archive/trash actions, private item files, updates, item activity, and all board permissions remain unchanged.

### Runtime/manifest hardening

- Application architecture version is now **4**.
- Manifest validation now verifies that every route owner is a declared feature.
- The central service-worker asset manifest includes all new Account, User Management, Board List, and Item Workspace feature modules.

### Compatibility

No Supabase migration is required for v1.24.0. The existing backend contract through `v1.21.6-item-workspace.sql` remains authoritative. TimeTracker, FuelTrack+, TradeLink, authentication, RBAC, Work Board RPCs, private Storage policies, module cloud state, backup/recovery, and browser preference keys remain compatible.


## v1.23.0 — architecture restructuring phase two

This release continues the v1.22 architectural migration by moving route orchestration, global browser lifecycle handling, runtime feature ownership, and Work Boards state/schema/service construction behind explicit boundaries. The goal is to reduce coupling without changing any established route, Supabase contract, module behavior, storage key, permission rule, or user data.

### Shell and runtime changes

- Added `assets/js/runtime/route-controller.ts` as the single route-dispatch and authentication-gating path. Route renderers no longer own cross-feature teardown policy.
- Added `assets/js/runtime/feature-registry.ts` to bind manifest-declared feature ownership to runtime implementations and lifecycle hooks.
- Added `assets/js/runtime/application-lifecycle.ts` so long-lived `window`/`document` listeners have one install/dispose boundary instead of being scattered through the shell.
- Added the feature registry as an SDK-style runtime service and exposed a read-only feature snapshot through `WorkManagementRuntime`.
- Route transitions now call feature lifecycle hooks when ownership changes. This allows a feature to invalidate asynchronous work before another feature renders.

### Work Boards decomposition

- Added `features/boards/boards-controller.js`; board transport construction is now controller-owned and injected into the view.
- Added `features/boards/board-schema.js` for supported column metadata and collision-safe `New (column type)` naming.
- Added `features/boards/board-state.js` for authoritative client view-state initialization and item-panel reset behavior.
- `boards-ui.js` remains as a compatibility view boundary, but it no longer needs to own all schema/state decisions internally.
- Work Boards now exposes `activate()` / `deactivate()` lifecycle hooks. Leaving Boards invalidates in-flight loads, cancels pending preference persistence, clears drag state, closes board overlays, and removes stale item-workspace state.
- New-column and initial-column naming now use one shared naming function, eliminating duplicated naming logic and keeping collision behavior consistent.

### Compatibility

No Supabase migration is required for v1.23.0. The schema remains the v1.21.6-compatible backend contract. TimeTracker, FuelTrack+, TradeLink, authentication, RBAC, Work Board RPCs, private item files, board activity, item collaboration, backup/recovery, routes, browser preference keys, and module state keys remain unchanged.


## v1.22.0 — architecture restructuring foundation

This release begins the full Work Management architecture restructuring using the supplied `monday-sdk-js` and `monday-ui-style` source packages as architectural references while preserving Work Management's own business logic, visual identity, Supabase backend, and static-host deployment model.

### Structural changes

- Added `config/application-manifest.ts` as the authoritative inventory of application version, routes, persistence ownership, feature boundaries, and registered modules.
- Added `assets/js/runtime/index.ts` as the shell dependency gateway so the entry point no longer imports low-level feature/core implementations individually.
- Added `assets/js/runtime/work-management-client.ts`, an SDK-style `listen/get/set/execute` service/event contract inspired by the supplied monday SDK source. It intentionally includes no telemetry or background analytics.
- Added `assets/js/runtime/module-host.ts` for the same-origin parent/iframe contract and `assets/js/runtime/module-bootstrap.ts` for shared child-module startup.
- Migrated TimeTracker, FuelTrack+, and TradeLink to the common module bootstrap sequence while retaining their existing application entry points and business behavior.
- Added explicit `auth`, `boards`, and `modules` feature facades under `assets/js/features/` so existing implementations can be migrated incrementally without breaking public paths.
- Moved shell SVG definitions and general formatting helpers out of the main entry point into `assets/js/ui/`.
- Added a design-system foundation under `assets/css/foundation/` with core tokens, semantic theme mappings, and reusable primitives. The established `app.css` selectors remain compatible through a semantic-token bridge.
- Added `config/runtime-assets.js` as the single service-worker shell-cache manifest, removing the previous duplicated hard-coded asset registry from `service-worker.js`.
- Platform diagnostics now validate the architecture manifest in addition to storage, module registry, and module runtime checks.
- Added architecture, feature-inventory, data-contract, and restructuring-checklist documentation under `docs/architecture/`.

### Compatibility

No Supabase database migration is required for v1.22.0. Existing routes, authentication flows, roles, module storage keys, Work Board RPCs, migrations, private file storage, TimeTracker data, FuelTrack+ data, TradeLink data, and browser preference keys remain unchanged. Existing low-level files are deliberately retained behind feature/runtime facades to avoid a risky flag-day rewrite.


## v1.21.6 — collaborative item workspace

Board items now open into a responsive side workspace inspired by modern collaborative work-management tools while retaining the application's own visual system. The workspace provides **Updates**, **Files**, and **Activity** tabs, persistent board-scoped discussions, lightweight `@mention` highlighting, private authenticated file attachments (20 MB per file), secure short-lived file links, attachment removal, and item-specific activity history. Table rows and Kanban cards expose a dedicated **Details** action, and the currently open item receives a clear selected treatment.

Updates and file metadata are stored in Supabase with server-side board-access checks. Attachments use a private `work-board-files` Storage bucket with RLS policies tied to board membership; uploaders can remove their own files and board owners can moderate shared content. Update authors can delete their own posts, while board owners can moderate updates. The panel is keyboard-dismissible with Escape, adapts to mobile as a full-width sheet, preserves existing inline cell editing, and keeps board refreshes and existing column workflows intact.

Existing deployments must apply `supabase/migrations/v1.21.6-item-workspace.sql`. The migration creates the collaboration tables/RPCs, private Storage bucket and policies, updates the board backend capability marker, and refreshes the PostgREST schema cache.

## v1.21.5 — permanent board-creation RPC reliability fix

- Fixes the `wm_create_board_configured(...)` PostgREST schema-cache/function-not-found failure shown during New Board creation.
- Adds an idempotent backend compatibility migration that re-applies the flexible board RPC definitions and sends `NOTIFY pgrst, 'reload schema'` so newly deployed functions become discoverable immediately.
- Adds a safe one-time client retry for the short schema-cache propagation window.
- Deliberately does **not** fall back to the legacy `wm_create_board` RPC when the configured RPC is unavailable, because older backend versions seed fixed system columns and would silently violate the user's Start empty / chosen-column configuration.
- Converts low-level `PGRST202`/schema-cache errors into a clear deployment-mismatch message and keeps the creation modal open for retry.
- Adds persistent inline modal error feedback in addition to the existing toast so failures remain visible and actionable.
- No partial board is created when the required backend function is unavailable.

Existing deployments must apply `supabase/migrations/v1.21.5-board-backend-compatibility.sql`. The migration is safe to re-run and includes the complete flexible-board creation definitions required by this release.


## v1.21.4 — flexible New Board creation

New boards are no longer seeded with the fixed **Item / Status / Assignee / Due** structure. The Create Board workflow now offers **Start empty** or **Choose starting columns**. Selected starting columns are created as ordinary custom columns, so they can be renamed, reordered, configured, duplicated, hidden, or deleted later. The default `wm_create_board()` path also creates no columns, preventing legacy callers from silently reintroducing the old fixed schema.

Board creation with selected columns is atomic through the authenticated `wm_create_board_configured()` RPC. Empty boards render a dedicated schema-empty state with an **Add first column** action rather than a malformed table. Duplicating an empty board preserves its empty schema instead of restoring the legacy defaults. Existing boards are left intact to avoid destructive migration of current data.

### Required database migration

Existing deployments must apply `supabase/migrations/v1.21.4-flexible-board-creation.sql`. Fresh deployments are covered by the consolidated `supabase/schema.sql`.


## v1.21.3 — board creation defaults and direct board opening

Board creation and column creation now start with contextual default names instead of blank or generic labels. A new board is prefilled as **New board**, while a newly selected column type is prefilled as **New (column type)**, such as **New Text**, **New Status**, **New Dropdown**, or **New Date**. The field remains editable before submission, and existing duplicate-name validation, typed-column configuration, visibility settings, server-side authorization, persistence, and positional insertion behavior remain unchanged.

Board cards in the **Boards** tab are now primary navigation targets: clicking anywhere on the non-interactive portion of a board card opens that board directly. Keyboard users can focus a board card and open it with **Enter** or **Space**. The existing three-dot contextual menu remains isolated from card navigation and continues to provide secondary actions such as Open, Duplicate, Archive, Restore, Move to trash, and permanent deletion where authorized. A focus-visible treatment and subtle card affordance make the new interaction discoverable without changing the established board layout. No Supabase migration is required when upgrading from v1.21.2.

## v1.21.2 — board column-menu overflow and table-edge stability

This maintenance release fixes the board-table defect visible when a column action menu is opened near the right edge of the horizontally scrollable table. The menu used to be absolutely positioned inside `.board-table-scroll`; because that container must use `overflow:auto`, the browser clipped the popover into the table viewport, leaving only a partial rounded panel beneath the last visible column. Column action menus are now viewport-anchored floating menus whose position is calculated from the triggering header, constrained to the current viewport, flipped above the trigger when there is insufficient room below, and closed when the table scrolls. The menu remains part of the existing board event architecture, so Filter, Sort, Wrap, Duplicate, Add to the right, Change type, Hide, and Delete retain their established behavior.

Additional safeguards close other open column menus, dismiss the menu on outside interaction or Escape, close it before launching dialogs/actions, keep the menu below modal overlays, and avoid a one-frame jump by keeping it hidden until its final position has been calculated. The right-side Add Column header is now a compact sticky affordance, while row actions remain independently sticky, reducing wasted horizontal space and keeping critical controls reachable when boards contain many columns. Mobile continues to use the existing bottom-sheet presentation. No Supabase migration is required when upgrading from v1.21.1.

## v1.21.1 — explicit column deletion and preference cleanup

Board column deletion is now surfaced directly in each custom column's contextual actions as well as **Manage columns**. The deletion workflow reports how many populated cells will be removed, requires acknowledgement when data would be destroyed, deletes the normalized custom-column schema and its values through the existing server-authorized `wm_delete_board_column()` RPC, and automatically removes stale per-user filter/sort/wrap references to the deleted column. Core columns remain protected because they map to the board's stable item contract; they can still be renamed or hidden where supported. No new Supabase migration is required when upgrading from v1.21.0.


## v1.21.0 — contextual column workflows and personal board views

The Boards workspace now includes a context-sensitive column workflow inspired by the supplied references while retaining Work Management's own design system and cloud architecture. Each visible table column exposes focused actions for filtering, sorting, text wrapping, duplication, inserting a new column immediately to the right, changing a custom column's type, and hiding optional columns. These operations are integrated with server-side board authorization and the normalized v1.20 schema rather than being cosmetic client-only controls.

### Practical board improvements

- Per-column **Filter** controls with account-specific persistence.
- Ascending/descending **Sort** by any visible column, including custom typed values.
- Per-column **Wrap text / Unwrap text** presentation preference.
- **Duplicate column** with either schema only or schema + current cell values.
- **Add column to the right** of the selected column while maintaining authoritative column positions.
- **Change column type** for custom columns with explicit data-loss safeguards; incompatible existing values must be intentionally cleared before conversion.
- **Hide column** directly from the header menu while preserving values and schema.
- **Reset column view** to clear personal filters/sort settings without changing shared board data.
- Existing Manage Columns, direct typed cell editing, Table/Kanban, drag-and-drop, item editing, memberships, Activity, archive/trash, and cloud synchronization remain intact.

### Personal view-state architecture

Board members now have a server-backed `preferences` document. Sorting, column filters, and wrapped-column choices are validated against the current board schema and stored per authenticated account. This keeps shared work records unchanged while allowing each member to organize the same board differently across browsers, refreshes, and sessions. Invalid/deleted column references are sanitized server-side.

### Column mutation safeguards

New protected RPCs support positional insertion, duplication, safe type conversion, and account-specific preferences. Core columns retain their established authoritative mappings and cannot change type. Column duplication can copy core/custom values into a new custom column. Type changes that would make existing values incompatible are rejected unless the user explicitly chooses to clear those values. All operations re-check board permissions inside PostgreSQL.

### Required database migration

Existing v1.20.0 deployments must run:

`supabase/migrations/v1.21.0-board-productivity.sql`

If upgrading from an older release without Boards, apply the v1.18.0, v1.19.0, v1.20.0, and v1.21.0 migrations in order. New deployments can use the complete `supabase/schema.sql`.

---

## v1.20.0 — flexible board columns and typed schema management

Work Boards now support a database-backed column schema instead of a fixed visual set of Item / Status / Assignee / Due fields. Existing boards are migrated automatically to explicit core-column definitions, and new boards receive the same schema on creation. Column labels are presentation metadata, so core columns can be renamed without breaking the underlying item data contract.

### Column workflows

- Add columns from an accessible searchable type picker.
- Rename existing core or custom columns with case-insensitive duplicate-name validation.
- Show/hide columns in Table view; the required Item column remains visible.
- Reorder columns from the Manage Columns workflow.
- Delete custom columns with explicit confirmation; core columns are protected from deletion.
- Duplicate boards with their column definitions and custom item values intact.
- Search board items across core and custom column values.
- Edit typed cells directly from the table while retaining the existing full-item editor and Kanban workflows.

Supported custom types are **Text, Long text, Number, Status, Dropdown, Date, People, Checkbox, Timeline, Email, and Link**. Status/Dropdown options are validated and stored as column configuration. People values must reference an active member of the current board. Date ranges, URLs, email addresses, numbers, booleans, text lengths, and choice membership are validated again inside PostgreSQL before persistence.

### Data architecture

The migration adds normalized `work_board_columns` and `work_board_item_values` tables. Existing core item fields remain in `work_board_items` for compatibility with Table/Kanban and established workflows; `wm_set_board_cell()` maps core schema columns to those authoritative fields and stores only custom values in the typed value table. Browser clients retain no direct table privileges. All schema and cell mutations run through protected RPCs that re-check the authenticated user's board edit permission.

Column names are unique per board case-insensitively, boards are limited to 30 columns, custom column values cascade safely when a custom column is deleted, and option changes are blocked when they would invalidate existing saved values.

### Required database migration

Existing v1.19.0 deployments must run:

`supabase/migrations/v1.20.0-board-columns.sql`

If upgrading from v1.17.9 and the board migrations have not been installed yet, apply v1.18.0, v1.19.0, then v1.20.0 in order. New deployments can run the complete `supabase/schema.sql`.

---

## v1.19.0 — native collaborative Work Boards

The uploaded workspace/board references were evaluated as interaction patterns rather than copied directly. The concepts that fit Work Management are now implemented as a native, authenticated **Boards** workspace alongside TimeTracker, FuelTrack+, and TradeLink.

### Implemented board workflows

- New **Boards** route in the persistent Work Management navigation and command palette.
- Create boards with a name and description; every board starts with a usable default group.
- Shared board membership with **Owner / Editor / Viewer** permissions enforced by PostgreSQL, not by hidden client controls alone.
- Board list views for **Boards / Archived / Trash**, including search, restore, archive, duplicate, trash, and permanent-delete safeguards.
- Table and Kanban board views. The selected view is persisted per authenticated board member.
- Groups and work items with title, status, assignee, due date, notes, ordering, and archive/restore state.
- Drag-and-drop item movement in Table/Kanban, with non-drag Edit controls providing the keyboard-accessible equivalent for changing group or status.
- Search and status filtering without remounting the Work Management shell.
- Member management by existing Work Management account email.
- Append-only board Activity history for board, group, item, and membership operations.
- Loading, empty, error, retry, confirmation, responsive, dark/light theme, and reduced-motion states.
- Server-authored workspace ownership and board authorization suitable for cross-device and multi-account use.

### Architecture

Boards use normalized Supabase tables rather than browser-local state or one large client JSON object:

`work_boards` → `work_board_members` → `work_board_groups` → `work_board_items`, with `work_board_events` for operational traceability.

Direct table privileges are not granted to browser clients. The Work Management frontend calls protected RPCs using the authenticated Supabase session; every RPC resolves `auth.uid()`, current workspace membership, and board membership/role before reading or mutating data. Platform Admin/General Manager retains workspace-wide administrative access.

### Reference-derived concepts intentionally adapted

The reference images demonstrate board creation, table-style work organization, contextual menus, invite/member management, view switching, archive/trash, restore, and action menus. Work Management adopts these underlying workflows while using its own design system and existing shell. Dashboard/analytics views were intentionally not introduced. Destructive audit-log deletion was also avoided; board Activity is append-only.

### Required database migration

If upgrading directly from the previously delivered **v1.17.9**, run these migrations in order:

1. `supabase/migrations/v1.18.0-activity-triage-workspace.sql`
2. `supabase/migrations/v1.19.0-work-boards.sql`

If v1.18.0 has already been applied, only the v1.19.0 migration is required before using the Boards route. New deployments can use the updated `supabase/schema.sql`.

---

## v1.18.0 — Activity triage workspace and contextual operations

The uploaded reference interactions were evaluated as patterns rather than copied directly. Their strongest fit for FuelTrack+ Activity is a personal triage layer: view switching, contextual action menus, multi-select operations, and reversible archiving. A destructive Trash workflow was deliberately not added because FuelTrack+ Activity is an append-only audit record and deleting audit events would undermine traceability.

FuelTrack+ Activity now provides **Timeline** and **Archived** views, per-event **More** menus, personal **Archive for me / Restore to Timeline** actions, and multi-select bulk archive/restore. Archive state is stored in the authenticated user's cloud workspace (`fueltrackplus.activity.workspace.v1`) and does not modify, hide, or delete the shared Supabase Activity audit stream for other authorized accounts. Existing search, actor/type/date/linkage filters, refresh/retry, pagination, details, request navigation, copying, and PDF export remain intact.

### Required database migration

Existing deployments should run:

`supabase/migrations/v1.18.0-activity-triage-workspace.sql`

The migration only registers the new **user-scoped** Activity workspace state key. It does not alter or migrate the append-only Activity event table. New deployments can use the updated `supabase/schema.sql`.

## v1.17.9 — theme-aware launcher controls

This maintenance release fixes launcher controls that inverted foreground/background tokens on card hover, which made the module launch affordance appear correct under one palette but incorrect under the other. Work Management now uses semantic control tokens for neutral controls, success states, selected favorites, and module accent surfaces, with explicit light/dark/system overrides. Native browser control color-scheme is also synchronized with the selected Work Management theme. The launcher arrow remains a stable neutral action in both themes instead of switching to `--ink`/`--bg` inversion.

No Supabase migration is required for this release.

## v1.17.9 — viewport-stable sidebar and scroll containment

This maintenance release replaces the desktop/tablet sticky sidebar with a viewport-owned fixed navigation rail. The previous `position: sticky` implementation could lose its sticky behavior because `body { overflow-x: hidden }` creates an overflow ancestor in modern browsers; on long pages the sidebar then scrolled with the document and appeared to shrink or end part-way down the viewport. The new shell keeps structural navigation outside the page scroll flow, gives the workspace an explicit sidebar offset, uses `overflow-x: clip` instead of hidden overflow, and provides an independently scrollable navigation region for short viewports. Tablet and mobile breakpoints now use explicit width/offset contracts and safe-area-aware bottom navigation.

## v1.17.9 — Activity workflow reliability and interaction stabilization

This maintenance release performs a focused Activity workspace hardening pass. FuelTrack+ now avoids same-route remounts, removes content-wide route translation, uses stable delegated Activity event handling, unifies manual/automatic cloud refresh state, distinguishes empty-stream vs no-match states, disambiguates same-name actors, and fixes Activity detail dialog action duplication. No Supabase migration is required from v1.17.6.

## v1.17.6 — scoped motion and UI rendering stability

This release removes document/root View Transition animation from Work Management and scopes motion to leaf controls and replaceable content regions. Persistent shell structures—the sidebar, top bar, workspace, module chrome, and base layout—remain dimensionally and visually stable during navigation and state changes. Module iframes now fade in without scale transforms, scrollbar width is permanently reserved, structural backdrop blur is removed from the sticky shell header, and reduced-motion behavior remains supported.

No Supabase migration is required when upgrading from v1.17.4.

## v1.17.4 — registration and email-verification lifecycle repair

This release hardens the complete Supabase email-confirmation flow for the GitHub Pages deployment. It adds a dedicated verification state machine, authoritative confirmation checks, callback recovery, profile-hydration retries, explicit expired/invalid/already-used handling, and a durable projection of `auth.users.email_confirmed_at` into `public.profiles.email_verified_at`.

### Required database migration

Existing v1.17.3 deployments should run:

`supabase/migrations/v1.17.4-auth-verification-lifecycle.sql`

New projects can run the complete `supabase/schema.sql`.

### Required Supabase Auth URL configuration

Set **Authentication → URL Configuration → Site URL** to the exact production GitHub Pages base URL, including the trailing slash. Add the same URL to **Redirect URLs**. The application now normalizes `index.html` and nested routes back to the deployment base before asking Supabase to send a confirmation callback.

### Recommended Confirm signup email template

For the most reliable static-site flow, configure **Authentication → Email Templates → Confirm signup** so the confirmation link returns the token hash to Work Management instead of consuming the one-time token before the application loads:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email&verify_mode=confirm">
  Confirm email address
</a>
```

The `verify_mode=confirm` parameter intentionally presents a user-confirmation screen before Work Management submits the token to Supabase. This reduces accidental token consumption by email link preview/security scanners. The application also remains compatible with Supabase's standard implicit-session redirect and direct `token_hash` callback forms.

Disable link tracking/rewriting in a custom SMTP provider for authentication emails, because rewritten verification URLs can invalidate the confirmation flow.

### Verification behavior

The application now handles:

- valid confirmation links with or without an immediately returned session;
- explicit confirmation mode for scanner-resistant email links;
- Supabase implicit-session callbacks;
- expired OTPs/tokens;
- malformed callbacks;
- already-consumed links;
- callback URLs that return without a token/session;
- profile/RBAC hydration races after verification;
- resend-confirmation cooldown and recovery;
- authoritative `email_confirmed_at` validation before considering a callback complete.

---

## v1.17.3 — transactional TimeTracker attendance lifecycle

This release replaces the remaining lease-based Clock In/Clock Out concurrency path with a server-transactional attendance workflow. The recurring symptom was a Clock In request being rejected with “another attendance operation is still finalizing” even though the current account had no active record and the Log was empty. Earlier releases shortened and retried the distributed lease, but the architectural weakness remained: an attendance action could still be blocked by an orphaned/unreleased lease row until its TTL elapsed after navigation, a failed release request, browser termination, authentication changes, or network interruption.

Clock In and Clock Out no longer acquire `attendance-action:*` lease rows. They now call the protected Supabase RPC `commit_timetracker_attendance_action()`. PostgreSQL takes a transaction-scoped advisory lock for the workspace/account, reads and validates the authoritative attendance row inside that same transaction, verifies whether an active session actually exists, applies exactly one lifecycle transition, maintains the recovery copy, and commits the new revision atomically. PostgreSQL releases the advisory lock automatically when the transaction ends, including on errors, so there is no stale client lock that can survive a refresh or abandoned browser request.

A second root cause was also removed: the legacy TimeTracker startup path still called `migrateRecordOwnership()`, which assigned every ownerless attendance record to whichever authenticated account opened the module first. In a shared cloud workspace an old ownerless active record could therefore become the current user's active shift even though that user never clocked in. Client-side ownership claiming has been removed. The migration preserves such historical rows using deterministic `legacy:unassigned:*` ownership markers so they remain auditable without being associated with a real account.

### Required database migration

Existing v1.17.0-v1.17.2 deployments must run:

`supabase/migrations/v1.17.3-transactional-attendance.sql`

in the Supabase SQL Editor before deploying the v1.17.3 application files. New projects can run the complete `supabase/schema.sql`.

The migration also deletes any obsolete `attendance-action:*` lease rows left by prior releases. Distributed operation locks remain available only for independent background/recovery operations such as automatic clock-out and GPS recovery where a short expiring lease remains appropriate.

### Clock In / Clock Out behavior

- GPS acquisition happens before the database transaction and cannot hold an attendance concurrency boundary.
- The server derives the authenticated account and workspace; the module never supplies or trusts another account identity.
- Clock In is rejected server-side if that authenticated account already has an active shift.
- Clock Out is rejected server-side if no active shift exists or if the requested active record changed in another session.
- The authoritative server timestamp is used for the committed Clock In/Clock Out timestamp.
- Record ownership, account identity, and active-session uniqueness are enforced inside PostgreSQL.
- Ownerless legacy attendance rows are quarantined as `legacy:unassigned:*` instead of being claimed by the first user to open TimeTracker.
- The module does not create a speculative attendance record before Supabase accepts the operation.
- The returned authoritative state immediately replaces the module's in-memory attendance state.
- Recovery copies remain explicit recovery material and are never automatically promoted into runtime authority.
- TimeTracker OT initialization was corrected to follow the same primary-only hydration rule, eliminating another stale-backup resurrection path.

FuelTrack+ Activity, TradeLink, authentication, Work Management RBAC, shared workspace persistence, and the v1.17 append-only Activity architecture remain intact. A missing `autoGpsFailure()` recovery helper discovered by the runtime suite was also restored so launch-time automatic clock-out GPS recovery cannot fail with a `ReferenceError`. Cloud bridge/store assets are now also network-first in the service worker so GitHub Pages cannot retain an older attendance transaction client after a shell upgrade.


## v1.17.1 — Activity reliability and interaction hardening

This maintenance release re-evaluates the FuelTrack+ Activity workspace and hardens its live-state behavior without changing the v1.17 database contract. Activity now has route-scoped automatic cloud refresh, explicit synchronization status, preserved scroll/search context during live updates, serialized refresh requests, safer loading/retry states, broader audit search coverage (event ID, actor email/role, request ID and structured payload), resilient invalid-timestamp rendering, debounced cloud persistence for per-account filters, keyboard `/` search focus, and stronger responsive/focus feedback. Activity remains Admin-only and append-only.

TimeTracker attendance lock handling was also hardened after observing transient lock-collision feedback during normal cloud operation. The attendance action lease is shorter, acquisition performs one bounded retry to absorb a just-released lease, lock release retries safely, and a collision forces an authoritative cloud-state refresh before asking the user to retry. This keeps duplicate Clock In/Clock Out protection while reducing false/stale lock experiences after tab or network timing races.

No new Supabase migration is required when upgrading from v1.17.0; the existing `v1.17.0-state-contract-and-activity.sql` contract remains authoritative.


## v1.17.0 — durable cloud state contract and Activity audit stream

This release addresses the cloud persistence error `state key is not valid for module` and strengthens shared, account-aware data synchronization across TimeTracker, FuelTrack+, and TradeLink. The failure was caused by the v1.16 server-side state-key validator relying on escaped regular-expression patterns; valid application keys could be rejected depending on how the migration text was interpreted. v1.17 replaces regex-only validation with an explicit database policy registry.

### Required database migration

Existing v1.16.0 deployments must run:

`supabase/migrations/v1.17.0-state-contract-and-activity.sql`

in the Supabase SQL Editor **before** deploying the v1.17 application files. New projects can run the complete `supabase/schema.sql`.

The migration is idempotent and preserves existing module state. It registers the exact/prefix state keys used by all three applications, enforces the intended user/shared scope and payload limit for each key, and keeps Work Management/Supabase as the authorization boundary.

### Permanent state-key fix

- Replaces regex-only `module_state_key_allowed()` logic with `module_state_key_policies`.
- Supports exact and controlled prefix policies for registered state such as TradeLink vendor assets; obsolete TimeTracker state-shaped lock keys are explicitly non-writable.
- Enforces the expected state scope (`shared` or `user`) on the server.
- Rejects obsolete module-local RBAC/activity aggregate writes that are no longer authoritative.
- Adds server-side data-shape invariants for unique attendance/request IDs and prevents more than one active TimeTracker session per account.
- Replaces state-shaped TimeTracker operation locks with expiring PostgreSQL distributed locks so parallel tabs/devices cannot race automatic clock-out or GPS recovery.
- Converts low-level schema/scope errors into actionable module recovery guidance.

### FuelTrack+ Activity re-architecture

FuelTrack+ Activity is now an append-only server audit stream (`module_activity_events`) rather than a replaceable JSON array. The server records the authenticated actor identity, module role, sequence and timestamp. Clients cannot rewrite or truncate existing audit history.

Critical request operations now use the atomic `commit_fueltrack_requests_with_activity()` RPC. Request state and its Activity event commit in the same PostgreSQL transaction, including request creation/submission, workflow transitions, refueling completion and deletion. A failure rolls the entire operation back; a retry with the same event ID is idempotent.

Activity improvements include:

- server-authoritative actor identity and timestamps;
- stable event sequencing and request linkage;
- append-only history with no 250-event destructive cap;
- manual cloud refresh plus automatic focus/reconnect refresh;
- persistent per-account Activity filters;
- search focus/caret preservation during live filtering;
- robust invalid-timestamp handling;
- richer event details including account ID, email, role and sequence;
- clear append-only/shared-audit status in the interface;
- a dedicated retry/recovery state if the Activity stream is temporarily unavailable, without blocking the rest of FuelTrack+;
- Workspace Backup v3 support for exporting/importing Activity through a protected Admin-only RPC instead of rewriting the obsolete aggregate state key.

### Shared multi-account data integrity

The v1.16 workspace model remains the common data source for TimeTracker, FuelTrack+, and TradeLink. Shared operational state is stored under a workspace and synchronized across authorized accounts, browsers, devices, refreshes and sessions. Per-user UI/preferences remain account scoped.

Optimistic revisions continue to prevent silent stale writes. Generic collection state retains conflict-aware recovery, while FuelTrack+ request/activity transactions intentionally do **not** perform an unsafe automatic array union on conflicts; the latest cloud revision is loaded and the user is asked to review/retry, avoiding deleted or transitioned requests being resurrected by a stale client.

TimeTracker attendance/OT and TradeLink committed document state continue to use the shared workspace source with server-side module authorization and record visibility rules. Critical TimeTracker Clock In/Clock Out writes now await confirmed cloud persistence and roll back the visible attendance mutation if Supabase rejects the commit. Automatic clock-out and GPS recovery use expiring database locks. The state-key registry covers every supported persistent runtime key, including TradeLink vendor logo/QR prefixes.

### Deployment order

1. Back up the current workspace if required.
2. Run `supabase/migrations/v1.17.0-state-contract-and-activity.sql`.
3. Deploy Work Management v1.17.1 to GitHub Pages.
4. Sign in and use **Settings → Platform Verification**.
5. Open TimeTracker, FuelTrack+ and TradeLink once to hydrate their cloud state.
6. In FuelTrack+ Activity, use **Refresh** to verify the append-only audit stream is accessible to the Admin role.


## v1.15.0 — authenticated cloud application runtime

TimeTracker, FuelTrack+, and TradeLink no longer use browser-local application persistence or local-development runtime fallbacks. All three modules now boot only through an authenticated Work Management session and persist operational state through protected Supabase RPCs.

### Cloud runtime architecture

- Added `public.module_state_entries` for shared and per-user module state.
- Added protected `list_module_state()`, `put_module_state()`, and `delete_module_state()` RPCs.
- Module runtimes never receive Supabase access/refresh tokens or database credentials; cloud operations are brokered by the authenticated Work Management parent shell.
- TimeTracker, FuelTrack+, and TradeLink hydrate their state from Supabase before application code starts.
- Runtime writes are optimistic in memory and immediately queued to Supabase; failures surface a persistent in-app cloud-persistence warning.
- Shared operational records synchronize across authenticated sessions/devices through periodic cloud refresh. UI/draft preferences use user-scoped cloud rows.
- Direct standalone module execution is no longer supported. Modules require the Work Management identity handshake and authorization boundary.
- Module runtime assets are no longer served from an offline fallback cache; an active network/backend path is required.
- FuelTrack+ no longer bootstraps a synthetic Local Workspace Admin or runs legacy mock-data cleanup. Its current role comes from Work Management cloud identity.
- TradeLink no longer persists `currentUser` in shared state; current identity is injected from the authenticated account on every launch.
- TimeTracker no longer creates a synthetic Local Administrator; the active Work Management account is the current TimeTracker principal.

### Existing-data migration

Before upgrading a browser that contains v1.14.x local module data, export a **Workspace Backup** from the older build. v1.15.0 backup restore accepts the older backup format and converts registered TimeTracker/FuelTrack+/TradeLink keys into authenticated Supabase module state. This preserves data without retaining local-runtime migration code inside the modules.

### Required database migration

Existing Supabase deployments must run:

`supabase/migrations/v1.15.0-cloud-module-state.sql`

Run it after the existing v1.14.2 RBAC reconciliation. New Supabase projects can run the complete `supabase/schema.sql`.

Authenticated account-based Work Management platform with TimeTracker v1.8.7, FuelTrack+ v3.17.0, and TradeLink v1.42.0.


## v1.14.x — platform RBAC, user management, and registration protection

Work Management now has a server-enforced platform RBAC model with four supported account roles: **Admin/General Manager**, **HR**, **Supervisor**, and **Employee**. New registrations default to **Employee**. The known first account, `lmsenagan@watchdogautomation.com.ph`, is bootstrapped as **Admin/General Manager** inside the Supabase database trigger/migration rather than through client-side state.

### Authorization and user administration

- Added an Admin-only **Users** route and navigation entry for account directory management.
- Role and account-status changes execute through protected Supabase RPCs guarded by PostgreSQL/RLS authorization.
- Added last-active-admin protection, self-disable protection, and bootstrap-admin protection.
- Platform roles synchronize into the existing module-role assignments so authenticated identity propagates consistently into TimeTracker, FuelTrack+, and TradeLink.
- Employee is the least-privilege default for every new registered account.
- Account and module access remains session-backed and reloaded from Supabase after refresh/sign-in rather than trusting client-only role state.

### Registration reliability

- Added persistent signup and confirmation-resend cooldown guards.
- Duplicate form submissions remain blocked while a request is in flight.
- Rate-limit responses are classified explicitly; Work Management does not automatically retry email-producing Auth calls.
- Registration preserves only safe non-password draft fields after an error. Passwords are never persisted.
- Rate-limited users receive actionable guidance instead of repeatedly hitting Supabase Auth. Production deployments should configure Custom SMTP for normal company registration/verification traffic.

### Upgrade

Existing Supabase projects should run `supabase/migrations/v1.14.2-rbac-reconciliation.sql` before deploying this build. New projects should run the complete `supabase/schema.sql`.

## v1.13.0 — authenticated account architecture

Work Management now requires an authenticated Supabase account before any shell route or integrated application can be used. The previous local-only fallback has been removed. When backend configuration is missing, the app remains on the authentication setup screen rather than exposing the workspace.

### Identity and session architecture

- Dedicated Login/Register entry flow with protected-route redirection and intended-route restoration.
- Persistent Supabase access/refresh sessions with startup restoration, proactive token refresh, timeout handling, focus/visibility revalidation, cross-tab synchronization, and explicit invalid-session recovery.
- Local sign-out and global session revocation controls. Authentication tokens are removed locally before remote logout is attempted.
- Disabled-account handling blocks the entire workspace and all module access.
- Account page now supports display-name updates, password changes, access-role refresh, module-role visibility, session expiry display, local logout, and global logout.
- Password changes force global session termination and require a new login.
- Workspace Backup excludes both authentication tokens and derived identity-context data.

### Module identity propagation

A token-free identity bridge (`assets/js/core/module-identity-bridge.ts`) propagates the authenticated user identity and assigned module role into TimeTracker, FuelTrack+, and TradeLink before each module runtime starts. Integrated module wrappers refuse to boot when no authorized Work Management identity exists. Access/refresh tokens are never exposed to module runtimes.

- TimeTracker maps the cloud account into `timetracker.rbac.v1`.
- FuelTrack+ maps the cloud account into its preference/user-role model.
- TradeLink maps the cloud identity into `currentUser` while preserving its fixed quotation reviewer/final-approver authorization rules.

### Supabase migration

Existing v1.12.x deployments must run `supabase/migrations/v1.13.0-account-architecture.sql`. New deployments can run the complete `supabase/schema.sql`. The migration adds self-service display-name updates while keeping platform role and module-role administration protected by RLS/admin policies.


Unified Work Management shell with TimeTracker v1.8.7, FuelTrack+ v3.17.0, and TradeLink v1.42.0.

## v1.11.0 — TradeLink v1.42.0 integration

TradeLink v1.42.0 is now registered as the third production application. The supplied TradeLink package was reviewed as a dependency-free local-first commercial-document workflow system and integrated behind the same same-origin module boundary used by the existing applications. Its document lifecycle, approval routing, validation, company/template behavior, PDF generation, audit trail, recovery, and persistence remain module-owned.

### Integration changes

- Added TradeLink to the application launcher, command palette, favorites, recent applications, diagnostics, and compatibility verification.
- Preserved the authoritative TradeLink v1.42.0 source and added a cache-coherent `runtime.html` with integration-versioned JS/CSS/button assets.
- Registered committed TradeLink state/backup storage and the six company logo/QR asset keys with Workspace Backup/Restore.
- Added raw-image validation so malformed non-image values cannot be restored into TradeLink vendor asset storage.
- Added non-destructive launcher telemetry for total commercial documents and documents awaiting workflow action.
- Added TradeLink-specific offline fallback and precaching for its runtime, logos, and reference PDF templates.
- Preserved the v1.42.0 Quotation approval workflow: Angelica Anne Camille Señagan is the predefined Sales Supervisor reviewer where required, Alex P. Señagan is General Manager/final approver, and approval marks are captured through **Use Time Now** timestamps. No email approval/notification workflow is introduced.
- Added `verify-tradelink-integration.mjs` and retained TradeLink's own `verify-release.sh` / `verify-v142.sh` in the project verification pipeline.
- Existing TimeTracker and FuelTrack+ integrations remain intact.

See `apps/tradelink/INTEGRATION.md` for the technical review, data-flow boundary, persistence contract, cache strategy, and approval-workflow preservation details.

## v1.10.2 — FuelTrack+ Roles visibility and cache-coherency repair

This release restores the Admin-only **Roles** navigation entry and hardens the FuelTrack+ module launch path against mixed-version browser caches. The supplied FuelTrack+ v3.17.0 source already contains Role Management in its HTML and runtime authorization logic; the observed omission was caused by a stale cached `app.js` being able to execute against a newer module document. In that mixed state, the older RBAC table did not recognize `route.roles`, so the new Roles button was hidden even though the visible account badge resolved to Admin.

The integrated runtime now launches through `apps/fueltrack-plus/runtime.html` and immutable integration-versioned JS/CSS asset names. The service worker precaches those exact assets and uses a network-first path for the versioned FuelTrack+ runtime files with offline cache fallback. This prevents an older FuelTrack+ script from being paired with a newer navigation document after a Work Management upgrade.

FuelTrack+ configuration metadata was also normalized so `Roles` is represented in the module list, accessibility scope, and Admin route/permission metadata. The original supplied configuration remains preserved as `fueltrack.config.source.json` for package provenance.

## v1.10.0 — FuelTrack+ v3.17.0 integration

FuelTrack+ has been upgraded from v3.16.2 to the supplied v3.17.0 package. The update preserves the existing request, approval, analytics, LightFuels, activity, export, auto-refresh, and Local Workspace behavior while adding FuelTrack+'s new Admin-only per-user Role Management controller.

### Integration changes

- Replaced the embedded FuelTrack+ v3.16.2 source files with the supplied v3.17.0 runtime.
- Registered the new `fueltrackplus.userroles.v3` JSON persistence key with the Work Management module contract.
- Workspace Backup/Restore now includes the persisted FuelTrack+ role directory automatically through the module allowlist.
- Updated launcher metadata to advertise Role Management as a FuelTrack+ capability.
- Preserved the raw `fueltrackplus.migration.realdata.v3.1` marker validation.
- Updated compatibility verification and diagnostics through the expanded storage contract.
- Added dedicated Role Management regression verification for Admin-only access, per-user persistence, Local Workspace Admin protection, final-Admin protection, and Activity logging.
- Updated FuelTrack+ source-regression hashes to the supplied v3.17.0 package.
- TimeTracker v1.8.7 and all Work Management shell behavior remain unchanged.

See `apps/fueltrack-plus/INTEGRATION.md` for the package review, data-flow boundary, persistence contract, and role-management integration details.

## v1.9.0 — TimeTracker launch reliability repair

This release addresses the reported `TimeTracker could not start` failure observed inside the Work Management module frame. The review identified a concrete launch-time defect in TimeTracker's automatic clock-out path: an overdue active attendance session declared `requiredWorkMs` but later referenced an undeclared `requiredWorkingMs` shorthand while constructing auto-clock-out state and audit metadata. When that policy path executed during startup, it raised a `ReferenceError` before the first UI render. Because the startup routine is asynchronous and was invoked without a rejection handler, the existing boot page only displayed a generic initialization failure.

### Corrections

- Corrected both auto-clock-out metadata assignments to use the declared `requiredWorkMs` value.
- Isolated launch-time attendance enforcement from the core UI mount so a policy/recovery exception cannot leave TimeTracker on a blank boot screen.
- Added a top-level startup rejection handler and explicit boot-state markers.
- Added `unhandledrejection` capture to the module boot page so asynchronous startup failures expose their actual error instead of the generic timeout message.
- Preserved existing attendance state and backup data on startup failure; the repair does not clear or reset TimeTracker storage.
- Added `verify-timetracker-startup.mjs` to prevent the undeclared-variable/startup-isolation regression from returning.
- FuelTrack+ v3.16.2 integration and Work Management shell behavior remain unchanged.

## v1.8.0 — FuelTrack+ v3.16.2 integration

FuelTrack+ v3.16.2 is now registered as the second production module. The supplied FuelTrack+ runtime is preserved byte-for-byte inside `apps/fueltrack-plus/` while Work Management provides launcher integration, module telemetry, backup/recovery registration, compatibility verification, diagnostics, offline precaching, and module-specific offline fallback.

### Integration safeguards

- FuelTrack+ business logic and internal state management remain owned by the module runtime.
- Work Management reads only a non-destructive request snapshot for launcher status; it does not mutate FuelTrack+ records.
- FuelTrack+ exact persistence keys are explicitly registered and isolated from `wm.platform.*` and `timetracker.*`.
- Backup/restore validates FuelTrack+ JSON entries and constrains the raw one-time migration marker to its known `done` value.
- Settings compatibility verification now validates every active registered application instead of being TimeTracker-specific.
- Platform diagnostics verify both active module runtimes.
- Service-worker precaching and offline navigation fallback now include FuelTrack+ without allowing a missing module navigation to fall through to the shell document.
- FuelTrack+ source checksums are validated by the project verifier to prevent accidental changes during shell maintenance.

See `apps/fueltrack-plus/INTEGRATION.md` for the package review, persistence contract, data-flow boundary, and integration notes.


## v1.7.0 — Interaction-boundary and click-routing hardening

This release fixes unintended animations and navigation caused by broad delegated click/pointer handling. Shell actions now resolve only to explicitly registered interactive controls, pointer-originated clicks must match the control captured on the corresponding pointerdown, nested controls inside launcher cards cannot accidentally activate their parent card, and feedback animations are scoped to validated action surfaces. The sidebar/workspace stacking contexts are also isolated so navigation hit areas cannot bleed into application content, and View Transition snapshots are non-interactive.

### Interaction safeguards

- Explicit action selector instead of broad `closest()` routing across arbitrary ancestors.
- Pointerdown/click target pairing for mouse/touch activation; keyboard/programmatic activation remains supported.
- Module-card nested-control guard prevents favorite or future embedded controls from bubbling into module launch.
- Ripple and press feedback runs only on registered interactive elements.
- Decorative application-card arrow is now a non-interactive visual element rather than a nested button.
- Sidebar and workspace use explicit stacking/isolation boundaries.
- View Transition pseudo-elements use `pointer-events: none` so animated snapshots cannot become interaction surfaces.
- Empty content regions in Applications and Settings remain inert.

### Regression behavior preserved

- Applications, Settings, command palette, favorites, module launching, reload, theme, density, persistence, diagnostics, backup/restore, and service-worker update controls retain their existing actions.
- Keyboard Enter/Space activation for module cards remains available.
- Reduced-motion behavior remains intact.
- TimeTracker v1.8.7 remains unchanged.

## v1.6.0 — Layout-stable navigation motion

This release removes the transient interface shrink observed while switching Work Management tabs. The route-level View Transition no longer scales the root snapshot, panel/card entrance animations no longer apply scale transforms, and the document reserves stable scrollbar gutter space so routes with different content heights cannot cause a horizontal viewport-width jump. Navigation remains animated through opacity and compositor-friendly translation only. TimeTracker remains unchanged.

## v1.5.0 — Motion and interaction system

This release introduces a platform-wide motion layer for the Work Management shell while preserving the isolated TimeTracker v1.8.7 runtime and all established Settings behavior.

### Motion architecture

- Added centralized motion timing/easing tokens so interactive components use a consistent animation vocabulary.
- Added View Transitions API support for route, state, and theme changes, with automatic fallback when the API is unavailable.
- Added staggered entrance motion for navigation, top bars, the application hero, launcher cards, Settings panels, diagnostics, and module chrome.
- Added pointer-responsive application-card tilt and contextual surface illumination for fine-pointer devices only.
- Added lightweight pointer ripple feedback for buttons and launcher surfaces.
- Added animated focus, hover, active/pressed, selection, and status-state feedback across shared controls.
- Added command-palette open/close motion and selected-result movement without changing its keyboard/focus behavior.
- Added module-frame loading transitions, loading sheen, loader feedback, iframe fade-in, and delayed-load error entrance behavior.
- Added toast and service-worker update-banner entrance/hover motion.
- Added animated storage-meter and diagnostics result disclosure in Settings.
- Added subtle live-status pulses for connection, platform-health, and active-session indicators.

### Performance and accessibility safeguards

- Motion uses compositor-friendly opacity and transform properties wherever possible.
- Pointer tilt only runs for fine-pointer devices and is skipped when reduced motion is requested.
- `prefers-reduced-motion: reduce` disables non-essential entrance, ambient, ripple, pulse, command, toast, and view-transition effects.
- No animation loop mutates application state or storage.
- TimeTracker source files remain byte-for-byte unchanged; its module boundary and existing internal motion behavior are preserved.
- Motion listeners use delegated event handling, avoiding per-component global listener growth as new modules are added.

### Verification

`verify-motion.mjs` statically validates required motion hooks, View Transition support markers, reduced-motion coverage, iframe-ready transitions, command closing behavior, and CSS brace integrity. The standard project verifier also continues to checksum the integrated TimeTracker source to prevent accidental regressions.

## v1.4.0 — Settings event-flow root-cause repair

The Settings controls were reworked after the non-theme actions were reported as visually correct but operationally inert in real browser use.

### Root cause addressed

The previous implementation routed every non-theme Settings command through one asynchronous delegated click handler and immediately rebuilt the entire Settings DOM before executing the requested operation. That made DOM-backed actions fragile, could invalidate the restore file picker, could consume browser transient user activation required by persistence/download flows, and made operation feedback dependent on nodes that were being replaced during the same click.

### Corrections

- Settings actions now receive direct listeners every time the Settings view is rendered; the generic shell click router no longer owns these commands.
- The Settings page is not rerendered before an operation executes. Buttons receive an in-place busy state and the view refreshes only after the operation settles.
- Browser persistence is invoked from the original user click before any render cycle can consume transient activation, and already-persisted state is detected explicitly.
- Backup restore uses a persistent file input mounted outside the replaceable application root, so selecting a file remains reliable across Settings rerenders.
- Backup export executes within the original click task, preserving browser download eligibility.
- Workspace spacing persists first, reads the saved normalized state back, then applies the density token.
- TimeTracker compatibility and platform verification retain their non-destructive diagnostics and now reliably surface results after completion.
- Reset Shell Preferences performs confirmation, persistence, state reload, theme/density application, launcher-filter cleanup, and final rerender without touching TimeTracker data.
- Busy-state feedback and duplicate-action guards remain in place without rebuilding the page mid-operation.


## v1.3.0 comprehensive verification and hardening release

This release preserves the existing modular shell and TimeTracker v1.8.7 behavior while fixing defects found in an end-to-end review and strengthening failure recovery, offline behavior, validation, diagnostics, and interaction reliability.

### Reliability and recovery

- Corrected TimeTracker launcher telemetry to read the current `timetracker.attendance.v1` persistence schema.
- Added validated workspace backup/export and restore/import for registered platform/module storage keys.
- Restore uses a strict module key allowlist and rolls back already-written keys if a write fails.
- Added browser storage health reporting and optional persistent-storage requests.
- Improved module loading with a delayed-load recovery panel, retry action, and standalone fallback.
- Reworked service-worker fetch handling so non-navigation asset failures no longer fall back to `index.html`.
- Added controlled service-worker update notification instead of silently replacing the running application.
- Added explicit online/offline platform state without reloading an active embedded module when connectivity changes.

### UX and workflow

- Added application search by name, description, category, and capabilities.
- Added favorites/pinning and persistent favorite state.
- Added recently opened applications with persistent recency tracking.
- Added compact/comfortable workspace density preference.
- Added install affordance when the browser exposes PWA installation.
- Added non-blocking toast feedback for backup, storage, connectivity, and install actions.
- Added platform connection status and live-session launcher telemetry.
- Improved empty/filter states and mobile responsiveness.

### Command palette and accessibility

- Fixed a major v1.0 behavior where opening/closing the command palette could re-render and reload TimeTracker.
- The palette is now mounted as an overlay without disturbing the current module runtime.
- Added Arrow Up/Down selection, Enter activation, Escape closing, focus restoration, and modal focus trapping.
- Added stronger `aria-pressed`, `aria-selected`, live-region, and keyboard behavior.

### Maintainability and scalability

- Added `assets/js/core/backup.ts` as a dedicated recovery concern.
- Expanded the module registry with current TimeTracker persistence keys and dynamic storage prefixes.
- Added platform versioning and preference normalization.
- Kept module persistence separate from `wm.platform.*` shell state.
- No TimeTracker business logic was rewritten for this release.

## TimeTracker integration model

TimeTracker v1.8.7 remains mounted through a same-origin module isolation boundary (`iframe`). This preserves its existing RBAC, attendance calculations, GPS/geolocation flows, audit history, overtime, reports, calendar, local recovery, UI state, and established behavior. Work Management owns the surrounding platform navigation and services only.

TimeTracker remains structurally isolated. v1.9.0 contains a targeted startup/auto-clock-out correctness patch in the integrated TimeTracker runtime; its remaining business logic, persistence model, UI, RBAC, GPS, OT, reporting, and calendar behavior are preserved.

## Install and run locally

Work Management v1.36+ uses Vite. Do not use `file://` or a generic static server as the primary development workflow.

```bash
cd Work-Management-App-v1.37.0
npm install
cp .env.example .env.local   # then set the public Supabase values
npm run dev
```

Vite serves the shell and the existing same-origin embedded module routes together. The development service worker is intentionally disabled so it cannot interfere with HMR or stale development assets.

Standard commands:

```bash
npm run dev          # development server
npm run build        # optimized production output in dist/
npm run preview      # local production-build preview
npm run release:check
```

The default `VITE_BASE_PATH=./` supports GitHub Pages/subdirectory deployment. Production source maps default to `hidden`; change `VITE_BUILD_SOURCEMAP` only when deployment policy requires a different mode.

## Backup behavior

Settings → Backup & Recovery can export a JSON workspace backup. The export includes:

- Work Management `wm.platform.*` data
- Registered TimeTracker storage keys and dynamic TimeTracker storage-prefix entries
- Registered FuelTrack+ storage keys
- Registered TradeLink committed state/backup keys and validated company logo/QR asset keys

Restore accepts only recognized Work Management backup files, rejects files larger than 25 MB, ignores unknown keys, asks for confirmation before overwrite, and attempts rollback if persistence fails during restoration.

Backup files contain application data and should be handled as potentially sensitive operational data.

## Data separation

Work Management shell state uses the `wm.platform.*` namespace. TimeTracker retains the `timetracker.*` namespace, FuelTrack+ retains the `fueltrackplus.*` namespace, while TradeLink retains its `tradelink_*` namespace. Resetting Work Management shell preferences does not delete registered module data.

## Adding another application

1. Place the module under `apps/<module-id>/`.
2. Add its metadata to `config/modules.ts`.
3. Give it a unique `id`, route, version, status, capabilities, and storage declaration.
4. Keep storage keys isolated from `wm.platform.*` and other modules.
5. Verify both embedded and standalone operation.
6. Add module-specific recovery keys/prefixes if workspace backup should include its data.
7. Mark it `active` only after verification passes.

## Verification

Run:

```bash
./verify-project.sh
```

The script validates required files, JavaScript syntax, the application manifest, service-worker release markers, registered module storage mappings, all three module runtimes, every historical regression verifier, TimeTracker and TradeLink release checks, and the v1.27.0 headless-Chromium integration suite for routing, modal focus, iframe lifecycle, Board drag/drop, and Item Workspace race/accessibility behavior.


## v1.3.0 additional hardening

- Fixed module-card keyboard handling so activating the nested favorite button no longer opens the application accidentally.
- Fixed module reload monitoring so every reload has loading/error recovery, not only the initial iframe load.
- Added module offline precaching for TimeTracker index, styles, and runtime JavaScript.
- Fixed offline navigation fallback so a missing TimeTracker route cannot incorrectly render the Work Management shell inside the module frame.
- Hardened preference normalization against malformed types, invalid themes, invalid recency timestamps, and duplicates.
- Hardened backup import by rejecting malformed JSON-serialized platform/module entries before they can overwrite application state.
- Tightened the TimeTracker auto-clockout lock registration from a broad prefix to the exact storage key.
- Added platform diagnostics for storage, registry integrity, and active-module runtime availability.
- Prevented a dismissed service-worker update banner from immediately reappearing during the same session.
- Preserved the original TimeTracker v1.8.7 runtime files byte-for-byte.

## v1.3.0 — Settings functionality repair

This release repairs the Settings controls reported as non-functional while preserving the existing Interface Theme behavior and the isolated TimeTracker v1.8.7 runtime.

- Workspace Spacing now uses a single guarded action pipeline, persists through `wm.platform.preferences.v1`, reapplies the density token immediately, and reports the saved mode.
- TimeTracker Compatibility is now an executable, non-destructive verification that checks module metadata, the registered storage contract, runtime availability, and safe data reads.
- Browser Persistence now reports API support explicitly, can refresh storage/quota state, requests persistent storage directly from the user action, and distinguishes granted, denied, and unsupported outcomes.
- Platform Verification now runs guarded diagnostics with busy-state protection and visible check results.
- Workspace Backup export/restore is wired through the same settings action layer; restore keeps the file input alive until selection, validates and whitelists data, and rolls back partial writes.
- Reset Shell Preferences no longer depends on `structuredClone`; it rebuilds safe defaults, validates the storage write, reapplies theme/density, resets launcher-only transient filters, and preserves TimeTracker data.
- Toast notifications now live outside the rerendered application root so Settings rerenders cannot destroy operation feedback.
- Settings buttons use explicit `type="button"`, action-level busy guards, and error trapping to prevent duplicate execution and silent failures.


## v1.12.1 — Authentication confirmation and sign-in recovery

- Fixed the failed-login busy-state deadlock that left **Sign in** permanently disabled after an authentication error.
- Added explicit handling for Supabase `email_not_confirmed` responses with a **Resend confirmation email** action.
- Added support for both Supabase implicit confirmation callbacks (`#access_token=...`) and static-client `?token_hash=...&type=...` confirmation callbacks.
- Authentication callback errors and confirmation success are surfaced in the login UI.
- Work Management authentication runtime/config assets now use network-first service-worker handling with cached offline fallback to reduce mixed-version/stale-auth deployments on GitHub Pages.
- Existing TimeTracker, FuelTrack+, TradeLink, shell persistence, backups, motion, and interaction behavior remain unchanged.

## v1.12.0 — Cloud identity foundation

Work Management now includes an optional Supabase backend adapter compatible with GitHub Pages. When configured it provides login, registration, persisted sessions, cloud user profiles, platform roles, per-module role mappings, shell-level module authorization, account UI, and cloud diagnostics. The Vite build reads the public Supabase URL and publishable key from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; the checked-in backend config remains only a compatibility fallback. Privileged keys must never be placed in the browser build.

Security boundaries:
- only the Supabase URL and `sb_publishable_...` key may be present in the client;
- `sb_secret_*`, service-role keys, database passwords and SMTP credentials are forbidden from the client;
- Row Level Security is required on exposed tables;
- workspace backups exclude `wm.platform.auth.*` session tokens;
- application operational data remains local-first in this release; this foundation deliberately avoids a risky one-step migration of TimeTracker, FuelTrack+, or TradeLink business state.

See `supabase/README.md` and `supabase/schema.sql` for deployment steps.
