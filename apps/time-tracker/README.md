# TimeTracker Attendance v2.0.0 — Presentation Reconstruction

## v2.0.0 — Parallax reconstruction, Pass 1

This pass establishes the TimeTracker v2 presentation architecture while preserving the existing attendance, GPS, OT, RBAC, reporting, calendar and cloud-persistence behavior.

Implemented in Pass 1:

- Dedicated v2 design tokens, light/dark surfaces and depth hierarchy.
- Compact persistent navigation rail with responsive horizontal collapse.
- Stable layered application header and environmental background plane.
- Compositor-friendly pointer/scroll parallax runtime with IntersectionObserver reveals.
- Complete reduced-motion and coarse-pointer fallback.
- Flagship Clock reconstruction with spatial state console, context plane, live clock plane, GPS evidence surface and workday timeline.
- Operational Overview reconstruction prioritizing current attendance state, context, exceptions, whereabouts and attendance records before secondary workforce context.
- No attendance-policy, storage-key, backend, GPS, OT, role or authorization changes.

Later v2 passes reconstruct Log, Calendar, Reports, OT, Roles and shared overlays in the same visual system.


## Work Management v1.27.0 internal domain boundary

TimeTracker now loads `domain-config.js` before the shared Work Management module bootstrap. Stable attendance policy, supported locations/departments, RBAC metadata, GPS/storage configuration, and the 2026 Philippine holiday catalog live in `WMTimeTrackerDomain`; the established runtime continues to own authenticated attendance state, transactional Clock In/Out, GPS evidence, OT, audit, and UI behavior. This is an internal architecture boundary only and does not change attendance data or backend contracts.



## Work Management v1.17 active-environment integration

TimeTracker runs only through an authenticated Work Management session. Attendance, audit, OT, and recovery records use the shared Supabase workspace; UI selection/GPS cache state is scoped to the authenticated account. The effective TimeTracker principal and role come from Work Management/Supabase module assignments rather than a module-local role directory.

Critical Clock In/Clock Out mutations wait for confirmed cloud persistence before reporting success. If Supabase rejects a write, the visible attendance mutation is rolled back so the browser cannot display an uncommitted session as authoritative. Server invariants reject duplicate attendance IDs and multiple active sessions for the same account. Automatic clock-out, GPS recovery, and concurrent attendance actions use expiring PostgreSQL operation locks to coordinate tabs/devices.

The module contains no browser-local persistence, localhost endpoint, synthetic local administrator, or standalone local-runtime fallback. Supabase tokens remain in the Work Management parent shell and are not exposed to TimeTracker.

## v1.8.7 — Roles Add User dropdown consistency

- Fixed the Roles → Add User modal so Department and Role use the shared modern dropdown component.
- Removed the Add User modal's special-case event binding and routed it through the common modal lifecycle.
- Preserved the native `<select>` elements as the authoritative values for FormData, validation, role authorization, and user creation.
- Disabled role options continue to respect RBAC assignment boundaries.
- The shared viewport-aware dropdown portal, keyboard navigation, accessibility semantics, and overlay fixes from v1.8.5 now apply to Add User as well.


## v1.7.2 — Launch-only Auto Clock-Out enforcement

Auto Clock-Out enforcement now runs **only during TimeTracker application initialization** for the currently active RBAC user. Background timers, live-clock ticks, focus/visibility events, storage synchronization, and normal in-session interactions no longer trigger automatic Clock Out.

Launch flow:

1. Load persisted RBAC and attendance state.
2. Find the current user's active attendance session.
3. Recompute credited working time using the 12:00 PM–1:00 PM unpaid-break exclusion.
4. If the exact 9-credit-hour threshold has already been reached, finalize Clock Out at the calculated policy timestamp—not the later launch time.
5. Render the application immediately with the attendance record already consistent.
6. While TimeTracker is open and foreground-capable, attempt current device geolocation using the high-accuracy and balanced fallback acquisition sequence.
7. Associate successful GPS evidence with the automatic Clock Out. The GPS `capturedAt` timestamp remains distinct from the policy Clock Out timestamp and records its temporal offset.
8. If GPS cannot be obtained, retain an explicit failure/pending-recovery state. Attendance remains completed and the GPS attempt is retried only on a later TimeTracker launch.

This design intentionally does **not** claim that a browser can execute geolocation reliably while the page is closed, suspended, or backgrounded. A user who leaves TimeTracker open past the 9-hour threshold will not be automatically clocked out until the next application launch/reload; a manual Clock Out remains available while the application is open.


