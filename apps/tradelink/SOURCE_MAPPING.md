# v1.35.0 — CSS Fizzy Button mapping

- `styles.css`: shared Fizzy pseudo-element system, semantic color variants, burst keyframes, disabled/busy safeguards, and reduced-motion fallback.
- `app.js`: delegated pointer/keyboard Fizzy trigger; existing button-specific handlers remain authoritative for functionality.
- Scope: `.button`, toolbar/modal actions, icon actions, item/line actions, document-menu trigger, and document action-menu commands. Navigation and selector controls are intentionally excluded.

## v1.29.1 Create New typography system

`styles.css` now contains a scoped `.create-view` typography layer shared by Electronic SI, Packing List, Delivery Receipt, Payment AR, Quotations, and PO to Suppliers. It raises labels, controls, helpers, validation, item/financial text, Terms & Conditions, approval/workflow text, and action typography without changing the underlying form/state implementations.

# TradeLink v1.19.0 Source Mapping

The Payment AR workflow adapts the applicable behavior from the original TradeLink source into the managed cloud-backed architecture.

- Original `InvoiceForm.jsx` payment method, cash/cheque fields, bank/cheque details, particulars → `renderPaymentFields()`.
- Original saved client/document form behavior → `renderPaymentClientInformation()` plus existing `state.clients` persistence.
- Original `documentDefaults.js` Payment Acknowledgement terms → `DEFAULT_TERMS.payment` and `renderPaymentTerms()`.
- Original `PAYMENT_RECEIVED_COLLECTION` / `PAYMENT_ADMIN_COLLECTION` → `PAYMENT_RECEIVERS`, `PAYMENT_ADMINS`, and `renderPaymentAcknowledgement()`.
- Original receiver/admin timestamp capture behavior → dedicated Payment AR handlers in `bindForm()`.
- Original payment validation → `validate()` plus submit-only acknowledgement assignment/particular requirements in `saveForm()`.
- Original payment preview amount/bank context → expanded Payment AR branch in `renderModal()`.

Existing record properties remain compatible. Added fields (`bankName`, `receivedBy`, `receivedAt`) default safely when older records do not contain them.

## v1.20.0 Quotation workflow

- Generic quotation client/commercial fields -> `renderQuotationClientInformation()`
- Generic quotation item renderer -> `renderQuotationItems()` / `renderQuotationItemRow()`
- Quotation notes -> `renderQuotationNotes()` with quick templates
- Quotation Terms & Conditions -> `renderQuotationTerms()`
- Approval-authority presentation -> `renderQuotationApproval()` / `quotationHasCreatorAuthority()`
- Validity expiry derivation -> `quotationValidityEnd()`
- Dedicated quotation bindings live in `bindForm()` under `documentType === 'quotation'`.

## v1.21.0 — PO to Suppliers dedicated workflow

- Generic PO supplier fields → `renderPoSupplierInformation()` with saved supplier lookup, commercial terms, currency, validity, delivery commitment, and target date.
- Generic financial item renderer → `renderPoItems()` / `renderPoItemRow()` with dedicated purchase-line actions and local saved-item reuse.
- Minimal PO terms → expanded `DEFAULT_TERMS.po` and `renderPoNotesTerms()` workflow.
- Generic approval text inputs → `renderPoApproval()` with canonical Account Manager choices and creator authority handling.
- PO-specific interactions are bound in `bindForm()` and excluded from conflicting generic state handling where specialized behavior is required.

## v1.22.0 — Quotation / PO shared Electronic SI Items + Total

- `renderCreate()` routes all financial item documents through `renderItems(f, financial)` instead of dedicated Quotation/PO item renderers.
- `renderItems()` uses the Electronic SI item-row/component contract for `esi`, `quotation`, and `po`, with document-specific helper copy only.
- `renderFinancialFields()` uses the Electronic SI Discount & VAT + Amount Summary structure for all three document types.
- `refreshFinancialDisplay()` is the common derived-calculation refresh path for line amounts, subtotal, discount, VAT, taxable amount, total, currency, and validation feedback.
- Generic shared item mutation controls (`data-add-blank`, `data-add-note`, `data-add-saved-item`, duplicate/reorder/remove/clear) now drive Quotation and PO item mutations through the same canonical state path as Electronic SI.
- Existing Quotation and PO commercial/approval components remain document-specific.


