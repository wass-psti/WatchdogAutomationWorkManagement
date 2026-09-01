# TradeLink v1.42.0 — Work Management v1.17 Integration

## Runtime boundary

TradeLink runs at `apps/tradelink/runtime.html` only after Work Management supplies an authenticated, authorized identity. The module uses `WMModuleStore` for cloud persistence and never receives Supabase access/refresh tokens or privileged credentials.

The active integration assets are `app.v1.42.0-wm1.js`, `styles.v1.42.0-wm1.css`, and `css3-buttons.v1.42.0-wm1.js`.

## Data ownership

- `tradelink_state_v1` — shared committed commercial/document state.
- `tradelink_state_backup_v1` — shared recovery copy.
- `tradelink_ui_v1` — per-account UI state.
- `tradelink_draft_v1` — per-account draft/autosave state.
- `tradelink_vendor_logo_*` / `tradelink_vendor_qr_*` — shared validated image assets.

Committed documents are workspace data and synchronize across authorized accounts/browsers/devices through Supabase revisions and Work Management refresh events. Active account identity is never persisted inside shared state; it is injected per authenticated session.

## Approval workflow preservation

TradeLink v1.42.0 approval rules remain intact:

- Angelica Anne Camille Señagan (`aacsenagan@watchdogautomation.com.ph`) is the predefined Sales Supervisor quotation reviewer where the creator route requires review.
- Alex P. Señagan (`asenagan@watchdogautomation.com.ph`) is General Manager and final approver.
- **Use Time Now** records the read-only approval timestamp.
- Required reviewer verification precedes final approval.
- Identity checks remain tied to the established workflow; module-role mapping alone does not impersonate a predefined approver.
- Email approval/notification is not implemented.

## Persistence and conflict behavior

TradeLink uses the shared Work Management cloud store rather than browser-local persistence. Writes carry optimistic revisions; remote changes are synchronized into the open module, and stale/conflicting state is recovered through the shared cloud adapter rather than silent isolated session state.

Workspace Backup includes committed TradeLink state and validated vendor assets. Per-account transient UI/draft data remains scoped to the authenticated user.

## Deployment

TradeLink has no standalone local runtime in Work Management. Apply the current Supabase migrations before deploying the platform. The v1.17 state-key policy explicitly registers all TradeLink exact/prefix keys used by the runtime.