A zero-install, cloud-backed attendance web application with automatic GPS evidence, synchronized audit history, RBAC, reporting, Philippine holidays, and a workforce-aware Overview dashboard.

## Deployment

TimeTracker is deployed as part of Work Management and is not intended to be served or opened as a standalone local application. Apply the current Supabase migrations before deployment.

## v1.7.1 — GPS evidence for automatic clock-out

Automatic clock-out now uses a two-phase attendance transaction so GPS acquisition can never move or invalidate the exact 9-credit-hour clock-out timestamp.

### Phase 1 — deterministic attendance finalization

- When 9 credited working hours are reached, the shift is immediately persisted at the exact policy-derived clock-out timestamp.
- The record is marked `automatic: true` and its GPS state begins as `pending`.
- Location and Department continue to use the Clock In context for the automatic closing event.
- GPS acquisition happens after the attendance write, so permission prompts, background throttling, timeouts, browser suspension, or unavailable radios cannot leave the shift active or change the credited-work result.

### Phase 2 — automatic GPS association

Every automatic clock-out starts a GPS evidence attempt:

1. High-accuracy device geolocation is requested first.
2. On timeout/unavailability, a balanced request is attempted with limited browser/OS cache allowance.
3. If a fresh device request fails, TimeTracker may associate the last validated GPS fix only when that fix is within five minutes of the automatic clock-out timestamp. The record is explicitly labeled `cached-fallback` and retains the temporal offset.
4. If no valid coordinate can be obtained, the attendance record remains completed and internally consistent with a `pendingRecovery` GPS state rather than fabricated coordinates.
5. Pending evidence is retried when the application returns to the foreground and for a small bounded set of automatic foreground retries.

### Permission and browser limitations

- `denied`, `unsupported`, insecure-context, timeout, unavailable, and malformed-coordinate results are persisted explicitly.
- Automatic GPS acquisition does not assume that a browser can display a permission prompt from a background tab. A denied or unavailable request therefore never blocks policy enforcement.
- Recovery captures are identified as recovery evidence. Their actual `capturedAt` timestamp and temporal offset from the effective clock-out are retained so a later fix is never represented as if it were captured exactly at the attendance event.
- Valid GPS fixes are cached in per-account cloud state for short fallback use only; no continuous `watchPosition()` tracking is introduced.

### Audit and synchronization

- The exact auto clock-out and subsequent GPS evidence association are separate linked audit events.
- GPS acquisition failures are auditable and include the failure reason while leaving attendance finalized.
- Server-distributed GPS locks prevent duplicate acquisition attempts across tabs/devices.
- Pending GPS recovery is detected on startup, focus, visibility restoration, and attendance synchronization from another tab.


## v1.7.0 — Working-hour policy and automatic clock-out

Attendance calculations now use one centralized working-time policy across Clock, Log, Reports, Calendar, Overview, CSV exports, and automatic enforcement.

### Standard attendance rules

- Standard clock-in threshold: **8:00 AM** local browser time.
- A clock-in timestamp strictly later than 8:00:00 AM is classified **Late**. Exactly 8:00:00 AM remains on time.
- Daily unpaid break: **12:00 PM–1:00 PM**.
- Required credited work: **9 hours**.
- A normal 8:00 AM clock-in therefore reaches the required 9 credited hours at **6:00 PM**: 10 elapsed hours minus the one-hour unpaid break.
- Late clock-ins extend the automatic clock-out time according to credited work. Example: 8:30 AM reaches 9 credited hours at 6:30 PM.

### Credited working-time engine

`durationMs()` now represents credited working time. A separate elapsed-duration calculation is retained for diagnostics, Log detail, and exports. The break deduction is overlap-based rather than a blanket one-hour subtraction, so partial sessions are correct:

- 11:45 AM → 12:30 PM = 15 minutes credited, not 45 minutes.
- 12:30 PM → 1:00 PM = 0 minutes credited.
- 12:30 PM → 10:00 PM = 9 hours credited.

The calculation also handles sessions spanning local calendar days by evaluating the 12:00–1:00 PM break window for each affected day.

### Automatic clock-out enforcement