## v1.23.0 extensible option mapping

- `paymentTerms` + `paymentTermsCustom`: custom commercial/payment terms for all document workflows using the shared payment-terms selector.
- `validity` + `validityCustom`: custom validity date for Quotation and PO workflows.
- `deliveryCommitment` + `deliveryCommitmentCustom`: custom free-text delivery commitment for Quotation and PO workflows.
- `fieldExtensibleSelect()`: shared conditional-control renderer used to keep custom-option behavior consistent.
- `resolvedPaymentTerms()`, `resolvedValidity()`, `resolvedDeliveryCommitment()`: normalized display values for preview and workflow context.


## v1.24.0 interaction stability mapping

- `render()` now captures/restores a viewport anchor around unavoidable full application renders.
- `stableFocus()` centralizes focus restoration using `preventScroll`.
- Global CSS reserves the document scrollbar gutter and disables routine page entrance transforms.
- Extensible Custom/Other fields no longer change the parent selector geometry when activated.

## v1.25.0 mapping

- `filteredDocs()` / `documentSearchText()` / `sortDocuments()` — expanded All Documents discovery and ordering.
- `exportSelectedDocuments()` / `deleteSelectedDocuments()` / `copySelectedDocumentNumbers()` — selected-record workflows.
- `renderDocuments()` — operational filter panel, selection bar, approval queue, ledger, and pagination.

## v1.26.0 mapping

- `renderDocuments()` → revised command-bar hierarchy with a dedicated `Create Document` CTA and subordinate backup/import/snapshot utilities.
- `bindGlobal()` → single-selection Open/Edit actions reuse the existing preview and edit workflows without introducing new document state.
- `styles.css` → responsive command-action composition keeps the CTA aligned on desktop and full-width/first on compact layouts.

## v1.28.0 Empty-state composition

The All Documents and Activity empty-state render paths now use shared `.empty-state-workspace`, `.empty-state-content`, and `.empty-state-actions` presentation primitives. Existing routing (`data-tab="create"`), backup import (`data-import`), and filter-reset handlers are reused; no parallel workflow state was introduced.

## v1.28.0 import workflow

- `openImportPicker()` — shared UI trigger for toolbar and empty-state import actions.
- `importInput()` — resolves the mounted backup file control or creates a safe runtime fallback.
- `validateImportedBackup()` — validates full TradeLink backup schema and document/state structure before state replacement.
- `sanitizeImportedState()` — limits imported state to recognized TradeLink state keys.
- `makeRecoverySnapshot()` — creates a pre-import rollback/recovery point without prematurely mutating the active workspace.
- `importState()` — performs parse → validate → confirm → snapshot → normalize → persist as a guarded transaction with rollback on failure.


## Active Company (v1.31.0)
- `useVendorData.js` → `vendorById`, `selectedVendor`, `getVendorAsset`, `setVendorAsset`, `deleteVendorAsset`, backup/snapshot asset integration.
- `VendorSelector.jsx` → `renderCompanyPanel`, `switchActiveVendor`, per-company profile validation, logo/QR controls, counter reset tools.
- `VendorLogoUploader.jsx` → runtime image picker with file type/size validation and separate persistent asset keys.
- Source document vendor hydration behavior → `vendorId` + minimal vendor snapshot on saved documents, `documentVendor()` for preview/PDF.

## v1.32.0 template mapping

- `DEFAULT_VENDOR_TEMPLATES` defines the independent reference profile for each Active Company.
- `state.vendorTemplates` persists per-company template customization.
- `companyTemplate()` resolves the active company profile.
- `documentTemplate()` prefers the template snapshot stored on a saved document, preserving historical rendering.
- `buildPdfDocumentHtml()` consumes the resolved template through CSS variables and company-specific terms pagination.
- Active Company panel exposes template preview, accent, pagination, reference PDF, and restore-default controls.


