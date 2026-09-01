# Work Management v1.43.2 Production Hardening

v1.43.2 is a reliability/security hardening release built on the fully typed and verified v1.42.0 baseline. It intentionally avoids product redesign and broad feature expansion.

## Risks addressed

### Cross-session authorization drift

The shell now revalidates the active account/capability context on bounded focus/visibility restoration. An authorization fingerprint detects meaningful identity, role, account-status, or module-assignment changes. When the fingerprint changes, server-state caches are cleared. If the active embedded module is no longer authorized, the module host is detached immediately; otherwise the refreshed identity is republished.

PostgreSQL remains authoritative. `v1.43.0-production-hardening.sql` requires both active workspace membership and an active profile at the workspace/Board access helpers, closing the case where a disabled user retained a still-valid JWT and attempted a Board RPC directly.

### External-data and persistence integrity

Board DTO mapping no longer silently converts unknown lifecycle values, member roles, malformed dropdown options, duplicate Status IDs, invalid modern Status configuration, orphaned item/group relationships, duplicate cell coordinates, or invalid Status references into plausible state. Legacy Status `options` remain explicitly migratable; payloads already using the typed `labels` structure must satisfy the current runtime schema.

### Request cancellation and failure classification

Caller cancellation and application request timeouts are composed rather than mutually exclusive. Caller aborts remain caller aborts; application timeouts are classified as timeouts. Backend requests receive correlation identifiers and normalized error metadata to improve actionable diagnostics without exposing credentials or adding user analytics.

### Rendering scalability and stability

Table and Kanban rendering now build one-pass item/group/Status indexes instead of repeatedly scanning full collections per group or lane. Output and interaction behavior remain unchanged. Existing persistent-shell motion, reduced-motion, overlay exclusivity, and Item Workspace stability protections remain release-gated by Chromium regression tests.

## Production deployment policy

- Public production source maps are disabled by default (`VITE_BUILD_SOURCEMAP=false`).
- Only public Supabase URL/publishable-key configuration may be shipped to the browser. Never expose service-role keys or private credentials through `VITE_*` variables.
- Existing Supabase deployments must apply `supabase/migrations/v1.43.0-production-hardening.sql` before v1.43.2 deployment. Fresh deployments use `supabase/schema.sql`.
- Vite distribution verification checks the real emitted JavaScript runtime entries, rewritten embedded-module HTML references, asset structure, and source-map policy.
- Preview smoke verification requests the emitted JavaScript bootstrap and rejects HTML fallback responses masquerading as successful runtime assets.

For hosts that support response headers, configure an appropriate Content-Security-Policy, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and frame policy after validating required Supabase HTTPS/WebSocket endpoints and the same-origin embedded modules. GitHub Pages cannot provide arbitrary per-project response headers, so header enforcement may require a CDN/reverse proxy or a host with configurable headers. Do not introduce an untested CSP meta policy merely for release labeling.

## Diagnostics

The runtime records bounded operational diagnostics for runtime boot, RPC start/success/failure, request correlation, authorization-context changes, and revalidation failures. Diagnostics are intended for troubleshooting and recoverable error handling; they are not analytics or user tracking.

## Verification requirements

The release gate includes strict TypeScript, architecture/runtime verification, the v1.43 hardening verifier, Vite dev smoke, production build, dist validation, production preview smoke, the complete historical regression chain, and Chromium integration. Browser coverage includes authorization reconciliation, Boards editing and Status lifecycle, overlay/click-through isolation, Item Workspace lifecycle, module host isolation, motion stability, and embedded application theme compatibility.

## Intentionally retained boundaries

TimeTracker, FuelTrack+, and TradeLink retain their established internal application implementations. Their host/runtime integration is typed and authorization-controlled, but v1.43 does not mechanically rewrite these module internals because that would add unrelated regression risk to a hardening release. Browser-local storage remains limited to non-authoritative shell preferences; authentication, operational data, module state, Board data, and private files remain backed by the configured Supabase services.
