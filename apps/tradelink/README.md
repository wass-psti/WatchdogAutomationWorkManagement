# TradeLink v1.42.0 — Quotation Use Time Now Approval

## Work Management v1.27.0 internal domain boundary

TradeLink now loads `domain-config.js` before the shared module bootstrap. Stable document/workflow/payment/VAT/currency/personnel/template/route configuration lives in `WMTradeLinkDomain`; the established v1.42.0 runtime continues to own document behavior, approvals, Use Time Now timestamp persistence, cloud state, PDF generation, and interaction logic. Route/tab scrolling also respects `prefers-reduced-motion`. No TradeLink data migration is required.


## v1.42.0 — Source-verified timestamp approval

This release verifies the Quotation approval behavior directly against the supplied `TradeLink-code.zip` and aligns the managed implementation with the established source workflow.

- Confirms the original `InvoiceForm.jsx` approval UI uses **Use Time Now** to capture review and approval timestamps.
- Registers the two predefined Quotation workflow identities with stable email metadata:
  - **Angelica Anne Camille Señagan** — `aacsenagan@watchdogautomation.com.ph` — Sales Supervisor / Quotation reviewer.
  - **Alex P. Señagan** — `asenagan@watchdogautomation.com.ph` — General Manager / final approver.
- Keeps creator-based routing from the source: Angelica review is required only for creator groups that require Sales Supervisor review; Alex remains the final approver unless he is the creator and therefore already has final authority.
- Replaces Quotation workflow timestamp editing with read-only timestamp fields. The approval mark can only be created or refreshed through **Use Time Now**.
- Uses the current application time as the persisted timestamp and enforces the assigned-user identity before capture.
- Enforces Sales Supervisor review before General Manager final approval when a review stage is assigned.
- Persists `verifiedByEmail` / `approvedByEmail` as identity metadata while retaining existing name-based fields and historical compatibility.
- Existing saved documents are normalized from their assigned names to the corresponding predefined email identity without requiring data migration from the user.
- Saved-document approvals captured from the Create New editor are persisted immediately to the committed document state and audit trail; unsaved drafts retain the timestamp in draft autosave until first save.
- All Documents approval-queue actions now explicitly use **Use Time Now** semantics.
- No email approval or notification workflow is introduced in this release; email addresses are identity metadata only, reserved for future notification integration.

# TradeLink v1.41.0 — Verification & Approval Workflow Reconciliation

## v1.41.0 — Source-aligned approval hierarchy

This release reconciles the managed TradeLink workflow with the supplied `TradeLink-code.zip` approval implementation instead of extending the later simplified Admin-based model.

- Registers **Alex P. Señagan** (`asenagan@watchdogautomation.com.ph`) as **General Manager** and the established final approver for Quotation/PO routing.
- Migrates only the synthetic managed `authenticated Work Management account` placeholder to Alex's source-backed identity; explicitly stored user identities remain untouched.
- Restores creator-based Quotation routing from the source: Sales Supervisor review is assigned where required and final management approval remains with Alex; Alex-created Quotations require no additional approval.
- Restores PO creator routing while preserving the source Account Manager review selector and Alex's final-approval authority.
- Keeps Electronic SI's source sequence intact: **Creator → Finance verification → Management approval**. The original Finance and Management personnel collections are retained.
- Replaces the later generic `Admin` creator-authority shortcut with identity-based authorization.
- Adds identity-restricted review/verification and final-approval timestamp actions; the final approval stage cannot be completed before an assigned review/verification step.
- New approval-controlled submissions use the source-compatible **For Approval → Approved** progression. Legacy `Submitted` / `Under Review` records remain visible in the decision queue.
- Approval actions no longer overwrite the assigned reviewer or approver with the currently logged-in user.
- Quotation/PO PDF generation is blocked until the required source approval sequence is complete.
- Historical records, backups, company/template binding, PDF layout, Activity auditing, and all non-approval document workflows remain compatible.

## v1.40.0 — Final-page-only QR and company footer

