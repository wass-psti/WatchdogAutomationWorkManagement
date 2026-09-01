/* TradeLink commercial-domain configuration boundary — Work Management v1.27.0. */
(() => {
'use strict';
const APP_VERSION = '1.42.0';
const STORAGE_KEY = 'tradelink_state_v1';
const BACKUP_KEY = 'tradelink_state_backup_v1';
const UI_KEY = 'tradelink_ui_v1';
const AUTOSAVE_KEY = 'tradelink_draft_v1';
const VENDOR_LOGO_PREFIX = 'tradelink_vendor_logo_';
const VENDOR_QR_PREFIX = 'tradelink_vendor_qr_';
const MAX_VENDOR_ASSET_BYTES = 1024 * 1024;

const TYPES = {
  esi: { label:'ESI / Sales Invoice', short:'ESI', prefix:'ESI-', financial:true, approval:true, color:'#53775c' },
  delivery: { label:'Delivery Receipt', short:'DR', prefix:'DR-', financial:false, approval:false, color:'#8f9d87' },
  payment: { label:'Acknowledgment Receipt', short:'AR', prefix:'AR-', financial:false, approval:false, color:'#a97825' },
  quotation: { label:'Quotation', short:'Q', prefix:'Q-', financial:true, approval:true, color:'#ee7445' },
  po: { label:'Purchase Order', short:'PO', prefix:'PO-', financial:true, approval:true, color:'#bd4d28' },
  packing: { label:'Packing List', short:'PL', prefix:'PL-', financial:false, approval:false, color:'#79736a' }
};

const DEFAULT_VENDORS = [
  { id:'watchdog-opc', name:'Watchdog Automation OPC', address:'Bldg.2 Paseo de Amores Sergio Osmena St.\nGun-ob, Lapu-lapu City 6015', phone:'+63 917 7073079', email:'info@watchdogautomation.com.ph', website:'www.watchdogautomation.com.ph', tin:'010-737-641-000' },
  { id:'watchdog-sales', name:'Watchdog Automation Sales & Services', address:'Bldg.2 Paseo de Amores Sergio Osmena St.\nGun-ob, Lapu-lapu City 6015', phone:'+63 917 7073079', email:'info@watchdogautomation.com.ph', website:'www.watchdogautomation.com.ph', tin:'211-258-356-00000' },
  { id:'plc-systems', name:'PLC Systems Technik, Inc.', address:'Bldg.2 Paseo de Amores Sergio Osmena St.\nGun-ob, Lapu-lapu City 6015', phone:'+63 917 1118818', email:'sales@plcsystems.com.ph', website:'www.plcsystems.com.ph', tin:'463-678-854-000' }
];

const DEFAULT_VENDOR_TEMPLATES = {
  'watchdog-sales': { id:'watchdog-sales-reference-v1', name:'Watchdog Sales Reference', accent:'#ef4155', tableBackground:'#fce5e7', tableText:'#1644a3', ruleColor:'#2d65d5', termsMode:'new-page', referenceFile:'assets/template-watchdog-sales.pdf' },
  'watchdog-opc': { id:'watchdog-opc-reference-v1', name:'Watchdog OPC Reference', accent:'#14b866', tableBackground:'#e3f7e9', tableText:'#244f78', ruleColor:'#2f68c4', termsMode:'flow', referenceFile:'assets/template-watchdog-opc.pdf' },
  'plc-systems': { id:'plc-systems-reference-v1', name:'PLC Systems Reference', accent:'#0b9a9d', tableBackground:'#e3f6f5', tableText:'#2854a4', ruleColor:'#4772c7', termsMode:'flow', referenceFile:'assets/template-plc-systems.pdf' }
};
const TEMPLATE_TERMS_MODES = ['flow','new-page'];

const DEFAULT_TERMS = {
  esi:`Terms & Conditions
1. General. This Invoice is governed by the Supplier's standard Terms & Conditions. Acceptance of delivered goods or services constitutes full acceptance of these Terms. Any Client-imposed terms not expressly approved in writing are void.
2. Quotations & Orders. Prices and scope follow the approved Quotation/Proposal and accepted Purchase Order (PO). POs become binding upon Supplier's written confirmation and are non-cancellable except as provided under the Supplier's cancellation rules.
3. Prices & Payment. Prices are based on agreed commercial terms. Payment must follow the terms on the quotation or invoice. Late payments incur 2% monthly interest or the maximum rate permitted by law. Supplier may suspend deliveries or services for delayed or unpaid accounts.
4. Delivery & Risk. Delivery schedules are estimates only. Risk of loss or damage transfers to the Client upon delivery to the carrier or to the Client's premises, whichever occurs first. Title remains with the Supplier until full payment is settled.
5. Warranty. Products are warranted to be new, free from defects, and compliant with agreed specifications for 12 months from delivery or 6 months from commissioning, whichever comes first. Consumables and wear-and-tear items are excluded. Warranty covers repair, replacement, or refund at Supplier's discretion. Warranty is void for misuse, improper installation, unauthorized repairs, or force majeure events.
6. Returns. No returns allowed without prior written authorization. Accepted returns may incur restocking, inspection, and shipping charges. NCNR and custom-made items are strictly non-returnable.
7. Cancellation. Client cancellations require Supplier approval. NCNR items are charged at 100%, standard items at ≥50%, and special/custom items at 100%. Supplier may cancel POs for non-payment, breach, insolvency, or force majeure.
8. Liability. Supplier liability is limited to the invoiced value of the affected goods or services. Supplier is not liable for indirect or consequential losses including production downtime or profit loss.
9. Intellectual Property. All drawings, software, technical documents, and related IP remain the Supplier's property. No license or ownership transfers unless expressly agreed.
10. Confidentiality. All commercial and technical information provided by the Supplier must be kept confidential and not disclosed without written consent.
11. Governing Law. This Invoice and all related transactions shall be governed by Philippine laws. Disputes shall be resolved exclusively by the courts of Lapu-Lapu City, Cebu 6015, Philippines, without prejudice to the Supplier's right to seek remedies elsewhere when necessary.`,
  delivery:`DELIVERY RECEIPT TERMS AND CONDITIONS

1. Receipt of Items
By signing the Delivery Receipt (DR), the Customer confirms that the items were received in good order, complete, and free from visible defects.

2. Inspection Period
The Customer shall inspect all delivered items within 48 hours from receipt. Any discrepancies, shortages, or damages must be formally reported within this period. Failure to do so constitutes acceptance.

3. Warranty
Warranty coverage is limited strictly to manufacturer defects and is subject to the supplier's standard warranty terms. Misuse, mishandling, incorrect installation, or unauthorized repairs void the warranty.

4. Returns & Replacement
Returned items must be approved in advance. Only unused, unopened, and non-damaged items are eligible for return or replacement unless covered under valid warranty.

5. Ownership & Risk
Ownership transfers to the Customer upon full payment; however, risk of loss or damage transfers upon delivery and signing of the DR.

6. Installation & Commissioning
Unless explicitly included in the sales agreement, installation, programming, and commissioning services are not part of the spare parts delivery and shall be quoted separately.

7. Liability
The Supplier shall not be liable for any indirect, incidental, or consequential damages arising from the use or failure of delivered spare parts.

8. Payment Terms
Payments must follow the agreed billing terms stated in the corresponding quotation or purchase order.`,
  payment:`TERMS AND CONDITIONS

1. Purpose
This Electronic Payment Acknowledgement confirms that the Supplier has received payment from the Client via cash, bank transfer, or cheque. It serves only as a record of the transaction and is not a tax or BIR-related document.

2. Payment Validation
Cash payments are considered received once acknowledged.
Bank transfers are subject to confirmation of credit to the Supplier's account.
Cheque payments are acknowledged subject to bank clearing. If a cheque is returned or dishonored, this acknowledgement becomes void.

3. Reference Documents
This acknowledgement should reference the applicable invoice, purchase order, statement, or other commercial document when available.

4. Accuracy of Information
The Client is responsible for providing accurate payment details. Any correction to the amount, payment instrument, or reference information must be recorded through an updated acknowledgement.

5. Final Settlement
Issuance of this acknowledgement does not waive any remaining balance, charges, or obligations unless expressly stated in the related commercial agreement.

6. Record Retention
Both parties should retain a copy of this acknowledgement together with supporting payment records for reconciliation and audit purposes.`,
  quotation:`QUOTATION TERMS AND CONDITIONS

1. Validity
This quotation is valid only for the stated validity period. Pricing, delivery commitments, and availability may be reconfirmed after expiry.

2. Scope & Pricing
Quoted prices apply only to the listed goods and services, quantities, specifications, and commercial conditions. Changes in scope may require a revised quotation.

3. Taxes & Currency
Taxes are applied according to the selected VAT classification. Foreign-currency quotations remain subject to the stated currency and any separately agreed exchange-rate provisions.

4. Delivery Commitment
Delivery lead times are estimates unless expressly confirmed in writing and normally commence after receipt of an acceptable purchase order, required down payment, and complete technical information.

5. Payment Terms
Payment shall follow the terms stated in this quotation. Delayed payments may delay delivery, activation, commissioning, or release of goods.

6. Availability & Price Changes
Stock, manufacturer availability, freight, duties, and supplier pricing may change before order acceptance. Material changes will be communicated before confirmation.

7. Order Acceptance
A purchase order is subject to Supplier review and written acceptance. Client purchase-order terms do not override this quotation unless expressly accepted in writing.

8. Warranty & Returns
Warranty and return conditions follow the Supplier's applicable standard terms and manufacturer policies. Custom, configured, special-order, and NCNR items may be non-returnable.

9. Confidentiality
Commercial pricing and technical information in this quotation are confidential and intended only for the named Client and related evaluation personnel.

10. Governing Terms
Unless superseded by a signed agreement, this quotation and the Supplier's standard commercial terms govern the proposed transaction.`,
  po:`PURCHASE ORDER TERMS AND CONDITIONS

1. Order Acceptance
This Purchase Order is subject to supplier confirmation. Any exception to the quantities, specifications, prices, delivery terms, or commercial conditions must be communicated before fulfillment.

2. Scope & Specifications
Only the goods, services, quantities, models, and specifications listed in this Purchase Order are authorized. Substitutions require prior written approval.

3. Pricing & Currency
Prices are stated in the selected currency and are subject only to the taxes, discounts, and adjustments shown in this Purchase Order. Unapproved surcharges will not be accepted.

4. Delivery Commitment
The Supplier shall meet the stated delivery commitment and promptly advise of any risk of delay, shortage, partial shipment, or manufacturer constraint.

5. Packing & Documentation
Goods must be adequately packed and accompanied by applicable delivery receipts, packing lists, invoices, certificates, serial references, and other documents required for receiving.

6. Inspection & Acceptance
Delivered goods remain subject to quantity, condition, specification, and quality inspection. Non-conforming, damaged, short, or incorrect items may be rejected or returned.

7. Warranty
Supplier and manufacturer warranties apply as agreed. Warranty obligations include correction, repair, replacement, or other mutually accepted remedy for valid defects.

8. Payment
Payment follows the stated payment terms and is subject to complete delivery, acceptable documentation, and resolution of discrepancies unless otherwise agreed in writing.

9. Cancellation & Changes
Changes or cancellation require written authorization. Supplier must disclose NCNR, special-order, or cancellation exposure before accepting affected items.

10. Governing Commercial Terms
This Purchase Order, together with any expressly incorporated quotation or agreement, constitutes the authorized purchasing instruction. Conflicting supplier terms do not apply unless accepted in writing.`,
  packing:'This Packing List identifies the goods packaged for shipment and accompanies the related commercial documents.'
};

const STATUS_FLOW = ['Draft','For Approval','Approved','Submitted','Under Review','Generated','Completed','Rejected'];
const QUOTE_STATUS_OPTIONS = ['Working on it','Sent','Client Review','Accepted','Declined','On Hold','Closed'];
const CURRENCIES = [
  ['PHP','🇵🇭 ₱ Philippine Peso (PHP)'],['USD','🇺🇸 $ US Dollar (USD)'],['EUR','🇪🇺 € Euro (EUR)'],
  ['GBP','🇬🇧 £ British Pound (GBP)'],['JPY','🇯🇵 ¥ Japanese Yen (JPY)'],['CNY','🇨🇳 ¥ Chinese Yuan (CNY)'],
  ['SGD','🇸🇬 S$ Singapore Dollar (SGD)'],['AUD','🇦🇺 A$ Australian Dollar (AUD)'],['SAR','🇸🇦 Saudi Riyal (SAR)']
];
const PAYMENT_TERMS = ['Due on Receipt','COD (Cash on Delivery)','15 Days PDC','30 Days PDC','50% DP-Balance upon completion','Advance payment prior to delivery','Installment plans','30 Days Net','45 Days Net','60 Days Net','90 Days Net','Custom'];
const QUOTATION_VALIDITY=['15 Days','30 Days','60 Days','120 Days','6 Months','1 Year','Others (Custom Date)'];
const QUOTATION_DELIVERY=['3 Days (in Stock)','4 Weeks','6 Weeks','8 Weeks','12 Weeks','16 Weeks','20 Weeks','24 Weeks','Others (Custom)'];
const QUOTATION_NOTE_TEMPLATES=[['availability','Subject to stock and manufacturer availability at the time of order.'],['leadtime','Delivery lead time begins upon receipt of an accepted PO, required payment, and complete technical details.'],['freight','Freight, installation, commissioning, and other services are excluded unless specifically listed in this quotation.'],['nc_nr','Special-order and configured items may be non-cancellable and non-returnable (NCNR).']];
const PO_VALIDITY=['15 Days','30 Days','60 Days','120 Days','6 Months','1 Year','Others (Custom Date)'];
const PO_DELIVERY=['3 Days (in Stock)','4 Weeks','6 Weeks','8 Weeks','12 Weeks','16 Weeks','20 Weeks','24 Weeks','Others (Custom)'];
const PO_ACCOUNT_MANAGERS=['Alex P. Señagan','Angelica Anne Camille Señagan','Chris Emmanuel Q. Rama','Prospero C. Pajulas','Dionny P. Señagan'];
const PO_NOTE_TEMPLATES=[['ship','Partial shipment requires prior approval.'],['docs','Include delivery receipt, packing list, invoice, and applicable certificates with shipment.'],['ncnr','Identify NCNR or special-order items before order acceptance.'],['quality','Notify the purchaser immediately of any specification, availability, or delivery exception.']];
const DR_QC_PERSONNEL=['Dionny P. Señagan','Alex P. Señagan','Amalia P. Señagan'];
const DR_LOGISTICS_PERSONNEL=['Rodulfo Ogang, Jr','Jerome L. Nuñez','Prospero C. Pajulas','Daniela C. Cabanas','Alex P. Señagan'];
const PAYMENT_RECEIVERS=['Melanie P. Señagan'];
const PAYMENT_ADMINS=['Alex P. Señagan'];
const VAT_OPTIONS = [
  ['15_tkm','15% TKM VAT'],['15_ksa','15% KSA VAT'],['12','12% VAT'],['exempt','(0%) Tax Exempt VAT'],['zero','(0%) Zero Rated VAT']
];
const VAT_ALIASES = { 'vat-exclusive':'12', 'vat-inclusive':'12', '12':'12', '15_tkm':'15_tkm', '15_ksa':'15_ksa', exempt:'exempt', zero:'zero' };
const VAT_LABELS = Object.fromEntries(VAT_OPTIONS);
const APPROVERS = ['Sales Reviewer','Operations Manager','Finance Manager','Management'];
const ESI_FINANCE_TEAM = ['Melanie P. Señagan','Jonerey Torino','Daniela C. Cabanas'];
const ESI_MANAGEMENT_TEAM = ['Alex P. Señagan','Dionny P. Señagan','Amalia P. Señagan'];


// Approval hierarchy reconciled against the supplied TradeLink source implementation.
// Alex P. Señagan is the established General Manager and final approver.
const WORKFLOW_DIRECTORY = Object.freeze({
  generalManager: Object.freeze({ name:'Alex P. Señagan', email:'asenagan@watchdogautomation.com.ph', role:'General Manager', finalApprover:true }),
  salesSupervisor: Object.freeze({ name:'Angelica Anne Camille Señagan', email:'aacsenagan@watchdogautomation.com.ph', role:'Sales Supervisor', quotationReviewer:true })
});
const GENERAL_MANAGER = WORKFLOW_DIRECTORY.generalManager;
const SALES_SUPERVISOR = WORKFLOW_DIRECTORY.salesSupervisor;
const QUOTATION_APPROVAL_USERS = Object.freeze([SALES_SUPERVISOR, GENERAL_MANAGER]);
const SOURCE_ADMIN_EMAILS = ['asenagan@watchdogautomation.com.ph','lmsenagan@watchdogautomation.com.ph'];
  const PRIMARY_TABS = Object.freeze(['create','documents','manual','recovery']);
  const TAB_ROUTES = Object.freeze({ create:'#/create-new', documents:'#/all-documents', manual:'#/user-manual', recovery:'#/recovery' });
  const ROUTE_TABS = Object.freeze(Object.fromEntries(Object.entries(TAB_ROUTES).map(([tab,route])=>[route,tab])));
  const LEGACY_TAB_REDIRECTS = Object.freeze({ overview:'create', approvals:'documents', activity:'recovery', guide:'manual' });
  const LEGACY_ROUTE_REDIRECTS = Object.freeze({ '#/overview':'create', '#/create':'create', '#/documents':'documents', '#/approvals':'documents', '#/activity':'recovery', '#/guide':'manual' });
  globalThis.WMTradeLinkDomain = Object.freeze({APP_VERSION,STORAGE_KEY,BACKUP_KEY,UI_KEY,AUTOSAVE_KEY,VENDOR_LOGO_PREFIX,VENDOR_QR_PREFIX,MAX_VENDOR_ASSET_BYTES,TYPES,DEFAULT_VENDORS,DEFAULT_VENDOR_TEMPLATES,TEMPLATE_TERMS_MODES,DEFAULT_TERMS,STATUS_FLOW,QUOTE_STATUS_OPTIONS,CURRENCIES,PAYMENT_TERMS,QUOTATION_VALIDITY,QUOTATION_DELIVERY,QUOTATION_NOTE_TEMPLATES,PO_VALIDITY,PO_DELIVERY,PO_ACCOUNT_MANAGERS,PO_NOTE_TEMPLATES,DR_QC_PERSONNEL,DR_LOGISTICS_PERSONNEL,PAYMENT_RECEIVERS,PAYMENT_ADMINS,VAT_OPTIONS,VAT_ALIASES,VAT_LABELS,APPROVERS,ESI_FINANCE_TEAM,ESI_MANAGEMENT_TEAM,WORKFLOW_DIRECTORY,GENERAL_MANAGER,SALES_SUPERVISOR,QUOTATION_APPROVAL_USERS,SOURCE_ADMIN_EMAILS,PRIMARY_TABS,TAB_ROUTES,ROUTE_TABS,LEGACY_TAB_REDIRECTS,LEGACY_ROUTE_REDIRECTS});
})();