- Every active attendance record receives a deterministic auto-clock-out target calculated from its original clock-in timestamp.
- Enforcement uses **9 accumulated credited hours**, not nine wall-clock hours.
- A dedicated background timeout schedules the nearest active target independently from the visual one-second UI timer.
- The effective persisted clock-out timestamp is always the exact calculated threshold. If a browser tab was throttled, suspended, refreshed, closed, or reopened after the threshold, recovery enforcement writes the original exact target rather than the later detection time.
- Startup, focus/visibility recovery, state synchronization, and normal live updates all re-check overdue active records.
- Enforcement applies to all persisted active users, not only the currently selected RBAC principal.
- A short cross-tab Work Management cloud state lock reduces duplicate enforcement races when the same cloud dataset is open in multiple tabs.

Automatic clock-out does not wait for GPS before finalizing the exact 9-credit-hour timestamp. Beginning with v1.7.1, GPS is acquired in a second recoverable phase and associated with the completed record when a valid fix is available; failures remain explicit and retryable without reopening the attendance session.

### Manual clock-out and edge cases

- Manual clock-out before 9 credited hours remains allowed and stores the actual manual timestamp.
- Break overlap is deducted from manually completed sessions using the same engine.
- If a manual Clock Out begins before the threshold but GPS acquisition finishes after it, automatic enforcement wins and closes the session at the exact 9-hour credited target; the delayed manual action cannot overwrite it.
- Editing attendance timestamps recalculates the attendance classification and policy snapshot.
- Existing records remain readable; policy values are calculated from their persisted timestamps even when they predate v1.7.0.

### Reporting and exports

- Overview late analytics now use the fixed **8:00 AM** attendance threshold instead of a user-adjustable operational threshold.
- Reports use **9 credited hours** as the required-session threshold.
- CSV exports now distinguish Attendance Classification, Credited Work Duration, Elapsed Duration, Unpaid Break Deducted, and whether Auto Clock-Out was used.
- Expanded Log records show classification, credited work, elapsed span, break deduction, and auto-clock-out status.


## v1.6.3 — System Admin Work Note exemption

- Work Note is now completely hidden for users whose effective role is **System Admin**, including when **Offsite (Home)** is selected.
- System Admin is exempt from Work Note validation and Work Note persistence for Clock In/Clock Out.
- For non-System Admin users, the existing rule remains: Work Note is shown only for **Offsite (Home)** and is required there.
- Location changes continue to update visibility immediately; hidden drafts are cleared before attendance persistence.

## v1.6.2 — Work Note visibility refinement

- The Work Note field is now rendered **only** when `Offsite (Home)` is the selected Location, for every role.
- System Admin remains exempt from the required-note rule, but no longer sees Work Note for non-Offsite locations.
- Non-System Admin users selecting `Offsite (Home)` still receive the required Work Note validation introduced in v1.6.1.
- System Admin users selecting `Offsite (Home)` receive the Work Note as an optional field.
- Changing to any other Location immediately removes the field, clears any uncommitted hidden draft, and excludes Work Note from the Clock In/Clock Out write path.
- Cross-tab Location synchronization also re-evaluates Work Note visibility so the Clock UI cannot become stale.

## v1.6.1 — Conditional Offsite Work Note

- Work Note is shown, enabled, and required only when the active user is **not** `System Admin` and selects `Offsite (Home)`.
- `System Admin` is exempt for every location and retains the original optional Work Note field regardless of Location.
- For non-System Admin users, every location other than `Offsite (Home)` hides the Work Note and excludes it from validation and attendance writes.
- Clock In and Clock Out enforce the rule before GPS acquisition, so a missing required note cannot start an unnecessary geolocation request.
- Event-specific Work Notes are preserved on `clockIn.workNote` / `clockOut.workNote` while the legacy record-level `note` field remains populated for search, display, export, and backward compatibility. Optional System Admin notes use the same storage path.
- Changing away from `Offsite (Home)` clears an uncommitted draft Work Note so hidden text is never accidentally persisted.
- Inline required-state help, accessible error messaging, focus recovery, and reduced-motion support are included.


## v1.6.0 — Workforce Overview dashboard

The Overview module has been rebuilt using the supplied dashboard references as design and functional guidance while retaining the application's existing visual language and data model.

### RBAC-aware workforce scope

Overview derives every metric from the same persisted attendance/RBAC data used by Clock, Log, Reports, Calendar, and Roles. It does not maintain a second analytics database.

- System Admin, IT Administrator, HR, and Finance receive organization-visible metrics according to their existing record scope.
- Supervisors receive department-scoped workforce analytics.
- Employee and OJT users receive self-scoped analytics.
- Sensitive GPS/audit data is not duplicated into Overview.

### Dashboard capabilities