- PDF QR/company footer is no longer a fixed print element.
- Browser print engines therefore cannot repeat it on every physical page.
- If Terms & Conditions are present, the footer is appended after the complete terms/acceptance content.
- If Terms & Conditions are absent, the footer is appended after the main document content.
- The QR image, company name, and document number are emitted exactly once.
- The footer uses `break-inside: avoid` / `page-break-inside: avoid` so the QR and associated text remain together.
- Existing per-company QR assets, company/template binding, PDF styling, pagination, and document data mappings remain unchanged.

## v1.39.0 — Cohesive UI design overhaul

- Rebuilt the shared visual system around a graphite application chrome, quiet light workspace, and semantic icon-button accents.
- Updated application navigation, company control, Create New command bar, document tabs, form modules, financial panels, tables, filters, modals, empty states, recovery surfaces, and responsive layouts.
- Removed competing accent colors from routine form labels so semantic color is concentrated in actionable icon controls and state feedback.
- Preserved the v1.36 CSS3 fill / enter / expand / collapse / rotate button interactions and the v1.37 Actions-menu reliability fixes.
- No business logic, routing, document lifecycle, persistence, PDF generation, company templates, or backup/recovery behavior was replaced.

## v1.36.0 CSS3 icon-button foundation

- Replaces compatible TradeLink button presentation with a shared CSS3 icon-button system derived from the supplied **fill**, **enter**, **expand**, **collapse**, and **rotate** hover concepts.
- Applies the component to primary navigation tabs, all six Create New document tabs, Recovery/Activity tabs, Electronic SI section navigation, standard action buttons, icon-only controls, modal actions, and the All Documents **Actions** menu.
- Uses inline SVG icons and no external icon-font/CDN dependency.
- Leaves the original DOM controls, data attributes, event handlers, validation, ARIA state, persistence, and routing intact.
- Uses a MutationObserver so dynamically inserted modals, action menus, and rerendered controls are enhanced automatically.
- Keeps animations inside the icon tile so control dimensions and the v1.24+ layout-stability protections are preserved.
- Replaces the prior Fizzy particle treatment so controls have one coherent CSS3 icon interaction language, with full reduced-motion support.

This release integrates a shared, action-oriented CSS Fizzy Button interaction system across TradeLink while preserving existing button functionality, accessibility, state handling, responsiveness, and layout-stability safeguards.

## v1.35.0 highlights

- Shared particle-burst feedback for primary, secondary, destructive, toolbar, modal, icon, item-action, document-menu, and action-menu buttons.
- Variant-aware fizz colors inherit TradeLink brand, success, warning, dark, and danger semantics.
- Navigation tabs, selector triggers, checkboxes, native form controls, and link-style document controls are intentionally excluded so the effect remains semantic action feedback.
- Pointer and keyboard activation are both supported through one delegated runtime layer.
- Disabled, `aria-disabled`, and busy buttons never animate.
- `prefers-reduced-motion` fully disables particle animation.
- Particle pseudo-elements are absolutely positioned and do not change button dimensions, surrounding geometry, scroll position, or the v1.24+ layout-stability model.
- Existing event handlers and action dispatchers are not replaced; the Fizzy layer is feedback-only.

# TradeLink v1.34.0 — All Documents Actions Reliability

This release updates **All Documents → Documents** to the supplied operational-table baseline while preserving TradeLink's existing document lifecycle, approvals, persistence, company/template binding, recovery, and filtering architecture.


## v1.31.0 — Create New typography and readability

- Raised the shared typography scale across Create New and all six document workflows.
- Increased document headings, section headings, field labels, controls, buttons, helper/validation text, item metadata, financial summaries, Terms & Conditions, and approval/workflow text through Create New-scoped shared styles.
- Preserved existing component geometry and layout-stability safeguards while improving line-height, wrapping, mobile scaling, and readable numeric presentation.
- No metrics, chart, analytics, or dashboard components were added; Create New contains no chart surfaces requiring typography changes.
# TradeLink v1.24.0 — Interaction & Layout Stability

This release unifies **Create New → Quotations** and **Create New → PO to Suppliers** with the established **Electronic SI** implementation for the **Items** and **Total / Discount & VAT** sections.

## Shared implementation

Quotation, PO to Suppliers, and Electronic SI now use the same:

- item-row component structure and responsive layout
- Description, Quantity, Unit Price, Amount, and Actions fields
- Add Item, Add Note, Add Saved Item, Clear, Duplicate, Reorder, and Remove interactions
- local saved-item reuse with currency-safe pricing
- inline row validation and 100-line safeguards
- Ctrl/Cmd + Enter rapid line creation
- autosave and canonical `ui.form.items` state path
- subtotal, discount, taxable amount, VAT classification, VAT amount, and final-total calculation engine
- Discount Method, Discount Value, optional Adjustment Note, and VAT Classification controls
- Amount Summary component and live in-place recalculation
- VAT options and backward-compatible VAT aliases
- reset-adjustments behavior, accessibility feedback, and responsive styling

Quotation- and PO-specific client/supplier information, validity, delivery commitments, notes/terms, approval routing, numbering, persistence, preview, and submission rules remain unchanged.

## Runtime

No build step is required. Serve the folder with a local HTTP server, for example:

```bash
python3 -m http.server 8080
```

Then open `http://the deployed HTTPS origin:8080`.


## v1.23.0 — Extensible dropdowns

Dropdowns containing Custom / Other choices now expose a conditional, document-persisted input when the extensible choice is selected. This applies to Payment Terms across all applicable document types and to custom validity/delivery commitments in Quotations and PO to Suppliers. Custom values participate in validation, autosave, edit hydration, saved client/supplier defaults, document preview, submission, and reset/new-document behavior.


## v1.24.0 — Interaction & layout stability

- Prevents routine state updates from replaying the full-page entrance animation.
- Preserves the active control's viewport position across unavoidable full renders.
- Uses non-scrolling focus restoration after dynamic form changes.
- Adds a stable scrollbar gutter to prevent width changes when overlays/editors lock scrolling.
- Removes transform-based button movement while retaining color, border, and shadow feedback.
- Stops Custom/Other dropdown activation from changing the selector container's padding/border geometry.
- Keeps conditional custom fields visually distinct without shifting the selector itself.

## v1.25.0 — All Documents workspace

All Documents now includes comprehensive search, persistent filters/sorting, date-range filtering, configurable page size, collapsible approval queue, page selection, safe selected-document export/copy/delete workflows, improved pagination, and responsive document-management UI. Bulk deletion automatically creates a recovery snapshot first.

## v1.26.0 — All Documents action alignment

- Repositioned **Create Document** as the clear primary action on the right side of the All Documents command bar on desktop.
- On tablet/mobile, the primary action moves above utility actions and expands to full width for predictable reachability.
- Backup, import, and snapshot actions are visually grouped as secondary workspace utilities.
- Added **Open** and **Edit** contextual actions when exactly one document is selected, reducing unnecessary trips through row-level controls.
- Preserved filters, selection, bulk export/delete, approval queue, persistence, routing, and the v1.24 layout-stability safeguards.

## v1.28.0 — Empty-state action alignment

- Reworked the All Documents empty state into a centered vertical content/action composition.
- Positioned `Create document` as the primary CTA below the explanatory copy instead of inline with it.
- Added `Import backup` as a secondary recovery path when the register is truly empty.
- Improved filtered-empty state copy and Clear Filters placement.
- Applied the same action-stack conventions to Recovery → Activity empty states.
- Added compact-screen stacking so empty-state actions remain centered and full-width where appropriate.

## v1.28.0 — Backup import reliability

- Fixed the All Documents empty-state **Import backup** button by wiring `data-import` controls to the canonical file picker.
- Added a runtime file-input fallback so import actions remain usable if the toolbar input is not mounted.
- Added full-backup schema and structural validation before replacing local state.
- Rejects selected-document export files and unsupported schemas with a clear error instead of partially importing them.
- Added a 25 MB import safety limit and explicit JSON/file-read error reporting.
- Creates and retains an in-memory pre-import recovery snapshot of the current workspace before committing the replacement state.
- Makes the import commit transactional: if persistence fails, the previous application state and local storage keys are restored.
- Clears stale draft/edit/selection state after a successful restore and returns to All Documents.
- Preserves compatible snapshots from both the current workspace and imported backup, de-duplicated and capped to the existing recovery limit.