## v1.33.0 All Documents mapping

- `renderDocuments()` → reference-style operational register columns and row composition.
- `QUOTE_STATUS_OPTIONS` / `updateQuoteStatus()` → independent quotation progress state persisted on each quotation.
- `openDocumentActionMenu()` → fixed-position contextual row action menu that avoids table overflow clipping.
- `exportDocumentExcel()` → per-document Excel-compatible export.
- `renderDocumentHistory()` → document-scoped audit/change history.
- `documentCompanyTag()` / `documentVendor()` → historical Active Company attribution.
- Existing preview, edit, comment, PDF, duplicate, delete, selection, filters, pagination, approval queue, persistence, and recovery paths are reused rather than duplicated.


## v1.34.0 Actions dispatcher mapping

- `openDocumentActionMenu()` owns menu presentation, placement, keyboard navigation, and outside dismissal.
- `dispatchDocumentAction()` is the canonical action dispatcher and re-resolves the document before execution.
- `prepareDuplicateDocument()` normalizes a copy into a new Draft and clears workflow timestamps.
- `deleteDoc()` now creates an automatic pre-delete recovery snapshot.
- Existing `renderModal()`, `editDoc()`, `generateDocumentPdf()`, `exportDocumentExcel()`, `renderDocumentHistory()`, and comment persistence remain the underlying action implementations.


## v1.36.0 CSS3 icon buttons

- `css3-buttons.js` — runtime presentation enhancer that preserves existing button elements and functional bindings while injecting SVG icon surfaces and semantic effect variants.
- `styles.css` — `.css3-icon-control`, `.css3-button-icon`, and `.css3-effect-{fill,enter,expand,collapse,rotate}` implement the supplied CSS3 interaction family.
- `index.html` — loads the enhancement layer after `app.js`, allowing the existing application to initialize normally before presentation enhancement.
- Dynamic DOM surfaces are covered through `MutationObserver`, including the fixed All Documents action menu, modal buttons, form rerenders, and Activity in-place updates.

## v1.37.0 Actions menu stabilization

- `openDocumentActionMenu()` now owns a text-only semantic menu, explicit listener cleanup, pointer-vs-keyboard focus behavior, and delegated action invocation.
- `documentActionMenuCleanup` prevents stale document/window/table listeners from accumulating across repeated menu opens.
- `dispatchDocumentAction()` remains the canonical workflow dispatcher and continues to re-resolve the document at execution time.
- `css3-buttons.js` sanitizes legacy leading glyphs and derives `Edit/Approved` from clean action text.
- `styles.css` keeps action-menu icon/label descendants out of pointer hit testing so the button remains the stable interaction target.

## v1.38.0 Cohesive UI Design Overhaul

The v1.38.0 presentation layer intentionally preserves the existing DOM/state contracts and consolidates visual treatment in `styles.css`:

- Graphite application chrome and Active Company control
- Modular Create New document workspace and section cards
- Unified form/input/validation hierarchy across all six document workflows
- Shared financial, terms, approval, tracking, table, filter, modal, recovery, activity and empty-state surfaces
- CSS3 icon-button family retained as the primary semantic interaction accent
- Responsive overrides preserve the existing navigation, form, table and action-menu behaviors without changing event/state wiring

## v1.40.0 — Final-page-only PDF footer

- `buildPdfDocumentHtml()` now creates one `finalFooter` block in normal document flow.
- The footer is injected into the terminal Terms & Conditions section when terms exist; otherwise it is injected at the end of the main PDF section.
- Removed the legacy fixed `.pdf-footer` print element that browser pagination repeated on every page.
- `.pdf-final-footer` uses page-break avoidance so QR image, company text, and document number stay together.



## v1.41.0 — Source approval workflow reconciliation

Source authority reviewed from the supplied TradeLink codebase:

- `src/generated/hooks/useAdminAuth.js` → source-authorized email includes `asenagan@watchdogautomation.com.ph`.
- `src/generated/components/InvoiceForm.jsx::getQuotationApprovers()` → creator-based Sales Supervisor / Management routing, including Alex P. Señagan as the final approver for the established creator groups and no extra approval when Alex is the creator.
- `src/generated/utils/workflowCollections.js` → original Account Manager, Finance Team, Management, QC, Logistics, Payment Finance, and Payment Admin personnel collections.
- `src/generated/components/InvoiceForm.jsx` approval-status effects → source-compatible `Draft` / `For Approval` / `Approved` progression driven by assignment and timestamp completion.
- `src/generated/components/InvoiceForm.jsx::useTimeNow()` → assigned-user identity owns review/verification/approval timestamp capture.
- `src/generated/hooks/useDocumentLoader.js` → approval state is derived from required actors and completed workflow timestamps when documents are loaded.

Managed mapping:

- `WORKFLOW_DIRECTORY` → explicit source-aligned personnel metadata; Alex is represented as General Manager / final approver.
- `sourceQuotationApprovers()` → creator-based routing adapted from `getQuotationApprovers()` with a safe managed fallback that still assigns the General Manager final stage.
- `quotationHasCreatorAuthority()` / `poHasCreatorAuthority()` → identity-based creator authority instead of generic Admin-role authority.
- `approvalStatusForDocument()` → centralized workflow-state derivation.
- `captureApprovalStep()` → authorization-checked timestamp capture with enforced review-before-approval sequencing.
- `approvalQueueActions()` → stage-aware All Documents approval controls.
- `renderQuotationApproval()` / `renderPoApproval()` / `renderEsiApprovalWorkflow()` → source hierarchy and role ownership reflected in the UI.
- `generateDocumentPdf()` → Quotation/PO PDF generation requires completed approval routing.

The managed implementation intentionally preserves legacy `Submitted` / `Under Review` states for compatibility while new source-aligned submissions use `For Approval` until all required stages are complete.


## v1.42.0 — Quotation Use Time Now approval reconciliation

Verified directly against `TradeLink-code.zip`:

- `src/generated/components/InvoiceForm.jsx::getQuotationApprovers()` → creator-based Quotation routing. Angelica Anne Camille Señagan is the Sales Supervisor reviewer where review is required; Alex P. Señagan is the final Management approver for the established routes, with no additional approval when Alex is the creator.
- `src/generated/components/InvoiceForm.jsx::useTimeNow()` → approval/review completion is represented by capturing the current timestamp into `verifiedAt` / `approvedAt`.
- `src/generated/components/InvoiceForm.jsx` review and approval controls → the assigned user is the only user allowed to invoke **Use Time Now** for that stage, and final approval waits for the required review timestamp.
- `src/generated/hooks/useAdminAuth.js` → confirms `asenagan@watchdogautomation.com.ph` as an established source identity.
- The supplied requirement adds `aacsenagan@watchdogautomation.com.ph` as Angelica's stable Quotation workflow identity; email notification itself is intentionally deferred.

Managed mapping:

- `WORKFLOW_DIRECTORY` / `QUOTATION_APPROVAL_USERS` → exact Quotation identity directory for Angelica (Sales Supervisor) and Alex (General Manager / final approver).
- `workflowPerson()` / `workflowEmail()` / `canCurrentUserActAs()` → email-first identity authorization with name fallback for legacy/local records.
- `renderQuotationApproval()` → read-only Review / Approval timestamp fields plus **Use Time Now** actions; no free-form timestamp entry.
- `[data-capture-approval-step]` → current-time capture, draft autosave, immediate persistence for existing documents, status recomputation, and audit logging.
- `captureApprovalStep()` → same source-aligned capture path for All Documents approval actions.
- `approvalQueueActions()` → explicitly labels review/final-approval commands as **Use Time Now** actions.
- `normalizeForm()` → derives missing `verifiedByEmail` / `approvedByEmail` for historical Quotation records without changing the existing assigned names or timestamps.