- Greeting, current date/time, role, and effective scope.
- Search by employee name, record ID, department, location, or note.
- Persistent Location, Department, Status, and Sort controls.
- Configurable `Late after` operational reference time (default `08:00`). This is an analytics reference, not a payroll-policy claim.
- Workforce KPIs: visible employees, active, completed, on-site, late, and average recorded hours.
- On-time rate indicator.
- Active-location cards for all five supported attendance locations.
- Stacked active-workforce location distribution.
- Clock-in distribution by hour with peak-arrival identification.
- Attendance Pulse signals for before-threshold arrivals, late arrivals, still-working/no-timeout records, manual edits, and 14h+ stagnant sessions.
- Late-arrival drill-down list with direct navigation to the corresponding expanded Log record.
- Arrival-pattern timeline showing early/on-time/late first clock-ins.
- Active department breakdown.
- Employee Whereabouts grouped by active clock-in location, including identity, department, clock-in time, and live duration.
- Collapsible Whereabouts section.
- Dense attendance-record table with All / Active / Late / Stagnant filters.
- Direct record navigation from employee rows to Log.
- RBAC-protected Overview CSV export.
- Responsive layouts for desktop, tablet, and mobile.
- Active durations and the Overview clock update through targeted DOM mutation; the one-second timer does not remount the application.

### Performance behavior

The v1.0.1 anti-flicker lifecycle is preserved. Background ticking updates only live Overview values such as the current clock and active durations. Structural Overview rendering occurs only after navigation, data changes, or explicit filter operations.

---
## v1.3.0 — Expandable Log record architecture

The former **Attendance / Audit Trail / GPS Map** Log sub-tabs have been removed. The attendance record is now the primary traceability unit.

Each Log result is a collapsible record. Its collapsed row shows the operational summary: status, date, record ID, Clock In/Out journey, linked audit count, GPS point count, and live/completed duration. Expanding the record exposes its complete associated dataset:

- Record ID, status, creation/update timestamps, duration, and note.
- Clock In timestamp, selected Location, selected Department, GPS status, latitude/longitude, reported accuracy, GPS capture timestamp, permission state, source, altitude, speed, and heading where available.
- Clock Out equivalent dataset without overwriting the Clock In evidence.
- Audit events linked by attendance record ID/event reference, displayed chronologically.
- Audit source, message, selected context, GPS summary, runtime metadata, legacy/derived marker, and before/after change payload for record edits when present.
- Record-scoped interactive Leaflet/OpenStreetMap visualization containing only that record's GPS evidence.
- Clock In and Clock Out map-focus controls.
- Per-record JSON export containing the attendance object plus its linked audit trail.

### Log workflow and usability

- Search, status, department, location, date-range, and sorting controls remain available at Log level.
- **Expand all** and **Collapse all** controls are included.
- Expanded record IDs persist in `timetracker.ui.v1`.
- Expansion uses native accessibility state through `aria-expanded` and `aria-controls`.
- Local record data opens immediately without artificial loading screens.
- Map loading has an explicit loading state, retry path, network error handling, and a non-map fallback that preserves all coordinates/metadata.
- Only one Leaflet instance is kept alive at a time to avoid detached-map memory leaks and unnecessary tile work.
- Record deletion remains blocked while a shift is active.
- Existing overlap, edit, GPS, persistence, and cross-tab safeguards remain intact.

## GPS map privacy

Map libraries and OpenStreetMap tiles are **not** requested merely by expanding a record. The user explicitly selects **Load GPS map** for the selected attendance record. This prevents third-party tile requests during routine ledger review.

The map is never populated with another record's coordinates. A record with only Clock In GPS receives one marker; a completed record with both captured locations receives two markers.

If the Leaflet script or map tiles cannot load, the attendance record, coordinates, GPS accuracy, audit information, CSV exports, and JSON backups remain available.

## Automatic Clock + GPS policy

- GPS capture is enabled for Clock In and Clock Out.
- A successful GPS fix is required before the attendance event is committed.
- High-accuracy acquisition is attempted first.
- A balanced geolocation attempt is used as fallback after timeout/unavailability.
- A recent successful fix may be reused briefly to reduce redundant GPS work.
- Permission denial, timeout, unavailable service, unsupported browser, insecure context, and invalid coordinate responses are handled explicitly.
- No continuous `watchPosition()` tracking is used.
- The attendance action lock prevents duplicate Clock In/Out operations while geolocation is pending.

## Audit trail

Audit data remains in a separate persistent append-oriented local store, while the Log now presents audit entries inside the attendance record they belong to.