## v1.31.0 PDF generation
- Rebuilt the print/PDF renderer around the supplied Q-011134 quotation template baseline.
- Added professional A4 header, client/commercial blocks, line-item table, financial summary, approval block, dedicated Terms & Conditions pages, and quotation acceptance signature area.
- Generate PDF now opens a managed print document and invokes the browser print dialog; choose **Save as PDF**.
- Existing preview/comment workflow remains available from All Documents.


## v1.31.0 Active Company hardening
- Restored the source TradeLink Active Company management workflow with company selector, per-company logo and footer QR assets, validation, persistence, and counter tools.
- Company image assets use separate Work Management cloud state keys to avoid duplicating large base64 data inside primary and rolling-backup state.
- Saved documents now retain their company/vendor context so later global company changes do not silently rebrand historical documents.
- PDF and document preview resolve the saved document company, while legacy documents without company metadata retain the active-company fallback.
- Full backup/import and named recovery snapshots now preserve vendor logo/QR assets transactionally.

## v1.32.0 - Per-company document templates

Each Active Company now owns an independent PDF template profile. The three supplied quotation references are included under `assets/` and mapped as follows:

- Watchdog Automation Sales & Services -> `assets/template-watchdog-sales.pdf`
- Watchdog Automation OPC -> `assets/template-watchdog-opc.pdf`
- PLC Systems Technik, Inc. -> `assets/template-plc-systems.pdf`

Template configuration is persisted in `state.vendorTemplates`, included in normal backups/snapshots, and snapshotted into newly saved documents. Company switching therefore changes the template for new documents without retroactively changing the presentation of existing documents. The Active Company panel provides per-company accent/pagination controls, reference-template access, and a restore-default action.


## v1.33.0 — All Documents reference ledger

The All Documents register now follows the supplied operational table baseline with row numbering, combined document/party identification, date, Workflow Status, independent Quote Status for quotations, amount/currency, creator, revision, Active Company, and a compact contextual Actions menu. Quote Status is persisted independently from approval/workflow status. The Actions menu provides Preview, Edit, Comment, Print PDF, Export to Excel, Duplicate, Change History, and Delete. The register also adds Quote Status and Active Company filters while preserving selection, pagination, approvals, backup/recovery, and existing document lifecycle behavior.


## v1.34.0 — All Documents Actions reliability

The Documents row Actions menu now uses a stable delegated dispatcher rather than fragile per-instance action callbacks tied to a scroll-dismiss lifecycle. Preview, Edit/Edit Approved, Comment, Print PDF, Export to Excel, Duplicate, Change History, and Delete all resolve the target document at execution time, report failures explicitly, and preserve existing document lifecycle behavior. Approved-document editing now requires confirmation, single-document deletion creates a recovery snapshot automatically, duplicate preparation clears workflow timestamps, and the menu supports Escape/Arrow/Home/End keyboard navigation with stable focus restoration.

## v1.37.0 — Actions menu button stabilization

- Rebuilt the All Documents Actions menu source markup so action labels are text-only before the CSS3 icon enhancer runs; legacy glyphs can no longer leak into labels such as `Edit/Approved`.
- Added explicit action-menu listener cleanup so outside-click, resize, and table-scroll handlers do not accumulate after repeated menu use.
- Kept pointer-opened menus focused on their trigger, preventing the first action from appearing permanently selected/filled; keyboard-opened menus still focus the first menu item.
- Hardened delegated click and keyboard dispatch, busy-state handling, target re-resolution, and stable focus restoration.
- Isolated CSS3 icon surfaces from pointer hit testing and strengthened icon visibility/spacing at desktop and mobile sizes.
- Existing Preview, Edit, Comment, Print PDF, Excel export, Duplicate, Change History, and Delete workflows remain the underlying action implementations.


## v1.39.0 — Immutable Document Company Association

- A document captures the Active Company when its draft is created and stores that company ID on the document.
- Changing the global Active Company no longer mutates an open draft or an existing document.
- Editing a historical document no longer changes the global Active Company selector.
- Save/update paths enforce the existing document company ID as authoritative.
- Legacy documents without a company identifier are bound once during state normalization using the best available historical/global company context, after which the association remains stable.
- PDF, All Documents, preview, duplicate, backup/import, and recovery continue resolving company context from the document-level association.