Tracked activity includes Clock In, Clock Out, record edits, record deletion, GPS acquisition activity, exports, and custom calendar event operations. Existing attendance records can retain derived legacy clock events from the upgrade bootstrap.

The global **Export audit CSV** action now exports audit events linked to the current filtered Log result set rather than requiring a separate Audit Trail screen.

Because authenticated Supabase module state is user-modifiable, this is not a cryptographically tamper-proof compliance ledger. A regulated deployment should move audit persistence to an authenticated append-only server-side store.

## Calendar

The Calendar retains the 2026 Philippine nationwide holiday dataset, attendance-day visualization, custom local/company events, selected-day drill-down, responsive readability improvements, and event persistence.

## Persistence

Attendance:

- `timetracker.attendance.v1`
- `timetracker.attendance.v1.backup`

Audit trail:

- `timetracker.audit.v1`
- `timetracker.audit.v1.backup`

UI/module state, expanded Log records, report filters, and custom Calendar events:

- `timetracker.ui.v1`

The v1.3.0 data model is backward-compatible with v1.2.x attendance and audit records.

## Production boundary

This build remains a complete cloud-backed client. For multi-user organizational deployment, use an authenticated backend with server timestamps, role-based authorization, encrypted transport/storage, append-only audit controls where required, retention policy, identity/session management, and server-side geofence/risk validation.


## v1.4.0 — Roles / RBAC

Adds an application-wide role-based access-control layer with the roles System Admin, HR, Supervisor, Finance, IT Administrator, OJT, and Employee. Employee is the default role for newly created users. Existing local installations bootstrap one authenticated Work Management account as System Admin so the Roles module is reachable during migration. IT Administrator is permission-equivalent to System Admin.

Authorization is enforced in both rendering and action handlers. Record scope is all / department team / self depending on role; precise GPS and detailed audit evidence are restricted to roles that require them. Full backup and destructive attendance deletion are administrator-only. HR can administer non-administrator roles but cannot grant or modify System Admin / IT Administrator privileges.

Important deployment boundary: this static cloud-backed build provides functional client-side RBAC for workflow/UI enforcement, but authenticated Supabase module state is user-modifiable and is not an authentication or tamper-resistant security boundary. Production multi-user enforcement requires authenticated identities and server-side authorization.

## v1.4.1 — RBAC Add User visibility fix

- Fixed a CSS-specificity conflict in the Roles > RBAC User Management toolbar that rendered the Add User label as light text on a light translucent background.
- Added a specificity-matched primary-action toolbar rule so the button retains the intended dark background and high-contrast label in normal, hover, focus-visible, and disabled states.
- Added an explicit `type="button"` to the Add User trigger and kept the visible label as stable text independent of RBAC state.
- No RBAC permission logic or user-management behavior was changed.

## v1.4.2 — Navigation ordering

- Moved **Overview** to the first position in the primary navigation, immediately before **Clock**.
- Preserved the application startup/default view as **Clock** (`let view = 'clock';`).
- No RBAC, attendance, persistence, reporting, calendar, GPS, or rendering behavior was changed.



## v1.6.0 — Motion & interaction system

- Added centralized motion timing/easing tokens and native View Transitions for primary tab changes where supported.
- Added consistent hover, press, focus, ripple, card-lift, modal, toast, calendar, analytics, and navigation micro-interactions.
- Added animated expandable Log disclosures without remounting the application.
- Preserved targeted one-second live-value updates; timer updates do not trigger page-entry animations or full application renders.
- Added full `prefers-reduced-motion` handling and disabled decorative continuous motion for users requesting reduced motion.
- Motion uses transform/opacity/box-shadow where practical to avoid layout churn.


## v1.8.0 — Overtime (OT) workflow

- Added OT tab with Draft → Submitted → Approved / Rejected workflow.
- All roles with OT access can create, save drafts, submit, view, and track their own requests.
- System Admin and IT Administrator can approve/reject organization-wide submitted requests.
- Supervisor can approve/reject submitted requests for users in the same department.
- Self-approval is blocked for separation of duties.
- Rejected requests can be edited and resubmitted; submitted requests can be withdrawn by their owner.
- OT duration supports overnight ranges, with validation from 15 minutes up to 16 hours.
- Persistent OT request store with backup recovery: `timetracker.ot.v1`.
- Persistent OT Activity Log with backup recovery: `timetracker.ot.activity.v1`.
- Activity Log viewing/export is restricted to System Admin and IT Administrator and is also enforced in action/data-access functions.
- Activity captures creation, modification, submission, withdrawal, approval, rejection, and export events.
- Added OT filtering, search, date range, sorting, status tracking, CSV export, responsive cards, approval/rejection dialogs, cross-tab synchronization, and full-backup integration.


## v1.8.2 — Approved OT-aware Auto Clock-Out

- Launch-time Auto Clock-Out now evaluates the current attendance record against **9 base credited working hours plus validated approved OT** for the attendance date.
- Applicable OT must belong to the attendance owner, have status `Approved`, contain a valid approval decision, match the local Clock In calendar date, and pass start/end duration validation.
- Multiple approved OT requests are supported. Overlapping OT time windows are merged before their duration is added, preventing duplicate/overlapping approvals from extending the threshold twice for the same minutes.
- Draft, Submitted, Rejected, malformed, wrong-owner, and wrong-date OT requests do not affect enforcement.
- OT is read from the current persisted OT store whenever the effective threshold is calculated, so approval/rejection/status changes are reflected on the next launch evaluation. Cross-tab OT changes also refresh the active Clock view.
- The attendance policy snapshot and automatic Clock-Out audit metadata persist the base requirement, approved OT minutes/request IDs, effective required working time, and resulting exact policy timestamp for traceability.
- GPS acquisition behavior from v1.7.2 remains unchanged: the attendance timestamp is finalized at the exact effective credited-work threshold, then current GPS evidence is obtained while TimeTracker is active.


## v1.8.2 bootstrap reliability fix

- Fixed a fatal ES-module parse regression introduced in v1.8.1: duplicate top-level `localDateKey()` declarations prevented `app.js` from executing in browsers.
- Consolidated date-key generation into one validated helper.
- Added module-mode syntax validation to the release verification process (`node --input-type=module --check < app.js`).
- Added a lightweight startup-failure fallback so a future bootstrap failure produces a diagnostic UI instead of an unexplained blank page.
- Added an inline favicon to remove the incidental `/favicon.ico` 404 from local Python HTTP server logs.


## v1.8.3 — Modern Dropdown System

All application `<select>` controls are now progressively enhanced into a shared modern dropdown/combobox presentation while retaining the native select as the authoritative form value. The component includes animated open states, hover/press/focus feedback, selected-item indicators, disabled-option handling, keyboard navigation (Arrow keys, Home/End, Enter/Space, Escape, Tab), type-ahead by first character, click-outside dismissal, responsive sizing, reduced-motion support, and accessible combobox/listbox semantics. Existing change events, required-field validation, FormData serialization, persistence, RBAC rules, filters, and business logic continue to operate through the underlying select elements.


## v1.8.5 — Dropdown Stability and Layout Refinement

- Fixed dropdown stacking-context collisions by portaling open menus to the document body.
- Menus now use viewport-aware positioning and open upward when there is insufficient space below.
- Prevented page/card content from bleeding visually through dropdown surfaces.
- Fixed outside-click handling for portaled menus and prevented menu scrolling from closing the dropdown.
- Fixed OT filter layout: the panel is now an actual responsive CSS grid with consistent labels, fields, buttons, and enhanced dropdowns.
- Improved Log filter column sizing and responsive wrapping so Department/Location values are less aggressively truncated.
- Preserved native selects as authoritative values for validation, FormData, persistence, and existing change handlers.
- Preserved keyboard, ARIA, touch-target, reduced-motion, and dynamic-modal dropdown behavior.

## v1.8.5 dropdown overlay correction

- Fixed portaled dropdown menus becoming transparent after leaving `.modern-select` inheritance scope.
- Dropdown visual tokens now live on `.modern-select-menu` itself so background, hover and selected states survive portaling to `<body>`.
- Added an opaque menu backing layer, explicit opacity/mix-blend behavior, paint containment and stacking isolation.
- Existing viewport-aware placement, upward opening, overflow constraints, keyboard behavior and native `<select>` synchronization are preserved.


## v1.8.7 Overview redesign

- Replaced the reference-like Overview analytics card composition with an original live workforce command surface.
- Added interactive Work Mode lanes and Department Matrix quick filters.
- Added a circular live workforce status core, shift telemetry feed, arrival rhythm visualization, and exception stream.
- Preserved RBAC scoping, filters, live durations, Log drill-down, exports, and persisted Overview state.
- Added responsive layouts, reduced-motion support, and localized micro-interactions without reintroducing periodic full-view rendering.
