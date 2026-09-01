const { APP_VERSION, STORAGE_KEY, BACKUP_KEY, UI_KEY, AUTOSAVE_KEY, VENDOR_LOGO_PREFIX, VENDOR_QR_PREFIX, MAX_VENDOR_ASSET_BYTES, TYPES, DEFAULT_VENDORS, DEFAULT_VENDOR_TEMPLATES, TEMPLATE_TERMS_MODES, DEFAULT_TERMS, STATUS_FLOW, QUOTE_STATUS_OPTIONS, CURRENCIES, PAYMENT_TERMS, QUOTATION_VALIDITY, QUOTATION_DELIVERY, QUOTATION_NOTE_TEMPLATES, PO_VALIDITY, PO_DELIVERY, PO_ACCOUNT_MANAGERS, PO_NOTE_TEMPLATES, DR_QC_PERSONNEL, DR_LOGISTICS_PERSONNEL, PAYMENT_RECEIVERS, PAYMENT_ADMINS, VAT_OPTIONS, VAT_ALIASES, VAT_LABELS, APPROVERS, ESI_FINANCE_TEAM, ESI_MANAGEMENT_TEAM, WORKFLOW_DIRECTORY, GENERAL_MANAGER, SALES_SUPERVISOR, QUOTATION_APPROVAL_USERS, SOURCE_ADMIN_EMAILS, PRIMARY_TABS, TAB_ROUTES, ROUTE_TABS, LEGACY_TAB_REDIRECTS, LEGACY_ROUTE_REDIRECTS } = globalThis.WMTradeLinkDomain || (() => { throw new Error('TradeLink domain configuration failed to load.'); })();

const todayISO = () => new Date().toISOString().slice(0,10);
const nowISO = () => new Date().toISOString();
const uid = (prefix='id') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
const esc = (value='') => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDate = (value, withTime=false) => { if(!value) return '—'; const d=new Date(value); if(Number.isNaN(d.getTime())) return value; return new Intl.DateTimeFormat('en-PH', withTime ? {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'} : {month:'short',day:'numeric',year:'numeric'}).format(d); };
const money = (amount, currency='PHP') => { const n=Number(amount)||0; try{return new Intl.NumberFormat('en-PH',{style:'currency',currency,maximumFractionDigits:2}).format(n)}catch{return `${currency} ${n.toFixed(2)}`}; };
const deepCopy = obj => JSON.parse(JSON.stringify(obj));
const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
const scrollBehavior = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth';

function normalizePersonName(value=''){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function samePerson(a,b){
  const av=typeof a==='object'&&a?a.name:a, bv=typeof b==='object'&&b?b.name:b;
  const an=normalizePersonName(av), bn=normalizePersonName(bv);
  return !!an && !!bn && an===bn;
}
function workflowPerson(value){
  if(!value)return null;
  const name=typeof value==='object'?value.name:value;
  const email=typeof value==='object'?String(value.email||'').toLowerCase().trim():'';
  return QUOTATION_APPROVAL_USERS.find(person => (email && email===person.email) || samePerson(name,person.name)) || null;
}
function workflowEmail(value){ return workflowPerson(value)?.email || ''; }
function workflowRole(value){ return workflowPerson(value)?.role || ''; }
function isGeneralManagerIdentity(person){
  if(!person)return false;
  const target=workflowPerson(person);
  if(target)return target.email===GENERAL_MANAGER.email;
  const email=typeof person==='object'?String(person.email||'').toLowerCase().trim():'';
  return email===GENERAL_MANAGER.email || samePerson(person,GENERAL_MANAGER.name);
}
function canCurrentUserActAs(personName){
  if(!personName)return false;
  const target=workflowPerson(personName);
  const current=state?.currentUser||{};
  if(target){
    const currentEmail=String(current.email||'').toLowerCase().trim();
    if(currentEmail)return currentEmail===target.email;
    return samePerson(current,target.name);
  }
  return samePerson(current,personName);
}
function normalizeCurrentUser(user){
  const ctx=globalThis.WM_IDENTITY_CONTEXT;
  if(ctx?.user?.id)return {id:`cloud:${ctx.user.id}`,name:ctx.user.displayName||ctx.user.email,email:ctx.user.email||'',role:ctx.module?.role||'User',source:'work-management-cloud'};
  const raw=user&&typeof user==='object'?user:{};
  if(isGeneralManagerIdentity(raw))return {...raw,name:GENERAL_MANAGER.name,email:GENERAL_MANAGER.email,role:GENERAL_MANAGER.role};
  return {id:raw.id||'',name:raw.name||'Authenticated User',email:raw.email||'',role:raw.role||'User',source:'work-management-cloud'};
}
function sourceQuotationApprovers(creator){
  const n=normalizePersonName(typeof creator==='object'?creator?.name:creator);
  if((n.includes('prospero')||n.includes('pajulas')||n.includes('chris emmanuel')||n.includes('rama'))){
    return {reviewer:SALES_SUPERVISOR.name,approver:GENERAL_MANAGER.name};
  }
  if(isGeneralManagerIdentity(typeof creator==='object'?creator:{name:creator}))return {reviewer:'',approver:''};
  if((n.includes('dionny')&&n.includes('senagan'))||(n.includes('angelica')&&n.includes('senagan'))||(n.includes('alvin')&&n.includes('damulo'))){
    return {reviewer:'',approver:GENERAL_MANAGER.name};
  }
  // The source leaves the fallback management slot selectable. In the authenticated cloud build the
  // General Manager is the explicit final approver, so keep the source Sales Supervisor review
  // and bind the final stage to Alex instead of leaving an unowned approval step.
  return {reviewer:SALES_SUPERVISOR.name,approver:GENERAL_MANAGER.name};
}
function approvalStatusForDocument(d){
  if(!d||typeof d!=='object')return 'Draft';
  if(['quotation','po'].includes(d.documentType)){
    const authority=(d.documentType==='quotation'?quotationHasCreatorAuthority(d):poHasCreatorAuthority(d));
    const needsReviewer=!!String(d.verifiedBy||'').trim(), needsApprover=!!String(d.approvedBy||'').trim();
    if(authority&&!needsReviewer&&!needsApprover)return 'Approved';
    if((!needsReviewer||!!d.verifiedAt)&&(!needsApprover||!!d.approvedAt)&&(needsReviewer||needsApprover))return 'Approved';
    return (needsReviewer||needsApprover)?'For Approval':'Draft';
  }
  if(d.documentType==='esi'){
    const hasVerifier=!!String(d.verifiedBy||'').trim(), hasApprover=!!String(d.approvedBy||'').trim();
    if(hasVerifier&&hasApprover&&d.verifiedAt&&d.approvedAt)return 'Approved';
    return (hasVerifier||hasApprover)?'For Approval':'Draft';
  }
  if(d.documentType==='delivery'){
    const a=!!String(d.checkedBy||'').trim(),b=!!String(d.deliveredBy||'').trim();
    if(a&&b&&d.checkedAt&&d.deliveredAt)return 'Approved';
    return (a||b)?'For Approval':'Draft';
  }
  if(d.documentType==='payment'){
    const a=!!String(d.receivedBy||'').trim(),b=!!String(d.verifiedBy||'').trim();
    if(a&&b&&d.receivedAt&&d.verifiedAt)return 'Approved';
    return (a||b)?'For Approval':'Draft';
  }
  return d.status||'Draft';
}

function initialState(){
  return {
    version: APP_VERSION,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    currentUser:normalizeCurrentUser(globalThis.WM_IDENTITY_CONTEXT?.user||{}),
    vendors:deepCopy(DEFAULT_VENDORS), selectedVendorId:'watchdog-sales', vendorTemplates:deepCopy(DEFAULT_VENDOR_TEMPLATES),
    counters:{ esi:11130, delivery:11130, payment:11130, quotation:11130, po:11130, packing:11130 },
    documents:[], audit:[], comments:{}, snapshots:[],
    clients:[], suppliers:[], products:[],
    settings:{ autosave:true, duplicateDetection:true, backups:true, pageSize:20 }
  };
}

function normalizeVendors(raw){
  const supplied=Array.isArray(raw)?raw:[];
  const seen=new Set();
  const normalized=[];
  for(const base of DEFAULT_VENDORS){
    const incoming=supplied.find(v=>v&&v.id===base.id);
    normalized.push({...base,...(incoming&&typeof incoming==='object'?incoming:{}),id:base.id,name:String(incoming?.name||base.name).trim()||base.name});
    seen.add(base.id);
  }
  for(const incoming of supplied){
    if(!incoming||typeof incoming!=='object'||seen.has(incoming.id))continue;
    const id=String(incoming.id||'').trim(),name=String(incoming.name||'').trim();
    if(!id||!name)continue;
    normalized.push({id,name,address:String(incoming.address||''),phone:String(incoming.phone||''),email:String(incoming.email||''),website:String(incoming.website||''),tin:String(incoming.tin||'')});
    seen.add(id);
  }
  return normalized.map(v=>{const out={...v};delete out.logo;delete out.qrCode;return out});
}
function normalizeVendorTemplates(raw,vendors){
  const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{}; const out={};
  for(const vendor of vendors){ const base=DEFAULT_VENDOR_TEMPLATES[vendor.id]||{id:`${vendor.id}-template-v1`,name:`${vendor.name} Template`,accent:'#2563eb',tableBackground:'#eef4ff',tableText:'#1644a3',ruleColor:'#2d65d5',termsMode:'new-page',referenceFile:''}; const incoming=source[vendor.id]&&typeof source[vendor.id]==='object'?source[vendor.id]:{}; const termsMode=TEMPLATE_TERMS_MODES.includes(incoming.termsMode)?incoming.termsMode:base.termsMode; const color=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):fallback; out[vendor.id]={...base,...incoming,id:String(incoming.id||base.id),name:String(incoming.name||base.name).trim()||base.name,accent:color(incoming.accent,base.accent),tableBackground:color(incoming.tableBackground,base.tableBackground),tableText:color(incoming.tableText,base.tableText),ruleColor:color(incoming.ruleColor,base.ruleColor),termsMode,referenceFile:base.referenceFile}; } return out;
}
function companyTemplate(vendorId){ const id=vendorById(vendorId)?.id||state.selectedVendorId; return deepCopy(state.vendorTemplates?.[id]||DEFAULT_VENDOR_TEMPLATES[id]||{id:`${id}-template`,name:'Company Template',accent:'#2563eb',tableBackground:'#eef4ff',tableText:'#1644a3',ruleColor:'#2d65d5',termsMode:'new-page',referenceFile:''}); }
function documentTemplate(d){ const v=documentVendor(d); const snap=d?.template&&typeof d.template==='object'?d.template:null; return snap?{...companyTemplate(v.id),...snap}:companyTemplate(v.id); }
function normalizeDocumentCompanyAssociation(doc,vendors,fallbackVendorId){
  if(!doc||typeof doc!=='object')return doc;
  const copy=deepCopy(doc);
  const valid=id=>vendors.some(v=>v.id===id);
  let vendorId=String(copy.vendorId||copy.vendor?.id||'').trim();
  if(!valid(vendorId)) vendorId=valid(fallbackVendorId)?fallbackVendorId:(vendors[0]?.id||'');
  const live=vendors.find(v=>v.id===vendorId)||null;
  const snapshot=copy.vendor&&typeof copy.vendor==='object'?copy.vendor:{};
  copy.vendorId=vendorId;
  copy.vendor={...snapshot,id:vendorId,name:String(snapshot.name||live?.name||'').trim()||live?.name||vendorId};
  // Once captured, this identifier belongs to the document rather than the global Active Company selector.
  if(!copy.companyBoundAt) copy.companyBoundAt=copy.createdAt||copy.updatedAt||nowISO();
  return copy;
}
function normalizeDocumentWorkflowAssociation(doc){
  if(!doc||typeof doc!=='object')return doc;
  const copy=deepCopy(doc);
  if(samePerson(copy.createdBy,GENERAL_MANAGER.name)){
    copy.createdBy=GENERAL_MANAGER.name;
    copy.createdByEmail=copy.createdByEmail||GENERAL_MANAGER.email;
    copy.createdByRole=copy.createdByRole||GENERAL_MANAGER.role;
  }
  if(['quotation','po'].includes(copy.documentType) && ['Draft','For Approval','Submitted','Under Review'].includes(String(copy.status||'Draft'))){
    const route=sourceQuotationApprovers({name:copy.createdBy,email:copy.createdByEmail,role:copy.createdByRole});
    if(!copy.verifiedBy&&route.reviewer)copy.verifiedBy=route.reviewer;
    if(!copy.approvedBy&&route.approver)copy.approvedBy=route.approver;
  }
  return copy;
}
function documentCompanyId(doc){
  const id=String(doc?.vendorId||doc?.vendor?.id||'').trim();
  return vendorById(id)?.id||'';
}
function ensureFormCompanyBinding(form,{existing=null}={}){
  if(!form||typeof form!=='object')throw new Error('Document form is unavailable.');
  // Existing records are authoritative: editing can never rebind a document to the live global company.
  const existingId=documentCompanyId(existing);
  const formId=documentCompanyId(form);
  const vendorId=existingId||formId;
  const vendor=vendorById(vendorId);
  if(!vendor)throw new Error('The document company association is missing or invalid. Create a new document under a valid Active Company.');
  form.vendorId=vendor.id;
  const prior=form.vendor&&typeof form.vendor==='object'?form.vendor:{};
  form.vendor={...prior,id:vendor.id,name:String(prior.name||vendor.name).trim()||vendor.name};
  form.companyBoundAt=existing?.companyBoundAt||form.companyBoundAt||existing?.createdAt||nowISO();
  return vendor;
}
function normalizeState(raw){
  const base=initialState();
  if(!raw || typeof raw!=='object') return base;
  const vendors=normalizeVendors(raw.vendors);
  const requested=String(raw.selectedVendorId||base.selectedVendorId);
  const selectedVendorId=vendors.some(v=>v.id===requested)?requested:(vendors.some(v=>v.id===base.selectedVendorId)?base.selectedVendorId:vendors[0]?.id||'');
  const vendorTemplates=normalizeVendorTemplates(raw.vendorTemplates,vendors);
  return {
    ...base, ...raw,
    currentUser:normalizeCurrentUser({...base.currentUser,...raw.currentUser}),
    vendors, selectedVendorId, vendorTemplates,
    counters:{...base.counters,...raw.counters},
    documents:Array.isArray(raw.documents)?raw.documents.map(d=>normalizeDocumentWorkflowAssociation(normalizeDocumentCompanyAssociation(d,vendors,selectedVendorId))):[], audit:Array.isArray(raw.audit)?raw.audit:[],
    comments:raw.comments&&typeof raw.comments==='object'?raw.comments:{}, snapshots:Array.isArray(raw.snapshots)?raw.snapshots:[],
    clients:Array.isArray(raw.clients)?raw.clients:[], suppliers:Array.isArray(raw.suppliers)?raw.suppliers:[], products:Array.isArray(raw.products)?raw.products:[],
    settings:{...base.settings,...raw.settings}
  };
}

function loadState(){
  const parse = key => { try { return JSON.parse(globalThis.WMModuleStore.getItem(key)||'null'); } catch { return null; } };
  const primary=parse(STORAGE_KEY); if(primary) return normalizeState(primary);
  const backup=parse(BACKUP_KEY); if(backup){ globalThis.WMModuleStore.setItem(STORAGE_KEY,JSON.stringify(backup)); return normalizeState(backup); }
  return initialState();
}
let state=loadState();
const CLOUD_IDENTITY=globalThis.WM_IDENTITY_CONTEXT;
if(CLOUD_IDENTITY?.user?.id){state.currentUser={id:`cloud:${CLOUD_IDENTITY.user.id}`,name:CLOUD_IDENTITY.user.displayName||CLOUD_IDENTITY.user.email,email:CLOUD_IDENTITY.user.email||'',role:CLOUD_IDENTITY.module?.role||'User',source:'work-management-cloud'};}
function vendorAssetKey(vendorId,kind){ return `${kind==='qr'?VENDOR_QR_PREFIX:VENDOR_LOGO_PREFIX}${vendorId}`; }
function validImageData(value){ return typeof value==='string' && /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(value); }
function getVendorAsset(vendorId,kind){ try{const value=globalThis.WMModuleStore.getItem(vendorAssetKey(vendorId,kind));return validImageData(value)?value:''}catch{return ''} }
function setVendorAsset(vendorId,kind,value){ if(!state.vendors.some(v=>v.id===vendorId))throw new Error('Unknown company.'); if(!validImageData(value))throw new Error('Invalid image data.'); globalThis.WMModuleStore.setItem(vendorAssetKey(vendorId,kind),value); }
function deleteVendorAsset(vendorId,kind){ try{globalThis.WMModuleStore.removeItem(vendorAssetKey(vendorId,kind))}catch{} }
function collectVendorAssets(){ const out={}; for(const v of state.vendors){const logo=getVendorAsset(v.id,'logo'),qrCode=getVendorAsset(v.id,'qr');if(logo||qrCode)out[v.id]={...(logo?{logo}:{}),...(qrCode?{qrCode}:{})};} return out; }
function restoreVendorAssets(assets,{clear=true}={}){ if(clear){for(const v of state.vendors){deleteVendorAsset(v.id,'logo');deleteVendorAsset(v.id,'qr')}} if(!assets||typeof assets!=='object'||Array.isArray(assets))return; for(const [id,data] of Object.entries(assets)){if(!state.vendors.some(v=>v.id===id)||!data||typeof data!=='object')continue;if(validImageData(data.logo))setVendorAsset(id,'logo',data.logo);if(validImageData(data.qrCode))setVendorAsset(id,'qr',data.qrCode);} }
function migrateEmbeddedVendorAssets(){ let changed=false,stored=null;try{stored=JSON.parse(globalThis.WMModuleStore.getItem(STORAGE_KEY)||'null')}catch{} for(const v of state.vendors){const raw=(stored?.vendors||[]).find(x=>x?.id===v.id);if(raw?.logo&&validImageData(raw.logo)&&!getVendorAsset(v.id,'logo')){try{setVendorAsset(v.id,'logo',raw.logo)}catch{} changed=true}if(raw?.qrCode&&validImageData(raw.qrCode)&&!getVendorAsset(v.id,'qr')){try{setVendorAsset(v.id,'qr',raw.qrCode)}catch{} changed=true}} if(changed)try{globalThis.WMModuleStore.setItem(STORAGE_KEY,JSON.stringify(state))}catch{} }
migrateEmbeddedVendorAssets();
let ui={ tab:'create', editingId:null, previewId:null, search:'', type:'all', status:'all', quoteStatus:'all', companyFilter:'all', page:1, documentSort:'updated-desc', documentRange:'all', selectedDocumentIds:[], approvalQueueOpen:true, form:null, errors:{}, modal:null, recoveryPane:'tools', activitySearch:'', activityAction:'all', activityType:'all', activityRange:'all', activitySort:'newest', activityPage:1, termsExpanded:false, companyPanelOpen:false };
try { ui={...ui,...JSON.parse(globalThis.WMModuleStore.getItem(UI_KEY)||'{}')}; } catch {}
ui.companyPanelOpen=false;
const initialHash = location.hash;
const routeTab = ROUTE_TABS[initialHash] || LEGACY_ROUTE_REDIRECTS[initialHash];
if(initialHash==='#/activity') ui.recoveryPane='activity';
ui.tab = routeTab || LEGACY_TAB_REDIRECTS[ui.tab] || ui.tab;
if(!PRIMARY_TABS.includes(ui.tab)) ui.tab='create';
function syncRoute(tab, replace=false){ const next=TAB_ROUTES[tab]||TAB_ROUTES.create; if(location.hash===next)return; history[replace?'replaceState':'pushState'](null,'',next); }

function persist(reason='update', audit=true){
  try {
    const current=globalThis.WMModuleStore.getItem(STORAGE_KEY); if(current) globalThis.WMModuleStore.setItem(BACKUP_KEY,current);
    state.updatedAt=nowISO(); const persistedState={...state,currentUser:null}; globalThis.WMModuleStore.setItem(STORAGE_KEY,JSON.stringify(persistedState));
    globalThis.WMModuleStore.setItem(UI_KEY,JSON.stringify({...ui,form:undefined,errors:{},modal:null,companyPanelOpen:false}));
    if(audit) addAudit('system','State persisted',reason,null,false);
  } catch(error){ toast(`Unable to persist data: ${error.message}`,'error'); throw error; }
}
function addAudit(action, title, detail='', documentId=null, save=true){
  state.audit.unshift({id:uid('audit'),at:nowISO(),user:state.currentUser.name,role:state.currentUser.role,action,title,detail,documentId});
  state.audit=state.audit.slice(0,1000); if(save) persist('audit',false);
}
function snapshot(label='Manual snapshot'){
  const data={...state,snapshots:[]},vendorAssets=collectVendorAssets();
  const encoded=JSON.stringify({data,vendorAssets});
  const hash=simpleHash(encoded);
  state.snapshots.unshift({id:uid('snapshot'),at:nowISO(),label,hash,data,vendorAssets}); state.snapshots=state.snapshots.slice(0,12);
  addAudit('backup','Snapshot created',`${label} · ${hash}`,null,false); persist('snapshot',false); toast('Snapshot created');
}
function simpleHash(text){ let h=2166136261; for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)} return `TL-${(h>>>0).toString(16).padStart(8,'0')}`; }
function restoreSnapshot(id){ const s=state.snapshots.find(x=>x.id===id); if(!s) return; const keep=deepCopy(state.snapshots); state=normalizeState(deepCopy(s.data)); state.snapshots=keep; if(s.vendorAssets)restoreVendorAssets(s.vendorAssets, {clear:true}); addAudit('restore','Snapshot restored',`${s.label} · ${s.hash}`,null,false); persist('restore snapshot',false); ui.tab='recovery'; syncRoute('recovery',true); render(); toast('Snapshot restored'); }

function vendorById(id){ return state.vendors.find(v=>v.id===id)||null; }
function selectedVendor(){ const v=vendorById(state.selectedVendorId)||state.vendors[0]||DEFAULT_VENDORS[1]; return {...v,logo:getVendorAsset(v.id,'logo'),qrCode:getVendorAsset(v.id,'qr')}; }
function documentVendor(d){ const id=d?.vendorId||d?.vendor?.id; const live=id?vendorById(id):null; const snapshot=d?.vendor&&typeof d.vendor==='object'?d.vendor:null; const base=live||snapshot||(!d?selectedVendor():null); if(!base)return {id:'',name:'Unassigned Company',address:'',phone:'',email:'',website:'',tin:'',logo:'',qrCode:''}; return {...base,logo:(base.id?getVendorAsset(base.id,'logo'):'')||snapshot?.logo||'',qrCode:(base.id?getVendorAsset(base.id,'qr'):'')||snapshot?.qrCode||''}; }
function vendorProfileMissing(v){ return [['name','Name'],['address','Address'],['phone','Phone'],['email','Email'],['tin','TIN']].filter(([k])=>!String(v?.[k]||'').trim()).map(([,label])=>label); }
function vendorShortName(v){ if(!v)return 'Company'; if(v.id==='watchdog-opc')return 'Watchdog OPC'; if(v.id==='watchdog-sales')return 'Watchdog'; if(v.id==='plc-systems')return 'PLC'; return String(v.name||'Company').split(' ').slice(0,2).join(' '); }
function defaultBundledVendorLogo(v){ const files={'watchdog-sales':'assets/watchdog-logo.png','watchdog-opc':'assets/watchdog-opc-logo.png','plc-systems':'assets/plc-systems-logo.png'}; return files[v?.id]?new URL(files[v.id],location.href).href:''; }
function vendorLogoSource(v){ return v?.logo||defaultBundledVendorLogo(v)||''; }

function nextNumber(type){ state.counters[type]=(Number(state.counters[type])||11130)+1; return `${TYPES[type].prefix}${state.counters[type]}`; }
function defaultItem(){ return {id:uid('line'),type:'item',description:'',quantity:1,unitPrice:0,amount:0,serialNumber:''}; }
function defaultNote(){ return {id:uid('note'),type:'note',description:'',quantity:0,unitPrice:0,amount:0}; }
function isRealItem(item){ return (item?.type||'item')!=='note'; }
function itemAmount(item){ return isRealItem(item)?(Number(item?.quantity)||0)*(Number(item?.unitPrice)||0):0; }
function newForm(type='quotation'){
  const tpl=companyTemplate(state.selectedVendorId);
  const form={ id:null, vendorId:state.selectedVendorId, companyBoundAt:nowISO(), templateId:tpl.id, template:deepCopy(tpl), documentType:type, documentNumber:'', date:todayISO(), status:'Draft', quoteStatus:type==='quotation'?'Working on it':'', customerName:'', customerAddress:'', customerTin:'', customerContact:'', customerEmail:'', customerPhone:'', dueDate:'', referenceNumber:'', poNumber:'', paymentTerms:'30 Days Net', paymentTermsCustom:'', validity:'30 Days', validityCustom:'', deliveryCommitment:'', deliveryCommitmentCustom:'', remarks:'', terms:DEFAULT_TERMS[type], currency:'PHP', exchangeRate:1, vatType:'zero', discountType:'percentage', discountValue:0, discountReason:'', items:[defaultItem()], createdBy:state.currentUser.name, createdByEmail:state.currentUser.email||'', createdByRole:state.currentUser.role||'', verifiedBy:'',verifiedByEmail:'',verifiedAt:'',approvedBy:'',approvedByEmail:'',approvedAt:'', paymentForm:'cash',cashAmount:0,bankName:'',chequeAmount:0,chequeNumber:'',paymentParticulars:'',receivedBy:'',receivedAt:'', drIncludePricing:false, checkedBy:'',checkedAt:'',deliveredBy:'',deliveredAt:'', createdAt:null,updatedAt:null };
  if(['quotation','po'].includes(type)){
    const route=sourceQuotationApprovers({name:form.createdBy,email:form.createdByEmail,role:form.createdByRole});
    form.verifiedBy=route.reviewer;
    form.verifiedByEmail=workflowEmail(route.reviewer);
    form.approvedBy=route.approver;
    form.approvedByEmail=workflowEmail(route.approver);
  }
  if(type==='esi') delete form.remarks;
  return form;
}
function normalizeVatType(value){ return VAT_ALIASES[value] || 'zero'; }
function vatRate(value){ const v=normalizeVatType(value); return (v==='15_tkm'||v==='15_ksa')?0.15:v==='12'?0.12:0; }
function vatLabel(value){ if(value==='vat-exclusive')return '12% VAT'; if(value==='vat-inclusive')return '12% VAT (legacy inclusive)'; return VAT_LABELS[normalizeVatType(value)] || '(0%) Zero Rated VAT'; }
function normalizeForm(doc){
  const base=newForm(doc?.documentType||'quotation');
  const items=Array.isArray(doc?.items)&&doc.items.length?deepCopy(doc.items).map(i=>({...i,type:i.type||'item'})):[defaultItem()];
  const vendorId=vendorById(doc?.vendorId||doc?.vendor?.id)?.id||base.vendorId;
  const normalized={...base,...deepCopy(doc),vendorId,items};
  if(samePerson(normalized.createdBy,GENERAL_MANAGER.name)){normalized.createdBy=GENERAL_MANAGER.name;normalized.createdByEmail=normalized.createdByEmail||GENERAL_MANAGER.email;normalized.createdByRole=normalized.createdByRole||GENERAL_MANAGER.role;}
  if(['quotation','po'].includes(normalized.documentType) && !normalized.id){const route=sourceQuotationApprovers({name:normalized.createdBy,email:normalized.createdByEmail,role:normalized.createdByRole});if(!normalized.verifiedBy&&route.reviewer)normalized.verifiedBy=route.reviewer;if(!normalized.approvedBy&&route.approver)normalized.approvedBy=route.approver;}
  if(normalized.documentType==='quotation'){
    normalized.verifiedByEmail=workflowEmail(normalized.verifiedBy)||normalized.verifiedByEmail||'';
    normalized.approvedByEmail=workflowEmail(normalized.approvedBy)||normalized.approvedByEmail||'';
  }
  ensureFormCompanyBinding(normalized,{existing:doc?.id?doc:null}); if(!normalized.template||typeof normalized.template!=='object'){const tpl=companyTemplate(vendorId);normalized.templateId=tpl.id;normalized.template=deepCopy(tpl);}
  if(normalized.documentType==='esi') delete normalized.remarks;
  if(normalized.documentType==='quotation'&&!QUOTE_STATUS_OPTIONS.includes(normalized.quoteStatus)) normalized.quoteStatus=normalized.quoteStatus||'Working on it';
  // Preserve historical records that stored a user-entered payment term directly.
  if(normalized.paymentTerms && !PAYMENT_TERMS.includes(normalized.paymentTerms)){
    normalized.paymentTermsCustom=normalized.paymentTermsCustom||normalized.paymentTerms;
    normalized.paymentTerms='Custom';
  }
  return normalized;
}
function resolvedPaymentTerms(form){return form?.paymentTerms==='Custom'?(String(form?.paymentTermsCustom||'').trim()||'Custom'):String(form?.paymentTerms||'');}
function resolvedValidity(form){return String(form?.validity||'').startsWith('Others')?(form?.validityCustom?`Custom · ${fmtDate(form.validityCustom)}`:'Custom date'):String(form?.validity||'');}
function resolvedDeliveryCommitment(form){return String(form?.deliveryCommitment||'').startsWith('Others')?(String(form?.deliveryCommitmentCustom||'').trim()||'Custom'):String(form?.deliveryCommitment||'');}

function esiApprovalState(form){
  const verifier=String(form?.verifiedBy||'').trim(), approver=String(form?.approvedBy||'').trim();
  const verified=Boolean(verifier&&form?.verifiedAt), approved=Boolean(approver&&form?.approvedAt);
  if(verified&&approved)return {key:'approved',label:'Approval complete',detail:'Finance verification and management approval are recorded.',ready:true};
  if(form?.status==='Rejected')return {key:'rejected',label:'Rejected',detail:'This Electronic SI was rejected. Review the document before resubmission.',ready:Boolean(verifier&&approver)};
  if(form?.status==='Submitted'||form?.status==='Under Review')return {key:'pending',label:'Pending approval',detail:verified?'Finance verification recorded; management approval is pending.':'Waiting for finance verification.',ready:Boolean(verifier&&approver)};
  if(verifier&&approver)return {key:'ready',label:'Ready for submission',detail:'Verifier and final approver are assigned.',ready:true};
  return {key:'draft',label:'Assignments incomplete',detail:'Assign both Finance verification and Management approval before submitting.',ready:false};
}
function renderEsiApprovalWorkflow(f){
  const flow=esiApprovalState(f);
  const verifierValid=!f.verifiedBy||ESI_FINANCE_TEAM.includes(f.verifiedBy);
  const approverValid=!f.approvedBy||ESI_MANAGEMENT_TEAM.includes(f.approvedBy);
  const createdAt=f.createdAt?fmtDate(f.createdAt,true):'Timestamp assigned on first save';
  const canVerify=!!f.verifiedBy&&canCurrentUserActAs(f.verifiedBy);
  const canApprove=!!f.approvedBy&&canCurrentUserActAs(f.approvedBy)&&!!f.verifiedAt;
  return `<div class="form-section esi-approval-section" id="esiApprovalWorkflow" tabindex="-1"><div class="form-section-title approval-title"><div><strong>Verification & Approval Workflow</strong><small>Source hierarchy preserved: Creator → Finance verification → Management final approval. Assignments and timestamps persist with this Electronic SI.</small></div><span class="workflow-state ${flow.key}" aria-live="polite">${esc(flow.label)}</span></div>
    <div class="approval-progress" aria-label="Electronic SI approval steps"><div class="approval-step complete"><span>1</span><div><strong>Created</strong><small>${esc(f.createdBy||state.currentUser.name)}</small></div></div><div class="approval-connector"></div><div class="approval-step ${f.verifiedAt?'complete':f.verifiedBy?'active':''}"><span>2</span><div><strong>Finance verification</strong><small>${f.verifiedAt?esc(fmtDate(f.verifiedAt,true)):f.verifiedBy?`Assigned to ${esc(f.verifiedBy)}`:'Not assigned'}</small></div></div><div class="approval-connector"></div><div class="approval-step ${f.approvedAt?'complete':f.verifiedAt&&f.approvedBy?'active':''}"><span>3</span><div><strong>Management approval</strong><small>${f.approvedAt?esc(fmtDate(f.approvedAt,true)):f.approvedBy?`Assigned to ${esc(f.approvedBy)}`:'Not assigned'}</small></div></div></div>
    <div class="approval-created-card"><span class="person-icon" aria-hidden="true">♙</span><div><div class="approval-person-label"><strong>Created By</strong><em>Auto-captured</em></div><span>${esc(f.createdBy||state.currentUser.name)}</span><small>${esc(createdAt)}</small></div></div>
    <div class="approval-assignment-grid">
      <label class="field ${ui.errors.verifiedBy?'has-field-error':''}"><span>✓ Verified By (Finance Team) <b aria-hidden="true">*</b></span><select name="verifiedBy" id="esiVerifiedBy" aria-describedby="esiVerifiedHelp" ${ui.errors.verifiedBy?'aria-invalid="true"':''} class="${ui.errors.verifiedBy?'invalid':''}"><option value="">Select finance team member...</option>${ESI_FINANCE_TEAM.map(v=>`<option value="${esc(v)}" ${f.verifiedBy===v?'selected':''}>${esc(v)}</option>`).join('')}${f.verifiedBy&&!verifierValid?`<option value="${esc(f.verifiedBy)}" selected>${esc(f.verifiedBy)} (legacy assignment)</option>`:''}</select><small id="esiVerifiedHelp" class="field-help">Finance verifies invoice details before management approval.${f.verifiedAt?` Verified ${esc(fmtDate(f.verifiedAt,true))}.`:''}</small>${f.verifiedBy?`<button type="button" class="button small workflow-capture" data-capture-approval-step="verifiedAt" ${canVerify?'':`disabled title="Only ${esc(f.verifiedBy)} can record verification"`}>${f.verifiedAt?'Update verification time':'Mark verified now'}</button>`:''}${ui.errors.verifiedBy?`<small class="field-error">${esc(ui.errors.verifiedBy)}</small>`:''}</label>
      <label class="field ${ui.errors.approvedBy?'has-field-error':''}"><span>✓ Approved By (Management) <b aria-hidden="true">*</b></span><select name="approvedBy" id="esiApprovedBy" aria-describedby="esiApprovedHelp" ${ui.errors.approvedBy?'aria-invalid="true"':''} class="${ui.errors.approvedBy?'invalid':''}"><option value="">Select management member...</option>${ESI_MANAGEMENT_TEAM.map(v=>`<option value="${esc(v)}" ${f.approvedBy===v?'selected':''}>${esc(v)}${samePerson(v,GENERAL_MANAGER.name)?' · General Manager':''}</option>`).join('')}${f.approvedBy&&!approverValid?`<option value="${esc(f.approvedBy)}" selected>${esc(f.approvedBy)} (legacy assignment)</option>`:''}</select><small id="esiApprovedHelp" class="field-help">Management provides final approval only after Finance verification.${samePerson(f.approvedBy,GENERAL_MANAGER.name)?` ${esc(GENERAL_MANAGER.name)} is the General Manager / established final approver.`:''}${f.approvedAt?` Approved ${esc(fmtDate(f.approvedAt,true))}.`:''}</small>${f.approvedBy?`<button type="button" class="button small workflow-capture" data-capture-approval-step="approvedAt" ${canApprove?'':`disabled title="${!f.verifiedAt?'Complete Finance verification first':`Only ${esc(f.approvedBy)} can record final approval`}"`}>${f.approvedAt?'Update approval time':'Approve now'}</button>`:''}${ui.errors.approvedBy?`<small class="field-error">${esc(ui.errors.approvedBy)}</small>`:''}</label>
    </div>
    <div class="approval-readiness ${flow.key}"><div><strong>${esc(flow.label)}</strong><span>${esc(flow.detail)}</span></div><div class="approval-tools">${f.verifiedBy||f.approvedBy?'<button type="button" class="button small" data-clear-approval-assignments>Clear assignments</button>':''}</div></div>
    <p class="approval-policy-note">Drafts may be saved without assignments. <strong>Save & Submit requires both roles.</strong> Finance must verify first; only the assigned Management approver can complete the final approval stage.</p>
  </div>`;
}
function calc(form){
  const subtotal=(form.items||[]).reduce((s,i)=>s+itemAmount(i),0);
  const discountValue=Math.max(0,Number(form.discountValue)||0);
  const discount=form.discountType==='fixed' ? Math.min(subtotal,discountValue) : subtotal*(clamp(discountValue,0,100)/100);
  const after=Math.max(0,subtotal-discount);
  if(form.vatType==='vat-inclusive'){const vat=after-(after/1.12);return {subtotal,discount,vat,total:after};}
  if(form.vatType==='vat-exclusive'){const vat=after*.12;return {subtotal,discount,vat,total:after+vat};}
  const vat=after*vatRate(form.vatType);
  return {subtotal,discount,vat,total:after+vat};
}
function validate(form){
  const e={};
  if(!form.customerName?.trim()) e.customerName=form.documentType==='po'?'Supplier name is required':'Client name is required';
  if(!form.date) e.date='Document date is required';
  if(['esi','packing','delivery','payment','quotation','po'].includes(form.documentType)){
    if(form.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail.trim())) e.customerEmail='Enter a valid email address';
    if(form.customerPhone && !/^[+0-9()\-\s]{7,24}$/.test(form.customerPhone.trim())) e.customerPhone='Enter a valid phone number';
    if(form.customerTin && !/^[0-9\-\s]{9,20}$/.test(form.customerTin.trim())) e.customerTin='Use numbers and hyphens only';
    if(form.dueDate && form.date && new Date(form.dueDate) < new Date(form.date)) e.dueDate='Due date cannot be earlier than the document date';
    if(form.paymentTerms==='Custom'){
      const custom=String(form.paymentTermsCustom||'').trim();
      if(!custom)e.paymentTermsCustom='Enter the custom payment terms.';
      else if(custom.length>160)e.paymentTermsCustom='Custom payment terms must be 160 characters or fewer.';
    }
  }
  if(['esi','quotation','po'].includes(form.documentType)){
    if(!VAT_ALIASES[String(form.vatType||'')]) e.vatType='Select a valid VAT classification';
    if(form.documentType==='esi' && form.currency!=='PHP' && (!(Number(form.exchangeRate)>0))) e.exchangeRate='Enter a PHP exchange rate greater than zero';
  }
  if(['esi','quotation','po','delivery','packing'].includes(form.documentType)){
    const real=(form.items||[]).filter(isRealItem); const itemRows={};
    if(!real.length) e.items=form.documentType==='delivery'?'Add at least one delivered item before saving.':form.documentType==='packing'?'Add at least one packed item before saving.':'Add at least one billable item before saving.';
    (form.items||[]).forEach((i,idx)=>{
      if(!isRealItem(i)) { if(!i.description?.trim()) itemRows[idx]={description:'Enter note text or remove this note.'}; return; }
      const row={};
      if(!i.description?.trim()) row.description='Description is required.';
      if(!(Number(i.quantity)>0)) row.quantity='Quantity must be greater than zero.';
      if(Number(i.quantity)>1000000) row.quantity='Quantity is unusually large; enter 1,000,000 or less.';
      if(form.documentType==='delivery'&&String(i.serialNumber||'').length>120) row.serialNumber='Serial number must be 120 characters or fewer.';
      if(['esi','quotation','po'].includes(form.documentType) || (form.documentType==='delivery'&&form.drIncludePricing)){
        if(!(Number(i.unitPrice)>=0)) row.unitPrice='Unit price cannot be negative.';
        if(Number(i.unitPrice)>1000000000) row.unitPrice='Unit price is unusually large.';
      }
      if(Object.keys(row).length)itemRows[idx]=row;
    });
    if(Object.keys(itemRows).length){ e.itemRows=itemRows; e.items=e.items||'Review the highlighted item fields before saving.'; }
    const subtotal=(form.items||[]).reduce((sum,i)=>sum+itemAmount(i),0);
    const discount=Number(form.discountValue)||0;
    if(discount<0)e.discountValue='Discount cannot be negative.';
    if(form.discountType==='percentage'&&discount>100)e.discountValue='Percentage discount cannot exceed 100%.';
    if(form.discountType==='fixed'&&discount>subtotal)e.discountValue='Fixed discount cannot exceed the subtotal.';
  }
  if(['esi','packing','delivery','payment','quotation','po'].includes(form.documentType) && String(form.terms||'').length>10000) e.terms='Terms & Conditions must be 10,000 characters or fewer.';
  if(['quotation','po'].includes(form.documentType)){ if(String(form.remarks||'').length>5000)e.remarks='Additional Notes must be 5,000 characters or fewer.'; }
  if(['quotation','po'].includes(form.documentType)){
    if(String(form.validity||'').startsWith('Others')){
      if(!form.validityCustom)e.validityCustom='Choose the custom validity date.';
      else if(form.date && new Date(form.validityCustom) < new Date(form.date))e.validityCustom='Custom validity date cannot be earlier than the document date.';
    }
    if(String(form.deliveryCommitment||'').startsWith('Others')){
      const custom=String(form.deliveryCommitmentCustom||'').trim();
      if(!custom)e.deliveryCommitmentCustom='Enter the custom delivery commitment.';
      else if(custom.length>160)e.deliveryCommitmentCustom='Custom delivery commitment must be 160 characters or fewer.';
    }
  }
  if(form.documentType==='po'){ if(!String(form.validity||'').trim())e.validity='Select a PO validity period.'; if(!String(form.deliveryCommitment||'').trim())e.deliveryCommitment='Select a delivery commitment.'; }
  if(form.documentType==='payment'){
    if(!['cash','cheque'].includes(form.paymentForm))e.paymentForm='Choose a supported payment method.';
    if(form.paymentForm==='cash'&&(Number(form.cashAmount)||0)<=0) e.cashAmount='Cash amount must be greater than zero.';
    if(form.paymentForm==='cheque'){
      if((Number(form.chequeAmount)||0)<=0)e.chequeAmount='Cheque amount must be greater than zero.';
      if(!form.chequeNumber?.trim())e.chequeNumber='Cheque number is required.';
      if(String(form.chequeNumber||'').length>80)e.chequeNumber='Cheque number must be 80 characters or fewer.';
      if(String(form.bankName||'').length>120)e.bankName='Bank name must be 120 characters or fewer.';
    }
    if(String(form.paymentParticulars||'').length>2000)e.paymentParticulars='Payment particulars must be 2,000 characters or fewer.';
  }
  return e;
}
function duplicateFor(form){ if(!state.settings.duplicateDetection||!form.customerName?.trim()) return null; const n=form.customerName.trim().toLowerCase(); return state.documents.find(d=>d.id!==form.id&&d.documentType===form.documentType&&d.customerName?.trim().toLowerCase()===n&&Math.abs(new Date(d.date)-new Date(form.date))<7*86400000); }
function saveForm(intent='draft'){
  const form=deepCopy(ui.form);
  if(samePerson(form.createdBy,state.currentUser.name)){form.createdByEmail=form.createdByEmail||state.currentUser.email||'';form.createdByRole=form.createdByRole||state.currentUser.role||'';}
  if(['quotation','po'].includes(form.documentType)&&!form.id){const route=sourceQuotationApprovers({name:form.createdBy,email:form.createdByEmail,role:form.createdByRole});if(!form.verifiedBy&&route.reviewer)form.verifiedBy=route.reviewer;if(!form.approvedBy&&route.approver)form.approvedBy=route.approver;}
  if(form.documentType==='quotation'){
    form.verifiedByEmail=workflowEmail(form.verifiedBy)||form.verifiedByEmail||'';
    form.approvedByEmail=workflowEmail(form.approvedBy)||form.approvedByEmail||'';
  }
  if(form.documentType==='esi') delete form.remarks;
  ui.errors=validate(form);
  if(form.documentType==='esi'&&intent==='submit'){
    if(!String(form.verifiedBy||'').trim())ui.errors.verifiedBy='Select a Finance Team verifier before submitting.';
    if(!String(form.approvedBy||'').trim())ui.errors.approvedBy='Select a Management approver before submitting.';
    if(form.verifiedBy&&!ESI_FINANCE_TEAM.includes(form.verifiedBy))ui.errors.verifiedBy='Replace the legacy verifier with a current Finance Team member before submitting.';
    if(form.approvedBy&&!ESI_MANAGEMENT_TEAM.includes(form.approvedBy))ui.errors.approvedBy='Replace the legacy approver with a current Management member before submitting.';
  }
  if(form.documentType==='delivery'&&intent==='submit'){
    if(!String(form.checkedBy||'').trim())ui.errors.checkedBy='Select Quality Control personnel before submitting.';
    if(!String(form.deliveredBy||'').trim())ui.errors.deliveredBy='Select Logistics personnel before submitting.';
    if(form.checkedBy&&!DR_QC_PERSONNEL.includes(form.checkedBy))ui.errors.checkedBy='Replace the legacy QC assignment with a current personnel selection.';
    if(form.deliveredBy&&!DR_LOGISTICS_PERSONNEL.includes(form.deliveredBy))ui.errors.deliveredBy='Replace the legacy Logistics assignment with a current personnel selection.';
  }
  if(['quotation','po'].includes(form.documentType)&&intent==='submit'){
    if(!String(form.validity||'').trim())ui.errors.validity=form.documentType==='po'?'Select a PO validity period.':'Select a quotation validity period.';
    if(!String(form.deliveryCommitment||'').trim())ui.errors.deliveryCommitment='Select a delivery commitment.';
  }
  if(form.documentType==='quotation'&&intent==='submit'){
    const route=sourceQuotationApprovers({name:form.createdBy,email:form.createdByEmail,role:form.createdByRole});
    if(!quotationHasCreatorAuthority(form)){
      if(route.reviewer&&!String(form.verifiedBy||'').trim())ui.errors.verifiedBy=`${route.reviewer} is required as the Sales Supervisor reviewer for this creator.`;
      if(route.reviewer&&form.verifiedBy&&!samePerson(form.verifiedBy,route.reviewer))ui.errors.verifiedBy=`Quotation review must be assigned to ${route.reviewer}.`;
      if(route.reviewer&&workflowEmail(form.verifiedBy)!==SALES_SUPERVISOR.email)ui.errors.verifiedBy=`Quotation reviewer identity must resolve to ${SALES_SUPERVISOR.name} (${SALES_SUPERVISOR.email}).`;
      if(!String(form.approvedBy||'').trim())ui.errors.approvedBy=`${GENERAL_MANAGER.name} is required as the final approver.`;
      if(form.approvedBy&&!samePerson(form.approvedBy,GENERAL_MANAGER.name))ui.errors.approvedBy=`Final approval must remain assigned to ${GENERAL_MANAGER.name}, General Manager.`;
      if(form.approvedBy&&workflowEmail(form.approvedBy)!==GENERAL_MANAGER.email)ui.errors.approvedBy=`Final approver identity must resolve to ${GENERAL_MANAGER.name} (${GENERAL_MANAGER.email}).`;
    }
  }
  if(form.documentType==='po'&&intent==='submit'){
    const route=sourceQuotationApprovers({name:form.createdBy,email:form.createdByEmail,role:form.createdByRole});
    if(form.verifiedBy&&!PO_ACCOUNT_MANAGERS.includes(form.verifiedBy))ui.errors.verifiedBy='Replace the legacy reviewer with a current Account Manager selection.';
    if(route.reviewer&&!quotationHasCreatorAuthority(form)&&!String(form.verifiedBy||'').trim())ui.errors.verifiedBy=`Select ${route.reviewer} or another valid Account Manager reviewer before submitting.`;
    if(!poHasCreatorAuthority(form)){
      if(!String(form.approvedBy||'').trim())ui.errors.approvedBy=`${GENERAL_MANAGER.name} is required as the final approver.`;
      if(form.approvedBy&&!samePerson(form.approvedBy,GENERAL_MANAGER.name))ui.errors.approvedBy=`Final approval must remain assigned to ${GENERAL_MANAGER.name}, General Manager.`;
    }
  }
  if(form.documentType==='payment'&&intent==='submit'){
    if(!String(form.receivedBy||'').trim())ui.errors.receivedBy='Select the Finance team member who received the payment.';
    if(!String(form.verifiedBy||'').trim())ui.errors.verifiedBy='Select the Admin responsible for receipt verification.';
    if(form.receivedBy&&!PAYMENT_RECEIVERS.includes(form.receivedBy))ui.errors.receivedBy='Replace the legacy Finance assignment with a current personnel selection.';
    if(form.verifiedBy&&!PAYMENT_ADMINS.includes(form.verifiedBy))ui.errors.verifiedBy='Replace the legacy Admin assignment with a current personnel selection.';
    if(!String(form.paymentParticulars||'').trim())ui.errors.paymentParticulars='Add payment particulars before submitting the acknowledgement.';
  }
  if(Object.keys(ui.errors).length){render();const target=document.querySelector('.invalid,[aria-invalid="true"]');target?.focus();toast(intent==='submit'?(form.documentType==='esi'?'Complete the required Electronic SI workflow fields':form.documentType==='delivery'?'Complete the required Delivery Receipt workflow fields':form.documentType==='payment'?'Complete the required Payment AR workflow fields':'Complete the required workflow fields'):'Correct the highlighted validation errors','error');return;}
  const dup=duplicateFor(form); if(dup&&!confirm(`A similar ${TYPES[form.documentType].label} exists (${dup.documentNumber}). Continue?`))return;
  const now=nowISO(); const existing=form.id ? state.documents.find(d=>d.id===form.id):null;
  const formVendor=ensureFormCompanyBinding(form,{existing});
  // Template association follows the document company. Existing documents retain their captured template snapshot.
  if(!existing || !form.template || typeof form.template!=='object'){ const tpl=companyTemplate(formVendor.id); form.templateId=tpl.id; form.template=deepCopy(tpl); }
  if(!existing){ form.id=uid('doc'); form.documentNumber=nextNumber(form.documentType); form.createdAt=now; }
  form.updatedAt=now;
  if(intent==='submit') form.status=['quotation','po','esi'].includes(form.documentType)?approvalStatusForDocument(form):(TYPES[form.documentType].approval?'For Approval':'Generated'); else if(intent==='complete') form.status='Completed'; else form.status=form.status||'Draft';
  if(form.documentType==='payment') form.total=form.paymentForm==='cheque'?Number(form.chequeAmount)||0:Number(form.cashAmount)||0; else form.total=calc(form).total;
  const idx=state.documents.findIndex(d=>d.id===form.id); if(idx>=0) state.documents[idx]=form; else state.documents.unshift(form);
  const collection=form.documentType==='po'?'suppliers':'clients';
  if(form.customerName){
    const existingParty=state[collection].find(x=>String(x.name||'').toLowerCase()===form.customerName.toLowerCase());
    const partyData={name:form.customerName,address:form.customerAddress,tin:form.customerTin,contact:form.customerContact,email:form.customerEmail||'',phone:form.customerPhone||'',paymentTerms:form.paymentTerms||'',paymentTermsCustom:form.paymentTermsCustom||'',currency:form.currency||'PHP'};
    if(existingParty) Object.assign(existingParty,partyData); else state[collection].push({id:uid(collection),...partyData});
  }
  if(['esi','quotation','po'].includes(form.documentType)){
    (form.items||[]).filter(i=>isRealItem(i)&&i.description?.trim()).forEach(i=>{
      const key=i.description.trim().toLowerCase(); const known=state.products.find(p=>String(p.description||'').trim().toLowerCase()===key);
      const productData={description:i.description.trim(),unitPrice:Number(i.unitPrice)||0,currency:form.currency||'PHP',lastUsedAt:now};
      if(known)Object.assign(known,productData); else state.products.push({id:uid('product'),...productData});
    });
    state.products=state.products.sort((a,b)=>String(b.lastUsedAt||'').localeCompare(String(a.lastUsedAt||''))).slice(0,250);
  }
  addAudit(existing?'update':'create',`${existing?'Updated':'Created'} ${form.documentNumber}`,`${TYPES[form.documentType].label} · ${form.status}`,form.id,false);
  if(state.settings.backups && ['submit','complete'].includes(intent)) snapshot(`${form.documentNumber} ${form.status}`); else persist('document save',false);
  globalThis.WMModuleStore.removeItem(AUTOSAVE_KEY); ui.editingId=null; ui.form=null; ui.tab='documents'; ui.page=1; syncRoute('documents'); render(); toast(`${form.documentNumber} saved`);
}
function captureApprovalStep(id,field){
  const d=state.documents.find(x=>x.id===id); if(!d)return false;
  if(!['verifiedAt','approvedAt'].includes(field))return false;
  const isReview=field==='verifiedAt';
  const assignee=isReview?d.verifiedBy:d.approvedBy;
  if(!assignee){toast(isReview?'No reviewer/verifier is assigned to this document.':'No final approver is assigned to this document.','error');return false;}
  if(!isReview&&d.verifiedBy&&!d.verifiedAt){toast('Complete the review / verification stage before final approval.','error');return false;}
  if(!canCurrentUserActAs(assignee)){
    const role=samePerson(assignee,GENERAL_MANAGER.name)?`${GENERAL_MANAGER.role} / final approver`:'assigned workflow owner';
    toast(`Only ${assignee} (${role}) can complete this step. Current user: ${state.currentUser.name}.`,'error');return false;
  }
  const capturedAt=nowISO();
  d[field]=capturedAt;
  if(d.documentType==='quotation'){
    if(isReview)d.verifiedByEmail=workflowEmail(assignee)||d.verifiedByEmail||'';
    else d.approvedByEmail=workflowEmail(assignee)||d.approvedByEmail||'';
  }
  d.status=approvalStatusForDocument(d);
  d.updatedAt=capturedAt;
  const verb=isReview?(d.documentType==='esi'?'verified':'reviewed'):'approved';
  const actor=workflowPerson(assignee);
  addAudit('workflow',`${d.documentNumber} ${verb}`,`${assignee}${actor?.email?` (${actor.email})`:''} completed the ${isReview?'review / verification':'final approval'} stage using Use Time Now at ${capturedAt}`,id,false);
  persist(`workflow ${field}`,false); render(); toast(`${d.documentNumber} ${verb} by ${assignee}`); return true;
}
function changeStatus(id,status,note=''){
  const d=state.documents.find(x=>x.id===id); if(!d)return;
  if(status==='Approved'){
    if(['quotation','po'].includes(d.documentType)&&((d.documentType==='quotation'&&quotationHasCreatorAuthority(d))||(d.documentType==='po'&&poHasCreatorAuthority(d)))&&!d.verifiedBy&&!d.approvedBy){
      d.status='Approved';d.updatedAt=nowISO();addAudit('workflow',`${d.documentNumber} → Approved`,'General Manager creator authority',id,false);persist('workflow',false);render();toast(`${d.documentNumber} marked Approved`);return;
    }
    captureApprovalStep(id,'approvedAt');return;
  }
  if(status==='Under Review'||status==='For Approval'){
    d.status='For Approval';d.updatedAt=nowISO();addAudit('workflow',`${d.documentNumber} → For Approval`,note||'Workflow awaiting assigned review / approval',id,false);persist('workflow',false);render();toast(`${d.documentNumber} is For Approval`);return;
  }
  if(status==='Rejected'){
    const actors=[d.verifiedBy,d.approvedBy].filter(Boolean);
    if(actors.length&&!actors.some(canCurrentUserActAs)&&!isGeneralManagerIdentity(state.currentUser)){toast('Only an assigned reviewer/approver or the General Manager can reject this document.','error');return;}
  }
  d.status=status; d.updatedAt=nowISO(); addAudit('workflow',`${d.documentNumber} → ${status}`,note||`Workflow status changed to ${status}`,id,false); persist('workflow',false); render(); toast(`${d.documentNumber} marked ${status}`);
}
function deleteDoc(id){
  const d=state.documents.find(x=>x.id===id); if(!d)return false;
  if(!confirm(`Delete ${d.documentNumber}? TradeLink will create a recovery snapshot before deletion.`))return false;
  snapshot(`Before delete · ${d.documentNumber}`);
  state.documents=state.documents.filter(x=>x.id!==id); delete state.comments[id];
  ui.selectedDocumentIds=(ui.selectedDocumentIds||[]).filter(x=>x!==id);
  addAudit('delete',`Deleted ${d.documentNumber}`,TYPES[d.documentType].label,id,false); persist('delete',false); render(); toast(`${d.documentNumber} deleted`); return true;
}
function addComment(id,text){ text=text.trim(); if(!text)return; state.comments[id]=state.comments[id]||[]; state.comments[id].push({id:uid('comment'),at:nowISO(),user:state.currentUser.name,text}); addAudit('comment','Comment added',text.slice(0,100),id,false); persist('comment',false); renderModal('preview',id); }

function toast(message,type='success'){
  let host=document.querySelector('.toast-host'); if(!host){host=document.createElement('div');host.className='toast-host';document.body.appendChild(host)}
  const node=document.createElement('div');node.className=`toast ${type}`;node.textContent=message;host.appendChild(node);setTimeout(()=>node.remove(),3200);
}
function setTab(tab){
  const resolved=LEGACY_TAB_REDIRECTS[tab]||tab, next=PRIMARY_TABS.includes(resolved)?resolved:'create';
  if(next===ui.tab)return;
  const commit=()=>{ui.tab=next;ui.modal=null;syncRoute(ui.tab);globalThis.WMModuleStore.setItem(UI_KEY,JSON.stringify({...ui,form:undefined,errors:{},modal:null,companyPanelOpen:false}));render();window.scrollTo({top:0,behavior:scrollBehavior()});};
  if(globalThis.WorkManagementMotion?.exitThen&&!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)globalThis.WorkManagementMotion.exitThen(commit,{selector:'#mainView > :first-child',kind:'route',duration:95});
  else commit();
}
function startCreate(type='quotation'){ ui.form=newForm(type); ui.editingId=null; ui.errors={}; ui.tab='create'; syncRoute('create'); render(); }
function editDoc(id){ const d=state.documents.find(x=>x.id===id); if(!d)return; ui.form=normalizeForm(d); ui.editingId=id; ui.errors={}; ui.tab='create'; syncRoute('create'); render(); }

function stableFocus(el){ if(!el)return; try{el.focus({preventScroll:true})}catch{try{el.focus()}catch{}} }
function renderAnchorSelector(el){
  if(!el||el===document.body||!el.closest?.('#app'))return '';
  if(el.id)return `#${CSS.escape(el.id)}`;
  if(el.name)return `[name="${CSS.escape(el.name)}"]`;
  for(const attr of ['data-create-type','data-scroll-section','data-tab','data-recovery-pane','data-add-item','data-add-blank','data-add-note','data-save-form','data-submit-form']){
    if(el.hasAttribute?.(attr)){const value=el.getAttribute(attr);return value?`[${attr}="${CSS.escape(value)}"]`:`[${attr}]`;}
  }
  return '';
}
function captureRenderViewport(){
  const active=document.activeElement,selector=renderAnchorSelector(active);
  return {x:window.scrollX,y:window.scrollY,selector,top:selector?active.getBoundingClientRect().top:null};
}
function restoreRenderViewport(snapshot){
  if(!snapshot)return;
  const root=document.documentElement,previous=root.style.scrollBehavior;root.style.scrollBehavior='auto';
  window.scrollTo(snapshot.x,snapshot.y);
  if(snapshot.selector){
    const replacement=document.querySelector(snapshot.selector);
    if(replacement){
      const now=replacement.getBoundingClientRect().top;
      if(Number.isFinite(snapshot.top)&&Number.isFinite(now)&&Math.abs(now-snapshot.top)>.5)window.scrollBy(0,now-snapshot.top);
      stableFocus(replacement);
    }
  }
  root.style.scrollBehavior=previous;
}
function enhanceTradeLinkPresentation(root=document){
  const main=root.querySelector?.('#mainView')||document.querySelector('#mainView');
  if(main){main.dataset.uiScreen=ui.tab;main.classList.add('wm-screen-host');}
  root.querySelectorAll?.('.view').forEach(node=>node.classList.add('wm-screen'));
  root.querySelectorAll?.('.intro-grid,.section-head,.documents-commandbar,.create-commandbar').forEach(node=>node.classList.add('wm-page-header'));
  root.querySelectorAll?.('.toolbar-group,.modal-actions,.template-card-actions,.company-asset-actions,.empty-state-actions,.actions').forEach(node=>node.classList.add('wm-action-row'));
  root.querySelectorAll?.('.card,.section-card,.manual-card,.company-asset-card,.activity-workspace,.documents-filter-panel').forEach(node=>node.classList.add('wm-panel'));
  root.querySelectorAll?.('label').forEach(label=>{if(label.querySelector('input,select,textarea'))label.classList.add('wm-field');});
  root.querySelectorAll?.('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]):not([type=color]),select,textarea').forEach(control=>control.classList.add('wm-field-control','wm-control--md'));
  root.querySelectorAll?.('input[type="checkbox"]').forEach(control=>control.classList.add('wm-checkbox'));
  root.querySelectorAll?.('table:not(.pdf-items)').forEach(table=>table.classList.add('wm-table'));
  root.querySelectorAll?.('.empty-state').forEach(node=>node.classList.add('wm-empty-state'));
  root.querySelectorAll?.('.notice,.company-warning,.inline-validation.error').forEach(node=>{node.classList.add('wm-alert');if(node.classList.contains('error'))node.dataset.tone='danger';});
  root.querySelectorAll?.('button.button').forEach(button=>{const primary=button.classList.contains('primary');const danger=button.classList.contains('danger');const ghost=button.classList.contains('ghost');button.classList.add('wm-button',`wm-button--${danger?'danger':primary?'primary':ghost?'ghost':'secondary'}`,button.classList.contains('small')?'wm-control--sm':'wm-control--md');});
  root.querySelectorAll?.('button.icon-button,button.modal-close,button.document-menu-trigger').forEach(button=>button.classList.add('wm-icon-button','wm-icon-button--ghost','wm-control--sm'));
  root.querySelectorAll?.('.nav-tabs,.create-type-tabs,.recovery-tabs').forEach(tabs=>tabs.classList.add('wm-tabs'));
  root.querySelectorAll?.('.nav-tabs [role="tab"],.create-type-tabs [role="tab"],.recovery-tabs [role="tab"]').forEach(tab=>{tab.classList.add('wm-tab');tab.classList.toggle('is-active',tab.getAttribute('aria-selected')==='true'||tab.classList.contains('active'));});
}

function render(){
  const viewport=document.querySelector('#app .app-shell')?captureRenderViewport():null;
  const app=document.getElementById('app');
  let shell=app.querySelector('.app-shell');
  if(!shell){
    app.innerHTML=`<div class="app-shell"><header class="topbar"></header><main id="mainView"></main><div id="companyPanelHost"></div><div id="modalHost"></div></div>`;
    shell=app.querySelector('.app-shell');
  }
  const topbar=shell.querySelector('.topbar');
  topbar.innerHTML=`<a class="brand-lockup" href="#/create-new" data-tab="create" aria-label="TradeLink home"><span class="brand-mark" aria-hidden="true"><i></i></span><span class="brand-copy"><strong>TradeLink</strong><small>PORTAL</small></span></a>
    <nav class="nav-tabs wm-tabs" aria-label="Primary navigation" role="tablist">${navButton('create','＋  Create New')}${navButton('documents','☷  All Documents')}${navButton('manual','▤  User Manual')}${navButton('recovery','◈  Recovery')}</nav>
    <button class="vendor-pill" id="vendorTrigger" type="button" aria-haspopup="dialog" aria-expanded="${ui.companyPanelOpen}"><span class="vendor-pill-icon" aria-hidden="true">▣</span><span class="vendor-pill-name">${esc(vendorShortName(selectedVendor()))}</span><span class="vendor-pill-chevron" aria-hidden="true">⌄</span></button>`;
  shell.querySelector('#mainView').innerHTML=renderView();
  shell.querySelector('#companyPanelHost').innerHTML=ui.companyPanelOpen?renderCompanyPanel():'';
  shell.querySelector('#modalHost').innerHTML='';
  bindGlobal(); if(ui.modal) renderModal(ui.modal.type,ui.modal.id);
  enhanceTradeLinkPresentation(shell);
  globalThis.WorkManagementMotion?.refreshIndicators?.(topbar);
  restoreRenderViewport(viewport);
}

function renderCompanyPanel(){
  const v=selectedVendor(), missing=vendorProfileMissing(v), customLogo=getVendorAsset(v.id,'logo'), logo=customLogo||defaultBundledVendorLogo(v), qr=v.qrCode||'';
  return `<div class="company-panel-backdrop" data-close-company-panel></div><aside class="company-panel" role="dialog" aria-modal="false" aria-labelledby="companyPanelTitle">
    <div class="company-panel-head"><div><span class="company-panel-icon" aria-hidden="true">▣</span><div><strong id="companyPanelTitle">Active Company</strong><small>Company branding and document identity</small></div></div><button class="icon-button" type="button" data-close-company-panel aria-label="Close company panel">×</button></div>
    <label class="company-selector-field"><span><b>Active Company</b><em>★ Selected</em></span><select id="vendorSelect" aria-label="Active company">${state.vendors.map(item=>`<option value="${esc(item.id)}" ${item.id===state.selectedVendorId?'selected':''}>${esc(item.name)}</option>`).join('')}</select><small>Company information is used for new documents and generated PDFs.</small></label>
    ${missing.length?`<div class="company-warning" role="status"><strong>Company profile incomplete</strong><span>Missing: ${esc(missing.join(', '))}. Generated documents may contain blank company fields.</span></div>`:''}
    <div class="company-profile-card"><div class="company-profile-name"><strong>${esc(v.name)}</strong><span>${esc(v.tin||'TIN not configured')}</span></div><p>${esc(v.address||'Address not configured').replace(/\n/g,'<br>')}</p><small>${esc(v.email||'Email not configured')} · ${esc(v.phone||'Phone not configured')}</small></div>
    <section class="company-asset-card"><div class="company-asset-title"><strong>Company Logo</strong>${customLogo?'<span>Active</span>':logo?'<span>Built-in</span>':'<span class="inactive">Not set</span>'}</div><div class="company-asset-body"><div class="company-asset-preview">${logo?`<img src="${esc(logo)}" alt="${esc(v.name)} logo">`:'<div class="asset-empty">No custom logo</div>'}</div><div class="company-asset-actions"><button type="button" class="icon-button upload" data-upload-vendor-asset="logo" aria-label="${logo?'Change':'Upload'} company logo">⇧</button>${getVendorAsset(v.id,'logo')?'<button type="button" class="icon-button danger" data-delete-vendor-asset="logo" aria-label="Delete custom company logo">⌫</button>':''}</div></div><small>PNG, JPG or WebP up to 1 MB. Recommended aspect ratio approximately 5:2.</small></section>
    <section class="company-asset-card"><div class="company-asset-title"><strong>Footer QR Code</strong>${qr?'<span>Active</span>':'<span class="inactive">Not set</span>'}</div><div class="company-asset-body"><div class="company-asset-preview qr">${qr?`<img src="${esc(qr)}" alt="Footer QR code for ${esc(v.name)}">`:'<div class="asset-empty">No QR code</div>'}</div><div class="company-asset-actions"><button type="button" class="icon-button upload" data-upload-vendor-asset="qr" aria-label="${qr?'Change':'Upload'} footer QR code">⇧</button>${qr?'<button type="button" class="icon-button danger" data-delete-vendor-asset="qr" aria-label="Delete footer QR code">⌫</button>':''}</div></div><small>Optional QR image shown in generated PDF footers for this company.</small></section>
    ${renderCompanyTemplateCard(v)}
    <div class="company-admin-tools"><span>ADMIN TOOLS</span><button type="button" class="button warning-outline" data-reset-counters="all">↶ Reset All Counters</button><button type="button" class="button ghost warning-text" data-reset-counters="packing">↶ Reset PL Counter Only</button></div>
  </aside>`;
}
function navButton(id,label){ const active=ui.tab===id; return `<button data-tab="${id}" role="tab" aria-controls="mainView" aria-selected="${active}" class="wm-tab ${active?'active is-active':''}">${label}</button>`; }
function renderCompanyTemplateCard(v){ const t=companyTemplate(v.id); return `<section class="company-asset-card company-template-card"><div class="company-asset-title"><strong>Document Template</strong><span>Active</span></div><div class="template-preview" style="--tpl-accent:${esc(t.accent)};--tpl-bg:${esc(t.tableBackground)}"><div class="template-preview-brand"><i></i><b>${esc(vendorShortName(v))}</b><strong>QUOTATION</strong></div><div class="template-preview-rule"></div><div class="template-preview-table"><span></span><span></span><span></span></div></div><label class="template-setting"><span>Template profile</span><input value="${esc(t.name)}" readonly></label><div class="template-setting-grid"><label class="template-setting"><span>Accent</span><input type="color" id="vendorTemplateAccent" value="${esc(t.accent)}" aria-label="Template accent color"></label><label class="template-setting"><span>Terms pagination</span><select id="vendorTemplateTerms" aria-label="Terms pagination"><option value="flow" ${t.termsMode==='flow'?'selected':''}>Flow naturally</option><option value="new-page" ${t.termsMode==='new-page'?'selected':''}>Start on new page</option></select></label></div><div class="template-card-actions"><button type="button" class="button ghost" data-open-template-reference>Open reference</button><button type="button" class="button ghost" data-reset-company-template>Restore default</button></div><small>Managed independently for ${esc(v.name)}. New documents snapshot this template so historical PDFs keep their original presentation.</small></section>`; }
function updateActiveCompanyTemplate(patch){ const id=state.selectedVendorId,current=companyTemplate(id),next={...current,...patch}; state.vendorTemplates={...state.vendorTemplates,[id]:normalizeVendorTemplates({[id]:next},[vendorById(id)])[id]}; persist('company template updated',false); addAudit('update','Company document template updated',vendorById(id)?.name||id,null,false); render(); toast('Company template updated'); }
function resetActiveCompanyTemplate(){ const id=state.selectedVendorId,base=DEFAULT_VENDOR_TEMPLATES[id]; if(!base)return; if(!confirm(`Restore the default document template for ${vendorById(id)?.name||id}? Existing saved documents keep their template snapshot.`))return; state.vendorTemplates={...state.vendorTemplates,[id]:deepCopy(base)}; persist('company template restored',false);render();toast('Default company template restored'); }
function openActiveTemplateReference(){ const t=companyTemplate(state.selectedVendorId); if(!t.referenceFile)return toast('No reference PDF is assigned to this company.','error'); window.open(new URL(t.referenceFile,location.href).href,'_blank','noopener'); }
function hero(kicker,title,accent,lede,side=''){ return `<div class="intro-grid wm-page-header"><div><p class="eyebrow">${kicker}</p><h1>${title} <em>${accent}</em></h1><p class="lede">${lede}</p></div><div class="date-stack"><span>${fmtDate(new Date())}</span><strong>${side||selectedVendor().name.split(' ').slice(0,2).join(' ')}</strong></div></div>`; }
function renderView(){ switch(ui.tab){case'documents':return renderDocuments();case'manual':return renderManual();case'recovery':return renderRecovery();case'create':default:return renderCreate();} }

function renderOverview(){
  const docs=state.documents; const approved=docs.filter(d=>['Approved','Generated','Completed'].includes(d.status)).length; const pending=docs.filter(d=>['Submitted','Under Review'].includes(d.status)).length; const total=docs.filter(d=>TYPES[d.documentType]?.financial).reduce((s,d)=>s+(Number(d.total)||0),0);
  const counts=Object.fromEntries(Object.keys(TYPES).map(k=>[k,docs.filter(d=>d.documentType===k).length])); const max=Math.max(1,...Object.values(counts));
  return `<section class="view">${hero('OPERATIONS OVERVIEW','Commercial documents,','under control.','Create, review, approve, track, and recover TradeLink records from one focused document-operations workspace. Business rules and authenticated cloud safeguards remain intact while the interface is purpose-built for TradeLink.',`${docs.length} documents`)}
  <div class="metric-grid"><article class="metric primary"><span>Document value</span><strong>${money(total,'PHP')}</strong><small>Financial documents in local storage</small></article><article class="metric"><span>Total documents</span><strong>${docs.length}</strong><small>${Object.values(counts).filter(Boolean).length} active document types</small></article><article class="metric"><span>Awaiting action</span><strong>${pending}</strong><small>Submitted or under review</small></article><article class="metric"><span>Approved / complete</span><strong>${approved}</strong><small>${docs.length?Math.round(approved/docs.length*100):0}% of all records</small></article></div>
  <div class="dashboard-grid"><section class="card section-card"><div class="section-head"><div><p class="eyebrow">DOCUMENT MIX</p><h3>Workflow distribution</h3></div><span>Current local dataset</span></div><div class="type-bars">${Object.entries(TYPES).map(([k,t])=>`<div><div class="bar-row-head"><strong>${t.label}</strong><span>${counts[k]}</span></div><div class="bar-track"><i style="width:${counts[k]/max*100}%"></i></div></div>`).join('')}</div></section>
  <section class="card section-card"><div class="section-head"><div><p class="eyebrow">RECENT ACTIVITY</p><h3>Latest changes</h3></div><button class="button small" data-tab="activity">View all</button></div>${renderActivityList(state.audit.slice(0,6))}</section></div>
  <div class="toolbar" style="margin-top:16px"><div class="toolbar-group"><button class="button primary" data-create="quotation">Create quotation</button><button class="button" data-create="delivery">New delivery receipt</button></div><div class="toolbar-group"><button class="button" data-tab="documents">Browse documents</button><button class="button" data-snapshot>Backup now</button></div></div></section>`;
}
function activityDocument(a){ return a?.documentId ? state.documents.find(d=>d.id===a.documentId) : null; }
function inferActivityType(a){
  const linked=activityDocument(a); if(linked?.documentType)return linked.documentType;
  const hay=`${a?.title||''} ${a?.detail||''}`.toUpperCase();
  return Object.entries(TYPES).find(([key,t])=>hay.includes(`${t.prefix}${''}`.toUpperCase())||hay.includes(t.label.toUpperCase()))?.[0]||'';
}
function activityActionLabel(action='system'){ return ({create:'Created',update:'Updated',workflow:'Workflow',comment:'Comment',backup:'Backup',restore:'Restore',import:'Import',export:'Export',delete:'Deleted',system:'System'})[action]||action; }
function activityIcon(action='system'){ return ({create:'＋',update:'✎',workflow:'↻',comment:'◌',backup:'▣',restore:'↶',import:'⇣',export:'⇡',delete:'×',system:'•'})[action]||'•'; }
function renderActivityList(items,{actions=false}={}){ if(!items.length)return`<div class="empty-state"><strong>No activity found</strong><span>TradeLink will record workflow and persistence events here. Adjust the filters if you are looking for an older event.</span></div>`; return `<div class="activity-list">${items.map(a=>{const d=activityDocument(a),type=inferActivityType(a);return `<article class="activity-item activity-${esc(a.action||'system')}" data-activity-id="${esc(a.id)}"><div class="activity-icon" aria-hidden="true">${activityIcon(a.action)}</div><div class="activity-copy"><div class="activity-heading"><strong>${esc(a.title)}</strong><span class="activity-kind">${esc(activityActionLabel(a.action))}</span>${type&&TYPES[type]?`<span class="activity-kind muted">${esc(createTypeLabel(type))}</span>`:''}</div><small>${esc(a.detail||a.action)} · ${esc(a.user)}${a.role?` · ${esc(a.role)}`:''}</small>${d?`<button class="activity-document" data-preview="${esc(d.id)}" title="Open ${esc(d.documentNumber)}">${esc(d.documentNumber)} ↗</button>`:''}</div><div class="activity-side"><time datetime="${esc(a.at)}">${fmtDate(a.at,true)}</time>${actions?`<button class="icon-button activity-copy-button" data-copy-activity="${esc(a.id)}" aria-label="Copy activity details" title="Copy activity details">⧉</button>`:''}</div></article>`}).join('')}</div>`; }
function filteredActivity(){
  const q=ui.activitySearch.trim().toLowerCase(); const now=Date.now();
  const cutoff=ui.activityRange==='today'?new Date(new Date().setHours(0,0,0,0)).getTime():ui.activityRange==='7d'?now-7*86400000:ui.activityRange==='30d'?now-30*86400000:0;
  const rows=state.audit.filter(a=>{
    const d=activityDocument(a), type=inferActivityType(a);
    const searchable=[a.title,a.detail,a.action,a.user,a.role,d?.documentNumber,d?.customerName,type&&TYPES[type]?.label].filter(Boolean).join(' ').toLowerCase();
    return (!q||searchable.includes(q)) && (ui.activityAction==='all'||a.action===ui.activityAction) && (ui.activityType==='all'||type===ui.activityType) && (!cutoff||new Date(a.at).getTime()>=cutoff);
  });
  rows.sort((a,b)=>ui.activitySort==='oldest'?new Date(a.at)-new Date(b.at):new Date(b.at)-new Date(a.at)); return rows;
}
function renderActivityWorkspace(){
  const rows=filteredActivity(),pageSize=50,pages=Math.max(1,Math.ceil(rows.length/pageSize)); ui.activityPage=clamp(ui.activityPage,1,pages); const shown=rows.slice(0,ui.activityPage*pageSize);
  const actions=[...new Set(state.audit.map(a=>a.action||'system'))].sort();
  return `<section class="card section-card activity-workspace"><div class="section-head activity-head"><div><p class="eyebrow">ACTIVITY</p><h3>Audit & workflow history</h3><p class="section-description">Search and inspect document mutations, workflow changes, comments, recovery operations, imports, exports, and persistence events.</p></div><div class="toolbar-group"><button class="button" data-export-activity ${rows.length?'':'disabled'}>Export filtered CSV</button><button class="button" data-clear-activity-filters>Clear filters</button></div></div>
  <div class="activity-filter-grid"><label class="field activity-search"><span>Search activity</span><input id="activitySearch" type="search" value="${esc(ui.activitySearch)}" placeholder="Document number, party, action, user…" autocomplete="off"></label>${fieldSelect('activityAction','Event type',[['all','All event types'],...actions.map(v=>[v,activityActionLabel(v)])],ui.activityAction)}${fieldSelect('activityType','Document type',[['all','All document types'],...Object.entries(TYPES).map(([v,t])=>[v,createTypeLabel(v)])],ui.activityType)}${fieldSelect('activityRange','Date range',[['all','All time'],['today','Today'],['7d','Last 7 days'],['30d','Last 30 days']],ui.activityRange)}${fieldSelect('activitySort','Order',[['newest','Newest first'],['oldest','Oldest first']],ui.activitySort)}</div>
  <div class="activity-results-bar" role="status" aria-live="polite"><span>Showing <strong>${shown.length}</strong> of <strong>${rows.length}</strong> matching event${rows.length===1?'':'s'}</span>${(ui.activitySearch||ui.activityAction!=='all'||ui.activityType!=='all'||ui.activityRange!=='all')?'<span>Filters active</span>':'<span>Complete local audit history</span>'}</div>
  ${rows.length?renderActivityList(shown,{actions:true}):`<div class="empty-state empty-state-workspace activity-empty-state"><div class="empty-state-content"><strong>${state.audit.length?'No matching activity':'No activity recorded yet'}</strong><span>${state.audit.length?'No recorded events match the current Activity filters. Clear the filters to return to the full audit history.':'TradeLink records document changes, workflow decisions, backup operations, and other actions here as you work.'}</span></div><div class="empty-state-actions">${state.audit.length?'<button type="button" class="button primary" data-clear-activity-filters>Clear filters</button>':'<button type="button" class="button primary" data-tab="create">Create document</button>'}${state.audit.length?'':'<button type="button" class="button" data-recovery-pane="tools">Recovery tools</button>'}</div></div>`}
  ${shown.length<rows.length?`<div class="activity-load"><button class="button" data-load-more-activity>Load 50 more</button><span>${rows.length-shown.length} remaining</span></div>`:''}</section>`;
}
function copyActivity(id){ const a=state.audit.find(x=>x.id===id); if(!a)return; const d=activityDocument(a); const text=[a.title,a.detail,`Action: ${activityActionLabel(a.action)}`,`When: ${fmtDate(a.at,true)}`,`User: ${a.user}${a.role?` (${a.role})`:''}`,d?`Document: ${d.documentNumber}`:''].filter(Boolean).join('\n'); if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>toast('Activity details copied')).catch(()=>fallbackCopy(text)); else fallbackCopy(text); }
function fallbackCopy(text){ const area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();try{document.execCommand('copy');toast('Activity details copied')}catch{toast('Unable to copy activity details','error')}area.remove(); }
function exportActivity(){ const rows=filteredActivity(); if(!rows.length){toast('No matching activity to export','error');return;} const headers=['Timestamp','Action','Title','Detail','User','Role','Document Number','Document Type']; const csv=[headers,...rows.map(a=>{const d=activityDocument(a),t=inferActivityType(a);return[a.at,activityActionLabel(a.action),a.title||'',a.detail||'',a.user||'',a.role||'',d?.documentNumber||'',t&&TYPES[t]?createTypeLabel(t):'']})].map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n'); const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`TradeLink-activity-${todayISO()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);addAudit('export','Activity exported',`${rows.length} filtered events`,null,false);persist('activity export',false);toast('Activity CSV exported'); }
function clearActivityFilters(){ Object.assign(ui,{activitySearch:'',activityAction:'all',activityType:'all',activityRange:'all',activitySort:'newest',activityPage:1}); render(); }

function createTypeLabel(type){ return ({esi:'Electronic SI',packing:'Packing List',delivery:'Delivery Receipt',payment:'Payment AR',quotation:'Quotations',po:'PO to Suppliers'})[type]||TYPES[type]?.label||type; }
function renderCreateTypeTabs(active){ const order=['esi','packing','delivery','payment','quotation','po']; return `<div class="create-type-tabs wm-tabs" role="tablist" aria-label="Create document type">${order.map(type=>`<button type="button" role="tab" aria-selected="${active===type}" class="wm-tab ${active===type?'active is-active':''}" data-create-type="${type}"><span>${esc(TYPES[type].short)}</span>${esc(createTypeLabel(type))}</button>`).join('')}</div>`; }
function renderEsiSectionNav(){ const sections=[['esiDocumentInfo','Document'],['esiClientInfo','Client'],['esiItems','Items'],['esiFinancial','Adjustments'],['esiTerms','Terms'],['esiApprovalWorkflow','Approval']]; return `<nav class="esi-section-nav" aria-label="Electronic SI sections">${sections.map(([id,label],idx)=>`<button type="button" class="${idx===0?'active':''}" data-scroll-section="${id}">${idx+1}<span>${label}</span></button>`).join('')}</nav>`; }

function switchCreateType(type){ if(!TYPES[type]||ui.form?.documentType===type)return; const hasDraft=ui.form && (ui.form.customerName?.trim() || ui.form.referenceNumber?.trim() || ui.form.remarks?.trim() || (ui.form.items||[]).some(i=>i.description?.trim())); if(hasDraft&&!confirm(`Switch to ${createTypeLabel(type)}? The current uncommitted form will be replaced.`))return; ui.form=newForm(type); ui.editingId=null; ui.errors={}; globalThis.WMModuleStore.removeItem(AUTOSAVE_KEY); render(); }

function renderEsiTerms(f){
  const terms=String(f.terms||'');
  const standard=DEFAULT_TERMS.esi;
  const status=!terms.trim()?'Empty':terms===standard?'Standard':'Customized';
  const count=terms.length;
  return `<div class="form-section esi-terms-section ${ui.termsExpanded?'is-expanded':''}" id="esiTerms" tabindex="-1" data-esi-terms-section><div class="form-section-title esi-terms-title"><div><strong>Terms & Conditions</strong><small>Persisted with the generated document and included in document preview/PDF output.</small></div><span class="terms-status ${status.toLowerCase()}" data-terms-status>${status}</span></div>
    <div class="terms-toolbar" aria-label="Terms and Conditions tools"><div class="terms-toolbar-copy"><strong>Document Terms & Conditions</strong><small>Review contractual text before submission. Changes autosave with this draft.</small></div><div class="terms-actions"><button class="button small" type="button" data-copy-terms>Copy</button><button class="button small" type="button" data-reset-terms ${terms===standard?'disabled':''}>Restore standard</button><button class="button small" type="button" data-toggle-terms aria-expanded="${ui.termsExpanded}">${ui.termsExpanded?'Collapse':'Expand'}</button></div></div>
    <label class="field terms-editor-field"><span class="sr-only">Document Terms & Conditions</span><textarea name="terms" maxlength="10000" aria-describedby="esiTermsHelp esiTermsCount" class="${ui.errors.terms?'invalid':''}">${esc(terms)}</textarea><div class="terms-meta"><small id="esiTermsHelp">Up to 10,000 characters. Standard terms can be restored at any time before saving.</small><small id="esiTermsCount" data-terms-count aria-live="polite">${count.toLocaleString()} / 10,000</small></div>${ui.errors.terms?`<small class="field-error">${esc(ui.errors.terms)}</small>`:''}</label>
  </div>`;
}


function quotationHasCreatorAuthority(subject=ui.form||{}){ return isGeneralManagerIdentity({name:subject?.createdBy||'',email:subject?.createdByEmail||''}); }
function quotationValidityEnd(date, validity, customDate=''){
  if(!date||!validity)return '';
  if(validity.startsWith('Others'))return customDate||'';
  const d=new Date(`${date}T12:00:00`); if(Number.isNaN(d.getTime()))return '';
  const days=String(validity).match(/^(15|30|60|120) Days$/); if(days)d.setDate(d.getDate()+Number(days[1]));
  else if(validity==='6 Months')d.setMonth(d.getMonth()+6); else if(validity==='1 Year')d.setFullYear(d.getFullYear()+1); else return '';
  return d.toISOString().slice(0,10);
}
function renderQuotationClientInformation(f){
  const saved=state.clients.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  const end=quotationValidityEnd(f.date,f.validity,f.validityCustom);
  return `<div class="form-section quotation-client-section" id="quotationClient" tabindex="-1"><div class="form-section-title"><div><strong>Client & Commercial Information</strong><small>Reuse saved client details, then define the commercial validity and delivery commitment.</small></div>${f.customerName?'<button type="button" class="button small ghost" data-clear-quotation-client>Clear client</button>':''}</div>
    <div class="client-lookup-row"><label class="field quotation-client-lookup"><span>Saved Client</span><input id="quotationClientLookup" list="quotationClientOptions" value="${esc(f.customerName||'')}" placeholder="Search saved clients by name…" autocomplete="off"><datalist id="quotationClientOptions">${saved.map(c=>`<option value="${esc(c.name)}"></option>`).join('')}</datalist><small class="field-help">Select an exact saved-client name to auto-fill known contact and commercial defaults.</small></label><span class="client-count">${saved.length} saved</span></div>
    <div class="form-grid client-grid quotation-client-grid">
      ${fieldInput('customerName','Client Name','text',f.customerName,ui.errors.customerName,'Enter client name')}
      ${fieldArea('customerAddress','Plant / Billing Address',f.customerAddress)}
      ${fieldInput('customerContact','Contact Person','text',f.customerContact,null,'Enter contact person')}
      ${fieldInput('customerEmail','Email','email',f.customerEmail,ui.errors.customerEmail,'client@example.com')}
      ${fieldInput('customerPhone','Phone Number','tel',f.customerPhone,ui.errors.customerPhone,'+63 xxx xxx xxxx')}
      ${fieldInput('customerTin','Customer TIN','text',f.customerTin,ui.errors.customerTin,'000-000-000-000')}
      ${fieldInput('poNumber','Reference Information','text',f.poNumber,null,'RFQ / project / opportunity reference')}
      ${paymentTermsField(f,'Payment Terms')}
      ${fieldSelect('currency','Currency',CURRENCIES.map(([v,l])=>[v,l]),f.currency)}
      ${validityField(f,'Validity of Quotation',QUOTATION_VALIDITY)}
      ${deliveryCommitmentField(f,'Delivery Commitment',QUOTATION_DELIVERY)}
      ${fieldInput('dueDate','Client Response / Target Date','date',f.dueDate,ui.errors.dueDate)}
    </div>
    <div class="quotation-commercial-status" aria-live="polite"><span>Validity</span><strong>${esc(resolvedValidity(f)||'Not selected')}</strong>${end?`<small>Estimated expiry: ${esc(fmtDate(end))}</small>`:'<small>Choose a standard validity period to show an estimated expiry date.</small>'}<span>Delivery</span><strong>${esc(resolvedDeliveryCommitment(f)||'Not selected')}</strong></div>
  </div>`;
}
function renderQuotationItemRow(f,i,idx){
  const rowErrors=ui.errors.itemRows?.[idx]||{}, note=!isRealItem(i); const amount=itemAmount(i);
  if(note)return `<div class="quotation-item-row quotation-note-row ${Object.keys(rowErrors).length?'has-error':''}" data-item-row="${i.id}" role="listitem"><span class="drag" aria-hidden="true">⠿</span><span class="item-index">N</span><label class="line-field quotation-description"><span>Quotation note</span><textarea data-item="description" data-index="${idx}" maxlength="5000" class="${rowErrors.description?'invalid':''}" ${rowErrors.description?'aria-invalid="true"':''} placeholder="Add a note or scope clarification…">${esc(i.description)}</textarea><small class="quotation-char-count">${String(i.description||'').length}/5000</small>${rowErrors.description?`<small class="line-error">${esc(rowErrors.description)}</small>`:''}</label><div class="quotation-row-actions"><button type="button" class="icon-action" data-move-quote-item="${idx}" data-direction="up" ${idx===0?'disabled':''} aria-label="Move note up">↑</button><button type="button" class="icon-action" data-move-quote-item="${idx}" data-direction="down" ${idx===f.items.length-1?'disabled':''} aria-label="Move note down">↓</button><button type="button" class="icon-action danger" data-remove-quote-item="${idx}" aria-label="Remove note">⌫</button></div></div>`;
  return `<div class="quotation-item-row ${Object.keys(rowErrors).length?'has-error':''}" data-item-row="${i.id}" role="listitem"><span class="drag" aria-hidden="true">⠿</span><span class="item-index">${idx+1}</span><label class="line-field quotation-description"><span>Description</span><textarea data-item="description" data-index="${idx}" maxlength="5000" list="quotationProductOptions" class="${rowErrors.description?'invalid':''}" ${rowErrors.description?'aria-invalid="true"':''} placeholder="Enter material, service, scope, or specification…">${esc(i.description)}</textarea><small class="quotation-char-count">${String(i.description||'').length}/5000</small>${rowErrors.description?`<small class="line-error">${esc(rowErrors.description)}</small>`:''}</label><label class="line-field"><span>Qty</span><input data-item="quantity" data-index="${idx}" type="number" min="0.0001" step="any" value="${esc(i.quantity)}" class="${rowErrors.quantity?'invalid':''}" ${rowErrors.quantity?'aria-invalid="true"':''}>${rowErrors.quantity?`<small class="line-error">${esc(rowErrors.quantity)}</small>`:''}</label><label class="line-field"><span>Unit Price</span><input data-item="unitPrice" data-index="${idx}" type="number" min="0" step="0.01" value="${esc(i.unitPrice)}" class="${rowErrors.unitPrice?'invalid':''}" ${rowErrors.unitPrice?'aria-invalid="true"':''}>${rowErrors.unitPrice?`<small class="line-error">${esc(rowErrors.unitPrice)}</small>`:''}</label><div class="quotation-line-total"><span>Amount</span><strong data-quote-line-amount="${idx}">${money(amount,f.currency)}</strong></div><div class="quotation-row-actions"><button type="button" class="icon-action" data-duplicate-quote-item="${idx}" aria-label="Duplicate item">⧉</button><button type="button" class="icon-action" data-move-quote-item="${idx}" data-direction="up" ${idx===0?'disabled':''} aria-label="Move item up">↑</button><button type="button" class="icon-action" data-move-quote-item="${idx}" data-direction="down" ${idx===f.items.length-1?'disabled':''} aria-label="Move item down">↓</button><button type="button" class="icon-action danger" data-remove-quote-item="${idx}" aria-label="Remove item">⌫</button></div></div>`;
}
function renderQuotationItems(f){
  const products=state.products.slice(0,100); const real=f.items.filter(isRealItem).length;
  return `<div class="form-section quotation-items-section" id="quotationItems" tabindex="-1"><div class="form-section-title row-title"><div><strong>Quotation Items</strong><small>Add priced lines and scope notes. Reuse known items without depending on an external sourcing board.</small></div><div class="item-actions">${products.length?`<select data-quote-saved-product class="saved-item-select" aria-label="Saved quotation item"><option value="">Saved items…</option>${products.map(p=>`<option value="${esc(p.id)}">${esc(p.description)}${p.unitPrice?` · ${esc(money(p.unitPrice,p.currency||f.currency))}`:''}</option>`).join('')}</select><button type="button" class="button" data-add-quote-saved>＋ Add Saved</button>`:''}<button type="button" class="button dark" data-add-quote-item>＋ Add Item</button><button type="button" class="button" data-add-quote-note>▱ Add Note</button>${f.items.length>1?'<button type="button" class="button subtle danger-text" data-clear-quote-items>Clear</button>':''}</div></div>
  <div class="quotation-item-head" aria-hidden="true"><span></span><span>#</span><span>Description</span><span>Quantity</span><span>Unit price</span><span>Amount</span><span>Actions</span></div><div class="quotation-item-editor" role="list" aria-label="Quotation items">${f.items.map((i,idx)=>renderQuotationItemRow(f,i,idx)).join('')}</div>${ui.errors.items?`<div class="inline-validation error" role="alert">${esc(ui.errors.items)}</div>`:''}<div class="items-footer-note"><span>${real} priced line${real===1?'':'s'}</span><small>Ctrl/Cmd + Enter adds a new item from inside the item editor.</small></div></div>`;
}
function renderQuotationNotes(f){ const len=String(f.remarks||'').length; return `<div class="form-section quotation-notes-section"><div class="form-section-title"><div><strong>Additional Notes</strong><small>Special instructions and commercial clarifications are persisted with the quotation.</small></div><select data-quote-note-template class="compact-select" aria-label="Quick note template"><option value="">Quick templates…</option>${QUOTATION_NOTE_TEMPLATES.map(([k,v])=>`<option value="${esc(k)}">${esc(v.slice(0,48))}${v.length>48?'…':''}</option>`).join('')}</select></div><label class="field"><span>Notes <em class="optional-label">Optional</em></span><textarea name="remarks" maxlength="5000" class="${ui.errors.remarks?'invalid':''}" ${ui.errors.remarks?'aria-invalid="true"':''} placeholder="Add exclusions, assumptions, client instructions, or commercial clarifications…">${esc(f.remarks||'')}</textarea><small class="field-help"><span data-quote-notes-count>${len.toLocaleString()} / 5,000</span> · Included in document preview.</small>${ui.errors.remarks?`<small class="field-error">${esc(ui.errors.remarks)}</small>`:''}</label></div>`; }
function renderQuotationTerms(f){ const status=!String(f.terms||'').trim()?'Empty':f.terms===DEFAULT_TERMS.quotation?'Standard':'Customized';return `<div class="form-section quotation-terms-section" data-quotation-terms-section><div class="form-section-title"><div><strong>Terms & Conditions</strong><small>Commercial terms are stored with this quotation.</small></div><div class="terms-actions"><span class="terms-status ${status.toLowerCase()}" data-quotation-terms-status>${status}</span><button type="button" class="button small ghost" data-copy-quotation-terms>Copy</button><button type="button" class="button small ghost" data-reset-quotation-terms ${f.terms===DEFAULT_TERMS.quotation?'disabled':''}>Restore standard</button><button type="button" class="button small" data-toggle-quotation-terms aria-expanded="false">Expand</button></div></div><label class="field"><span>Document Terms & Conditions</span><textarea name="terms" maxlength="10000" class="terms-editor ${ui.errors.terms?'invalid':''}" ${ui.errors.terms?'aria-invalid="true"':''}>${esc(f.terms||'')}</textarea><small class="field-help"><span data-quotation-terms-count>${String(f.terms||'').length.toLocaleString()} / 10,000</span> · These terms appear on the generated quotation.</small>${ui.errors.terms?`<small class="field-error">${esc(ui.errors.terms)}</small>`:''}</label></div>`; }
function renderQuotationApproval(f){
  const authority=quotationHasCreatorAuthority(f);
  const route=sourceQuotationApprovers({name:f.createdBy,email:f.createdByEmail,role:f.createdByRole});
  const reviewer=f.verifiedBy||route.reviewer;
  const approver=f.approvedBy||route.approver;
  const reviewerActor=workflowPerson(reviewer)||SALES_SUPERVISOR;
  const approverActor=workflowPerson(approver)||GENERAL_MANAGER;
  const reviewerDone=!reviewer||!!f.verifiedAt;
  const canReview=!!reviewer&&canCurrentUserActAs(reviewer);
  const canApprove=!!approver&&canCurrentUserActAs(approver)&&reviewerDone;
  const reviewTime=f.verifiedAt?fmtDate(f.verifiedAt,true):'';
  const approvalTime=f.approvedAt?fmtDate(f.approvedAt,true):'';
  const loggedIn=`${state.currentUser.name}${state.currentUser.email?` · ${state.currentUser.email}`:''}`;
  const timeControl=(kind,actor,value,enabled,waiting='')=>`<label class="field quotation-time-field"><span>${kind==='verifiedAt'?'Review Date & Time':'Approval Date & Time'}</span><div class="workflow-time-row"><input type="text" value="${esc(value)}" readonly placeholder="Not yet recorded" aria-label="${kind==='verifiedAt'?'Review':'Approval'} timestamp"><button type="button" class="button small workflow-capture" data-capture-approval-step="${kind}" ${enabled?'':`disabled title="${esc(waiting||`Only ${actor.name} can record this timestamp`)}"`}>Use Time Now</button></div><small class="field-help">${kind==='verifiedAt'?`Only ${esc(actor.name)} (${esc(actor.email)}) can record the Sales Supervisor review timestamp.`:`Only ${esc(actor.name)} (${esc(actor.email)}) can record final approval${reviewer&&!reviewerDone?' after the Sales Supervisor review is completed':''}.`} Logged in as: ${esc(loggedIn)}.</small></label>`;
  return `<div class="form-section quotation-approval-section"><div class="form-section-title"><div><strong>Verification & Approval Workflow</strong><small>${authority?'Source approval hierarchy: the creator is Alex P. Señagan, General Manager and final approver.':'Source approval hierarchy is preserved: Sales Supervisor review where required, followed by General Manager final approval. Approval is completed only through Use Time Now.'}</small></div></div>
    <div class="approval-created-card"><span class="person-icon">♙</span><div><div class="approval-person-label"><strong>Created By</strong><em>Auto-captured</em></div><span>${esc(f.createdBy||state.currentUser.name)}</span><small>${f.createdAt?esc(fmtDate(f.createdAt,true)):'Timestamp assigned on first save'}${f.createdByEmail?` · ${esc(f.createdByEmail)}`:''}${f.createdByRole?` · ${esc(f.createdByRole)}`:''}</small></div></div>
    ${authority?`<div class="quotation-authority-notice" role="status"><strong>✓ General Manager creator authority</strong><span>${esc(GENERAL_MANAGER.name)} (${esc(GENERAL_MANAGER.email)}) is the established General Manager and final approver. No additional review or final approval is required when he creates the quotation.</span></div><div class="quotation-authority-grid"><div><span>Sales review</span><strong>Not Applicable</strong><small>Creator has approval authority.</small></div><div><span>Final approval</span><strong>Not Applicable</strong><small>Creator is the General Manager / final approver.</small></div></div>`:`<div class="quotation-authority-grid quotation-approval-actors"><div><span>Reviewed By (Sales Supervisor)</span><strong>${reviewer?esc(reviewerActor.name):'Not Applicable'}</strong><small>${reviewer?`${esc(reviewerActor.role)} · ${esc(reviewerActor.email)}`:'Creator has review authority.'}</small>${reviewer?timeControl('verifiedAt',reviewerActor,reviewTime,canReview):''}</div><div><span>Approved By (Management)</span><strong>${approver?esc(approverActor.name):'Not Applicable'}</strong><small>${approver?`${esc(approverActor.role)} · ${esc(approverActor.email)}`:'Creator has final approval authority.'}</small>${approver?timeControl('approvedAt',approverActor,approvalTime,canApprove,!reviewerDone?'Complete the Sales Supervisor review first':`Only ${approverActor.name} can record final approval`):''}</div></div>`}
    <p class="approval-policy-note">Sequence is enforced as <strong>Creator → Sales Supervisor review (when assigned) → General Manager final approval</strong>. The predefined Quotation workflow users are ${esc(SALES_SUPERVISOR.name)} (${esc(SALES_SUPERVISOR.email)}) and ${esc(GENERAL_MANAGER.name)} (${esc(GENERAL_MANAGER.email)}). Timestamps are generated from the current time by <strong>Use Time Now</strong>; email approval/notification is intentionally not part of this release.</p>
  </div>`;
}

function poHasCreatorAuthority(subject=ui.form||{}){ return quotationHasCreatorAuthority(subject); }

function renderPoSupplierInformation(f){
  const suppliers=state.suppliers.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  return `<div class="form-section po-supplier-section" id="poSupplier" tabindex="-1"><div class="form-section-title"><div><strong>Supplier & Commercial Information</strong><small>Reuse saved supplier details and define the purchasing commitment before submission.</small></div>${f.customerName?'<button type="button" class="button small ghost" data-clear-po-supplier>Clear supplier</button>':''}</div>
    <label class="field lookup-field"><span>Select Supplier <em class="count-pill">${suppliers.length} suppliers</em></span><input id="poSupplierLookup" list="poSupplierOptions" value="${esc(f.customerName||'')}" placeholder="Search suppliers by name…" autocomplete="off"><datalist id="poSupplierOptions">${suppliers.map(x=>`<option value="${esc(x.name)}"></option>`).join('')}</datalist><small class="field-help">Choose a saved supplier to auto-fill known commercial details, or enter a new supplier manually.</small></label>
    <div class="form-grid client-grid">${fieldInput('customerName','Supplier Name','text',f.customerName,ui.errors.customerName,'Enter supplier name')}${fieldArea('customerAddress','Supplier / Plant Address',f.customerAddress)}${fieldInput('customerContact','Contact Person','text',f.customerContact,null,'Enter supplier contact')}${fieldInput('customerEmail','Email','email',f.customerEmail,ui.errors.customerEmail,'supplier@example.com')}${fieldInput('customerPhone','Phone Number','tel',f.customerPhone,ui.errors.customerPhone,'+63 xxx xxx xxxx')}${fieldInput('customerTin','Supplier TIN','text',f.customerTin,ui.errors.customerTin,'e.g., 000-000-000-000')}${fieldInput('poNumber','Supplier Quote / Reference','text',f.poNumber,null,'Quotation, proposal, or supplier reference')}${paymentTermsField(f,'Payment Terms')}${fieldSelect('currency','Currency',CURRENCIES.map(([v,l])=>[v,l]),f.currency)}${validityField(f,'Validity of PO',PO_VALIDITY)}${deliveryCommitmentField(f,'Delivery Commitment',PO_DELIVERY)}${fieldInput('dueDate','Required / Target Date','date',f.dueDate,ui.errors.dueDate)}</div></div>`;
}
function renderPoItemRow(f,i,idx){ const note=!isRealItem(i), errs=ui.errors.itemRows?.[idx]||{}, amount=itemAmount(i); if(note)return `<div class="quotation-note-row" data-item-row="${i.id}" role="listitem"><span class="note-badge">NOTE</span><label class="line-field quotation-description"><span>Purchasing note</span><textarea data-item="description" data-index="${idx}" maxlength="5000" placeholder="Add line-level purchasing instruction…">${esc(i.description)}</textarea><small class="quotation-char-count">${String(i.description||'').length}/5000</small></label><div class="quotation-row-actions"><button type="button" class="icon-action" data-move-po-item="${idx}" data-direction="up" ${idx===0?'disabled':''}>↑</button><button type="button" class="icon-action" data-move-po-item="${idx}" data-direction="down" ${idx===f.items.length-1?'disabled':''}>↓</button><button type="button" class="icon-action danger" data-remove-po-item="${idx}">⌫</button></div></div>`; return `<div class="quotation-item-row ${Object.keys(errs).length?'has-error':''}" data-item-row="${i.id}" role="listitem"><span class="drag">⠿</span><span class="item-index">${idx+1}</span><label class="line-field quotation-description"><span>Description / Specification</span><textarea data-item="description" data-index="${idx}" maxlength="5000" class="${errs.description?'invalid':''}" placeholder="Enter material, model, service, or specification…">${esc(i.description)}</textarea><small class="quotation-char-count">${String(i.description||'').length}/5000</small>${errs.description?`<small class="line-error">${esc(errs.description)}</small>`:''}</label><label class="line-field"><span>Qty</span><input data-item="quantity" data-index="${idx}" type="number" min="0.0001" step="any" value="${esc(i.quantity)}" class="${errs.quantity?'invalid':''}"></label><label class="line-field"><span>Unit Price</span><input data-item="unitPrice" data-index="${idx}" type="number" min="0" step="0.01" value="${esc(i.unitPrice)}" class="${errs.unitPrice?'invalid':''}"></label><div class="quotation-line-total"><span>Amount</span><strong data-po-line-amount="${idx}">${money(amount,f.currency)}</strong></div><div class="quotation-row-actions"><button type="button" class="icon-action" data-duplicate-po-item="${idx}">⧉</button><button type="button" class="icon-action" data-move-po-item="${idx}" data-direction="up" ${idx===0?'disabled':''}>↑</button><button type="button" class="icon-action" data-move-po-item="${idx}" data-direction="down" ${idx===f.items.length-1?'disabled':''}>↓</button><button type="button" class="icon-action danger" data-remove-po-item="${idx}">⌫</button></div></div>`; }
function renderPoItems(f){ const products=state.products.slice(0,100), real=f.items.filter(isRealItem).length; return `<div class="form-section quotation-items-section po-items-section"><div class="form-section-title row-title"><div><strong>Purchase Items</strong><small>Add priced purchase lines and purchasing instructions. Saved descriptions can be reused without external dependencies.</small></div><div class="item-actions">${products.length?`<select data-po-saved-product class="saved-item-select"><option value="">Saved items…</option>${products.map(p=>`<option value="${esc(p.id)}">${esc(p.description)}</option>`).join('')}</select><button type="button" class="button" data-add-po-saved>＋ Add Saved</button>`:''}<button type="button" class="button dark" data-add-po-item>＋ Add Item</button><button type="button" class="button" data-add-po-note>▱ Add Note</button>${f.items.length>1?'<button type="button" class="button subtle danger-text" data-clear-po-items>Clear</button>':''}</div></div><div class="quotation-item-head"><span></span><span>#</span><span>Description</span><span>Quantity</span><span>Unit price</span><span>Amount</span><span>Actions</span></div><div class="quotation-item-editor po-item-editor" role="list">${f.items.map((i,idx)=>renderPoItemRow(f,i,idx)).join('')}</div>${ui.errors.items?`<div class="inline-validation error">${esc(ui.errors.items)}</div>`:''}<div class="items-footer-note"><span>${real} purchase line${real===1?'':'s'}</span><small>Ctrl/Cmd + Enter adds the next purchase item.</small></div></div>`; }
function renderPoNotesTerms(f){ const status=!String(f.terms||'').trim()?'Empty':f.terms===DEFAULT_TERMS.po?'Standard':'Customized'; return `<div class="form-section quotation-notes-section"><div class="form-section-title"><div><strong>Purchasing Notes</strong><small>Internal and supplier-facing instructions retained with this PO.</small></div><select data-po-note-template class="compact-select"><option value="">Quick templates…</option>${PO_NOTE_TEMPLATES.map(([k,v])=>`<option value="${k}">${esc(v.slice(0,54))}</option>`).join('')}</select></div><label class="field"><span>Additional Notes <em class="optional-label">Optional</em></span><textarea name="remarks" maxlength="5000" placeholder="Add shipping, documentation, inspection, or special-order instructions…">${esc(f.remarks||'')}</textarea><small class="field-help"><span data-po-notes-count>${String(f.remarks||'').length.toLocaleString()} / 5,000</span> · Included in document preview.</small></label></div><div class="form-section quotation-terms-section" data-po-terms-section><div class="form-section-title"><div><strong>Terms & Conditions</strong><small>Purchasing terms are persisted with this PO.</small></div><div class="terms-actions"><span class="terms-status ${status.toLowerCase()}" data-po-terms-status>${status}</span><button type="button" class="button small ghost" data-copy-po-terms>Copy</button><button type="button" class="button small ghost" data-reset-po-terms ${f.terms===DEFAULT_TERMS.po?'disabled':''}>Restore standard</button><button type="button" class="button small" data-toggle-po-terms>Expand</button></div></div><label class="field"><span>Document Terms & Conditions</span><textarea name="terms" maxlength="10000" class="terms-editor ${ui.errors.terms?'invalid':''}">${esc(f.terms||'')}</textarea><small class="field-help"><span data-po-terms-count>${String(f.terms||'').length.toLocaleString()} / 10,000</span> · Included in generated PO.</small></label></div>`; }
function renderPoApproval(f){
  const authority=poHasCreatorAuthority(f);
  const route=sourceQuotationApprovers({name:f.createdBy,email:f.createdByEmail,role:f.createdByRole});
  const options=[['','Select account manager…'],...PO_ACCOUNT_MANAGERS.map(x=>[x,x])];
  const approver=f.approvedBy||route.approver;
  const reviewerDone=!f.verifiedBy||!!f.verifiedAt;
  const canReview=!!f.verifiedBy&&canCurrentUserActAs(f.verifiedBy);
  const canApprove=!!approver&&canCurrentUserActAs(approver)&&reviewerDone;
  return `<div class="form-section quotation-approval-section po-approval-section"><div class="form-section-title"><div><strong>Verification & Approval Workflow</strong><small>${authority?'General Manager creator authority applies; Account Manager review remains optional as in the source workflow.':'Account Manager review is followed by General Manager final approval where required.'}</small></div></div>
    <div class="approval-created-card"><span class="person-icon">♙</span><div><div class="approval-person-label"><strong>Created By</strong><em>Auto-captured</em></div><span>${esc(f.createdBy||state.currentUser.name)}</span><small>${f.createdAt?esc(fmtDate(f.createdAt,true)):'Timestamp assigned on first save'}${f.createdByRole?` · ${esc(f.createdByRole)}`:''}</small></div></div>
    <div class="approval-workflow">${fieldSelect('verifiedBy','✓ Reviewed by Account Manager',options,f.verifiedBy)}${f.verifiedBy?`<div class="quotation-authority-notice"><strong>${f.verifiedAt?'✓ Account Manager review captured':'Account Manager review pending'}</strong><span>${esc(f.verifiedBy)}${f.verifiedAt?` · ${esc(fmtDate(f.verifiedAt,true))}`:''}</span><button type="button" class="button small workflow-capture" data-capture-approval-step="verifiedAt" ${canReview?'':`disabled title="Only ${esc(f.verifiedBy)} can record the review"`}>${f.verifiedAt?'Update review time':'Mark reviewed now'}</button></div>`:''}${authority?`<div class="quotation-authority-notice"><strong>✓ Management approval not required</strong><span>${esc(GENERAL_MANAGER.name)} is the General Manager/final approver and is also the creator of this PO.</span></div>`:`<div class="quotation-authority-notice"><strong>Final approver: ${esc(approver||GENERAL_MANAGER.name)}</strong><span>${f.approvedAt?`Approved ${esc(fmtDate(f.approvedAt,true))}`:`${esc(GENERAL_MANAGER.role)} · ${esc(GENERAL_MANAGER.email)}${reviewerDone?' · pending final approval':' · waiting for Account Manager review'}`}</span><button type="button" class="button small workflow-capture" data-capture-approval-step="approvedAt" ${canApprove?'':`disabled title="${!reviewerDone?'Complete the Account Manager review first':`Only ${esc(approver||GENERAL_MANAGER.name)} can record final approval`}"`}>${f.approvedAt?'Update approval time':'Approve now'}</button></div>`}</div>
    <p class="approval-policy-note">PO routing follows the supplied TradeLink hierarchy. Account Manager review is retained, and the final management stage is owned by ${esc(GENERAL_MANAGER.name)}, General Manager, unless he is the creator and therefore already holds final authority.</p>
  </div>`;
}

function renderCreate(){
  if(!ui.form){ try{const saved=JSON.parse(globalThis.WMModuleStore.getItem(AUTOSAVE_KEY)||'null');ui.form=saved?normalizeForm(saved):newForm('quotation')}catch{ui.form=newForm('quotation')} }
  const f=ui.form,c=calc(f),type=TYPES[f.documentType]; const financial=type.financial;
  const title=f.documentType==='esi'?'Electronic Sales Invoice':f.documentType==='payment'?'Electronic Payment Acknowledgement Receipt':f.documentType==='po'?'Purchase Order to Supplier':createTypeLabel(f.documentType);
  return `<section class="view create-view">
  <section class="create-commandbar card"><div class="document-heading"><span class="document-icon">▤</span><div><h1>${esc(title)}</h1><small>${state.settings.autosave?'Draft autosave enabled':'Autosave disabled'}${f.documentNumber?` · ${esc(f.documentNumber)}`:''}</small></div></div><div class="command-actions"><button class="button ghost" type="button" data-template>▤ <span>Templates</span></button>${f.id?`<button class="button" type="button" data-generate-document-pdf="${f.id}">⇩ <span>Generate PDF</span></button>`:`<button class="button" type="button" data-generate-pdf>⇩ <span>Generate PDF</span></button>`}<button class="button primary save" type="button" data-form-action="draft">▣ <span>Save</span></button></div></section>
  <section class="card create-workspace">${renderCreateTypeTabs(f.documentType)}${f.documentType==='esi'?renderEsiSectionNav():''}
  <form id="docForm" novalidate>
    <div class="form-section" ${f.documentType==='esi'?'id="esiDocumentInfo" tabindex="-1"':''}><div class="form-section-title"><strong>Document Information</strong></div><div class="form-grid three identity-grid">
      ${f.documentType==='esi'?`<label class="field status-managed-field"><span>Status</span><input value="${esc(f.status)}" disabled aria-describedby="esiStatusHelp"><small id="esiStatusHelp" class="field-help">Managed by Save & Submit and the approval workflow.</small></label>`:['quotation','po'].includes(f.documentType)?`<label class="field status-managed-field"><span>Status</span><input value="${esc(f.status)}" disabled aria-describedby="quotationStatusHelp"><small id="quotationStatusHelp" class="field-help">Managed by Save & Submit and creator approval authority.</small></label>`:fieldSelect('status','Status',STATUS_FLOW.map(v=>[v,v]),f.status)}
      <label class="field"><span>Number</span><input value="${esc(f.documentNumber||`${TYPES[f.documentType].prefix}[Will be assigned on save]`)}" disabled class="number-preview"><small class="field-help">⚠ Number will be assigned when you save the document</small></label>
      ${fieldInput('date','Date','date',f.date,ui.errors.date)}
      ${fieldInput('referenceNumber','Revision / Reference No.','text',f.referenceNumber,null,'0')}
    </div></div>
    ${f.documentType==='esi'?renderEsiClientInformation(f):f.documentType==='packing'?renderPackingClientInformation(f):f.documentType==='delivery'?renderDeliveryClientInformation(f):f.documentType==='payment'?renderPaymentClientInformation(f):f.documentType==='quotation'?renderQuotationClientInformation(f):f.documentType==='po'?renderPoSupplierInformation(f):`<div class="form-section"><div class="form-section-title"><strong>${f.documentType==='po'?'Supplier Information':'Client Information'}</strong></div><div class="form-grid client-grid">
      ${fieldInput('customerName',f.documentType==='po'?'Supplier Name':'Client Name','text',f.customerName,ui.errors.customerName,f.documentType==='po'?'Enter supplier name':'Enter client name')}
      ${fieldArea('customerAddress',f.documentType==='po'?'Supplier Address':'Plant Address',f.customerAddress)}
      ${fieldInput('customerContact','Contact Person','text',f.customerContact,null,'Enter contact person name')}
      ${fieldInput('customerTin',f.documentType==='po'?'Supplier TIN':'Customer TIN','text',f.customerTin,null,'e.g., 000-000-000-000')}
      ${fieldInput('poNumber','PO Number / Reference #','text',f.poNumber)}
      ${paymentTermsField(f,'Payment Terms')}
      ${financial?fieldSelect('currency','Currency',CURRENCIES.map(([v,l])=>[v,l]),f.currency):''}
    </div></div>`}
    ${f.documentType==='payment'?renderPaymentFields(f):renderItems(f,financial)}
    ${financial?renderFinancialFields(f,c):''}
    ${f.documentType==='esi'?renderEsiTerms(f):f.documentType==='packing'?renderPackingTerms(f):f.documentType==='delivery'?renderDeliveryTerms(f):f.documentType==='payment'?renderPaymentTerms(f):f.documentType==='quotation'?`${renderQuotationNotes(f)}${renderQuotationTerms(f)}`:f.documentType==='po'?renderPoNotesTerms(f):`<div class="form-section"><div class="form-section-title"><strong>Terms & Conditions</strong><small>Persisted with the generated document</small></div><div class="terms-layout">${fieldArea('terms','Document Terms & Conditions',f.terms)}${fieldArea('remarks','Remarks / Notes',f.remarks)}</div></div>`}
    ${f.documentType==='delivery'?renderDeliveryTracking(f):f.documentType==='payment'?renderPaymentAcknowledgement(f):''}
    ${type.approval?(f.documentType==='esi'?renderEsiApprovalWorkflow(f):f.documentType==='quotation'?renderQuotationApproval(f):f.documentType==='po'?renderPoApproval(f):`<div class="form-section"><div class="form-section-title"><strong>Verification & Approval Workflow</strong></div><div class="approval-workflow"><div class="created-by"><span class="person-icon">♙</span><div><strong>Created By <em>Auto-captured</em></strong><span>${esc(f.createdBy||state.currentUser.name)}</span><small>${fmtDate(f.createdAt||new Date(),true)}</small></div></div>${fieldInput('verifiedBy','✓ Verified By','text',f.verifiedBy,null,'Assign reviewer...')}${fieldInput('approvedBy','✓ Approved By','text',f.approvedBy,null,'Assign approver...')}</div></div>`):''}
    ${ui.errors.items?`<div class="notice error form-error">${esc(ui.errors.items)}</div>`:''}
    <div class="form-footer"><span>${financial?`Current total: <strong>${money(c.total,f.currency)}</strong>`:f.documentType==='payment'?`Amount acknowledged: <strong>${money(f.paymentForm==='cheque'?Number(f.chequeAmount)||0:Number(f.cashAmount)||0,f.currency)}</strong>`:'Document ready for validation and save'}</span><div><button class="button" type="button" data-cancel-form>Cancel</button><button class="button" type="button" data-form-action="draft">Save Draft</button><button class="button primary" type="button" data-form-action="submit">Save & Submit</button></div></div>
  </form></section></section>`;
}

function dueDateFromTerms(date, terms){
  if(!date)return '';
  const match=String(terms||'').match(/(15|30|45|60|90) Days/); if(!match)return '';
  const d=new Date(`${date}T12:00:00`); d.setDate(d.getDate()+Number(match[1])); return d.toISOString().slice(0,10);
}
function renderEsiClientInformation(f){
  const saved=state.clients.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  const options=saved.map(c=>`<option value="${esc(c.name)}"></option>`).join('');
  const currencyOptions=CURRENCIES.map(([v,l])=>[v,l]);
  const nonPhp=f.currency!=='PHP';
  return `<div class="form-section esi-client-section" id="esiClientInfo" tabindex="-1"><div class="form-section-title"><div><strong>Client Information</strong><small>Billing, contact, payment, and currency details for this Electronic SI</small></div><span class="section-state">${saved.length?`${saved.length} saved client${saved.length===1?'':'s'}`:'Manual entry'}</span></div>
    <div class="client-lookup-card">
      <div class="client-lookup-copy"><span class="client-lookup-icon">⌕</span><div><strong>Select or search a saved client</strong><small>Choose an existing client to auto-fill known details, or enter a new client below.</small></div></div>
      <div class="client-lookup-control"><input id="esiClientLookup" list="esiClientOptions" autocomplete="off" placeholder="Search saved clients by name…" value="${esc(f.customerName||'')}"><datalist id="esiClientOptions">${options}</datalist><button type="button" class="button small" data-clear-client>Clear</button></div>
    </div>
    <div class="form-grid esi-client-grid">
      <label class="field full"><span>Client Name <em class="required-dot">Required</em></span><input name="customerName" type="text" value="${esc(f.customerName)}" placeholder="Enter client name" autocomplete="organization" class="${ui.errors.customerName?'invalid':''}" ${ui.errors.customerName?'aria-invalid="true" aria-describedby="customerNameError"':''}><small class="field-help">Auto-populated from a saved client or entered manually.</small>${ui.errors.customerName?`<small id="customerNameError" class="field-error" role="alert">${esc(ui.errors.customerName)}</small>`:''}</label>
      <label class="field full"><span>Plant Address</span><textarea name="customerAddress" placeholder="Enter plant address" autocomplete="street-address">${esc(f.customerAddress)}</textarea><small class="field-help">Use the billing or delivery plant address that should appear on the SI.</small></label>
      <label class="field full"><span>Contact Person</span><input name="customerContact" type="text" value="${esc(f.customerContact)}" placeholder="Enter contact person name" autocomplete="name"><small class="field-help">Primary person responsible for this transaction.</small></label>
      ${fieldInput('customerEmail','Email','email',f.customerEmail,ui.errors.customerEmail,'client@example.com')}
      ${fieldInput('customerPhone','Phone Number','tel',f.customerPhone,ui.errors.customerPhone,'+63 xxx xxx xxxx')}
      <label class="field"><span>Customer TIN</span><input name="customerTin" type="text" inputmode="numeric" value="${esc(f.customerTin)}" placeholder="e.g., 000-000-000-000" class="${ui.errors.customerTin?'invalid':''}" ${ui.errors.customerTin?'aria-invalid="true" aria-describedby="customerTinError"':''}><small class="field-help">Tax Identification Number for official invoices.</small>${ui.errors.customerTin?`<small id="customerTinError" class="field-error" role="alert">${esc(ui.errors.customerTin)}</small>`:''}</label>
      <label class="field"><span>Due Date</span><input name="dueDate" type="date" min="${esc(f.date||todayISO())}" value="${esc(f.dueDate)}" class="${ui.errors.dueDate?'invalid':''}" ${ui.errors.dueDate?'aria-invalid="true" aria-describedby="dueDateError"':''}><small class="field-help">Auto-suggested from supported payment terms; you can override it.</small>${ui.errors.dueDate?`<small id="dueDateError" class="field-error" role="alert">${esc(ui.errors.dueDate)}</small>`:''}</label>
      ${fieldInput('poNumber','Reference Information','text',f.poNumber,null,'PO Number / Reference #')}
      ${paymentTermsField(f,'Payment Terms')}
      <label class="field ${nonPhp?'':'full'}"><span>Currency ${nonPhp?'<em class="info-chip">Bank details below</em>':''}</span><select name="currency">${currencyOptions.map(([v,l])=>`<option value="${esc(v)}" ${v===f.currency?'selected':''}>${esc(l)}</option>`).join('')}</select><small class="field-help">Select the currency for all prices in this document.</small></label>
      ${nonPhp?`<label class="field exchange-rate-field"><span>Exchange Rate (PHP)</span><div class="inline-input"><input name="exchangeRate" type="number" min="0.000001" step="0.000001" value="${esc(f.exchangeRate)}" class="${ui.errors.exchangeRate?'invalid':''}" ${ui.errors.exchangeRate?'aria-invalid="true" aria-describedby="exchangeRateError"':''}><button type="button" class="button small" data-reset-rate>Reset</button></div><small class="field-help">1 ${esc(f.currency)} = ? PHP. Used for equivalent display and recordkeeping.</small>${ui.errors.exchangeRate?`<small id="exchangeRateError" class="field-error" role="alert">${esc(ui.errors.exchangeRate)}</small>`:''}</label>`:''}
    </div>
    <div class="client-entry-note"><span>✓</span><div><strong>Client details are saved with the document.</strong><small>New client names are added to the local client list after a successful save, so they can be reused on future Electronic SIs.</small></div></div>
  </div>`;
}

function renderPackingClientInformation(f){
  const saved=state.clients.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  const options=saved.map(c=>`<option value="${esc(c.name)}"></option>`).join('');
  return `<div class="form-section packing-client-section" id="packingClientInfo" tabindex="-1"><div class="form-section-title"><div><strong>Client & Shipment Information</strong><small>Recipient, contact, reference, and delivery timing details for this Packing List.</small></div><span class="section-state">${saved.length?`${saved.length} saved client${saved.length===1?'':'s'}`:'Manual entry'}</span></div>
    <div class="client-lookup-card packing-client-lookup"><div class="client-lookup-copy"><span class="client-lookup-icon">⌕</span><div><strong>Select or search a saved client</strong><small>Reuse known client details or continue with manual entry.</small></div></div><div class="client-lookup-control"><input id="packingClientLookup" list="packingClientOptions" autocomplete="off" placeholder="Search saved clients by name…" value="${esc(f.customerName||'')}"><datalist id="packingClientOptions">${options}</datalist><button type="button" class="button small" data-clear-packing-client>Clear</button></div></div>
    <div class="form-grid packing-client-grid">
      <label class="field full"><span>Client Name <em class="required-dot">Required</em></span><input name="customerName" type="text" value="${esc(f.customerName)}" placeholder="Enter client name" autocomplete="organization" class="${ui.errors.customerName?'invalid':''}" ${ui.errors.customerName?'aria-invalid="true" aria-describedby="packingCustomerNameError"':''}><small class="field-help">Recipient or organization shown on the Packing List.</small>${ui.errors.customerName?`<small id="packingCustomerNameError" class="field-error" role="alert">${esc(ui.errors.customerName)}</small>`:''}</label>
      <label class="field full"><span>Plant / Delivery Address</span><textarea name="customerAddress" placeholder="Enter delivery or plant address" autocomplete="street-address">${esc(f.customerAddress)}</textarea><small class="field-help">Use the destination that should appear on the generated document.</small></label>
      <label class="field full"><span>Contact Person</span><input name="customerContact" type="text" value="${esc(f.customerContact)}" placeholder="Enter contact person name" autocomplete="name"><small class="field-help">Primary recipient or site contact for this shipment.</small></label>
      ${fieldInput('customerEmail','Email','email',f.customerEmail,ui.errors.customerEmail,'client@example.com')}
      ${fieldInput('customerPhone','Phone Number','tel',f.customerPhone,ui.errors.customerPhone,'+63 xxx xxx xxxx')}
      <label class="field"><span>Customer TIN</span><input name="customerTin" type="text" inputmode="numeric" value="${esc(f.customerTin)}" placeholder="e.g., 000-000-000-000" class="${ui.errors.customerTin?'invalid':''}" ${ui.errors.customerTin?'aria-invalid="true" aria-describedby="packingCustomerTinError"':''}><small class="field-help">Optional tax identifier retained with the document.</small>${ui.errors.customerTin?`<small id="packingCustomerTinError" class="field-error" role="alert">${esc(ui.errors.customerTin)}</small>`:''}</label>
      <label class="field"><span>Expected Delivery Date</span><input name="dueDate" type="date" min="${esc(f.date||todayISO())}" value="${esc(f.dueDate)}" class="${ui.errors.dueDate?'invalid':''}" ${ui.errors.dueDate?'aria-invalid="true" aria-describedby="packingDueDateError"':''}><small class="field-help">Optional expected receipt/delivery date.</small>${ui.errors.dueDate?`<small id="packingDueDateError" class="field-error" role="alert">${esc(ui.errors.dueDate)}</small>`:''}</label>
      ${fieldInput('poNumber','PO / Shipment Reference','text',f.poNumber,null,'PO Number / Shipment Reference #')}
      ${paymentTermsField(f,'Related Commercial Terms')}
    </div>
    <div class="client-entry-note packing-entry-note"><span>✓</span><div><strong>Client details remain reusable.</strong><small>Saving this Packing List updates the existing local client directory so future documents can reuse the same recipient details.</small></div></div>
  </div>`;
}

function renderPackingTerms(f){
  const terms=String(f.terms||''),standard=DEFAULT_TERMS.packing,status=!terms.trim()?'Empty':terms===standard?'Standard':'Customized';
  return `<div class="form-section packing-terms-section ${ui.termsExpanded?'is-expanded':''}" id="packingTerms" tabindex="-1" data-packing-terms-section><div class="form-section-title packing-terms-title"><div><strong>Terms & Conditions</strong><small>Persisted with the Packing List and included in document preview/PDF output.</small></div><span class="terms-status ${status.toLowerCase()}" data-packing-terms-status>${status}</span></div>
    <div class="terms-toolbar"><div class="terms-toolbar-copy"><strong>Document Terms & Conditions</strong><small>Keep shipment-specific terms concise and review them before submission.</small></div><div class="terms-actions"><button class="button small" type="button" data-copy-packing-terms>Copy</button><button class="button small" type="button" data-reset-packing-terms ${terms===standard?'disabled':''}>Restore standard</button><button class="button small" type="button" data-toggle-packing-terms aria-expanded="${ui.termsExpanded}">${ui.termsExpanded?'Collapse':'Expand'}</button></div></div>
    <label class="field terms-editor-field ${ui.errors.terms?'has-field-error':''}"><span class="sr-only">Packing List Terms & Conditions</span><textarea name="terms" maxlength="10000" rows="${ui.termsExpanded?24:10}" class="${ui.errors.terms?'invalid':''}" ${ui.errors.terms?'aria-invalid="true" aria-describedby="packingTermsError"':''}>${esc(terms)}</textarea><div class="terms-editor-meta"><small>These terms appear on the generated Packing List.</small><small data-packing-terms-count>${terms.length.toLocaleString()} / 10,000</small></div>${ui.errors.terms?`<small id="packingTermsError" class="field-error" role="alert">${esc(ui.errors.terms)}</small>`:''}</label>
  </div>`;
}


function renderDeliveryClientInformation(f){
  const saved=state.clients.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  return `<div class="form-section delivery-client-section" id="deliveryClientInfo" tabindex="-1"><div class="form-section-title"><div><strong>Client & Delivery Information</strong><small>Recipient, destination, contact, delivery timing, and reference details for this Delivery Receipt.</small></div><span class="section-state">${saved.length?`${saved.length} saved client${saved.length===1?'':'s'}`:'Manual entry'}</span></div>
    <div class="client-lookup-card"><div class="client-lookup-copy"><span class="client-lookup-icon">⌕</span><div><strong>Select or search a saved client</strong><small>Reuse known delivery details or continue with manual entry.</small></div></div><div class="client-lookup-control"><input id="deliveryClientLookup" list="deliveryClientOptions" autocomplete="off" placeholder="Search saved clients by name…" value="${esc(f.customerName||'')}"><datalist id="deliveryClientOptions">${saved.map(c=>`<option value="${esc(c.name)}"></option>`).join('')}</datalist><button type="button" class="button small" data-clear-delivery-client>Clear</button></div></div>
    <div class="form-grid delivery-client-grid">
      <label class="field full"><span>Client Name <em class="required-dot">Required</em></span><input name="customerName" value="${esc(f.customerName)}" placeholder="Enter client name" autocomplete="organization" class="${ui.errors.customerName?'invalid':''}" ${ui.errors.customerName?'aria-invalid="true" aria-describedby="deliveryCustomerNameError"':''}><small class="field-help">Auto-filled from a saved client or entered manually.</small>${ui.errors.customerName?`<small id="deliveryCustomerNameError" class="field-error" role="alert">${esc(ui.errors.customerName)}</small>`:''}</label>
      <label class="field full"><span>Delivery / Plant Address</span><textarea name="customerAddress" placeholder="Enter delivery destination" autocomplete="street-address">${esc(f.customerAddress)}</textarea><small class="field-help">Use the actual delivery destination that should appear on the receipt.</small></label>
      <label class="field full"><span>Contact Person</span><input name="customerContact" value="${esc(f.customerContact)}" placeholder="Enter receiving contact" autocomplete="name"></label>
      <label class="field"><span>Email</span><input name="customerEmail" type="email" value="${esc(f.customerEmail||'')}" placeholder="client@example.com" class="${ui.errors.customerEmail?'invalid':''}" ${ui.errors.customerEmail?'aria-invalid="true"':''}>${ui.errors.customerEmail?`<small class="field-error" role="alert">${esc(ui.errors.customerEmail)}</small>`:''}</label>
      <label class="field"><span>Phone Number</span><input name="customerPhone" type="tel" value="${esc(f.customerPhone||'')}" placeholder="+63 xxx xxx xxxx" class="${ui.errors.customerPhone?'invalid':''}" ${ui.errors.customerPhone?'aria-invalid="true"':''}>${ui.errors.customerPhone?`<small class="field-error" role="alert">${esc(ui.errors.customerPhone)}</small>`:''}</label>
      <label class="field"><span>Customer TIN</span><input name="customerTin" value="${esc(f.customerTin)}" placeholder="e.g., 000-000-000-000" class="${ui.errors.customerTin?'invalid':''}" ${ui.errors.customerTin?'aria-invalid="true"':''}>${ui.errors.customerTin?`<small class="field-error" role="alert">${esc(ui.errors.customerTin)}</small>`:'<small class="field-help">Tax Identification Number, when applicable.</small>'}</label>
      <label class="field"><span>Delivery / Due Date</span><input name="dueDate" type="date" min="${esc(f.date||todayISO())}" value="${esc(f.dueDate||'')}" class="${ui.errors.dueDate?'invalid':''}" ${ui.errors.dueDate?'aria-invalid="true"':''}>${ui.errors.dueDate?`<small class="field-error" role="alert">${esc(ui.errors.dueDate)}</small>`:'<small class="field-help">Optional expected or committed delivery date.</small>'}</label>
      <label class="field"><span>PO / Delivery Reference</span><input name="poNumber" value="${esc(f.poNumber||'')}" placeholder="PO Number / Reference #"><small class="field-help">Use the customer PO, dispatch, or project reference.</small></label>
      ${paymentTermsField(f,'Commercial Terms')}
      ${f.drIncludePricing?fieldSelect('currency','Pricing Currency',CURRENCIES.map(([v,l])=>[v,l]),f.currency):''}
    </div>
  </div>`;
}
function renderDeliveryItems(f){
  const products=state.products.slice(0,80), realCount=f.items.filter(isRealItem).length, priced=Boolean(f.drIncludePricing);
  return `<div class="form-section delivery-items-section" id="deliveryItems" tabindex="-1"><div class="form-section-title row-title"><div><div class="delivery-items-title"><strong>Delivered Items</strong><label class="pricing-toggle"><input type="checkbox" name="drIncludePricing" ${priced?'checked':''}><span aria-hidden="true"></span><b>Include Pricing</b></label></div><small>Record delivered quantities and optional serial numbers. Pricing can be included when the receipt requires commercial values.</small></div><div class="item-actions">${products.length?`<select class="saved-item-select" data-delivery-saved-product aria-label="Choose a saved item"><option value="">Saved items…</option>${products.map(p=>`<option value="${esc(p.id)}">${esc(p.description)}</option>`).join('')}</select><button type="button" class="button" data-add-delivery-saved>⌕ <span>Add Saved Item</span></button>`:''}<button type="button" class="button dark" data-add-delivery-item>＋ <span>Add Item</span></button>${f.items.length>1?`<button type="button" class="button subtle danger-text" data-clear-delivery-items>Clear</button>`:''}</div></div>
    <div class="items-guidance"><span>Enter the actual delivered quantity and serial/reference identifier where applicable.</span><small>${priced?'Pricing is enabled for this receipt.':'Pricing is hidden; quantities and serial numbers remain unaffected.'}</small></div>
    <div class="delivery-item-head ${priced?'priced':''}" aria-hidden="true"><span></span><span>#</span><span>Description</span><span>Quantity</span><span>Serial No.</span>${priced?'<span>Unit price</span><span>Amount</span>':''}<span>Actions</span></div>
    <div class="delivery-item-editor" role="list" aria-label="Delivery Receipt items">${f.items.map((i,idx)=>renderDeliveryItemRow(f,i,idx,priced)).join('')}</div>
    ${ui.errors.items?`<div class="inline-validation error" role="alert">${esc(ui.errors.items)}</div>`:''}
    ${priced?`<div class="delivery-total"><span>Total delivered value</span><strong data-delivery-total>${money(calc(f).subtotal,f.currency)}</strong></div>`:''}
    <div class="items-footer-note"><span>${realCount?`${realCount} delivery line${realCount===1?'':'s'}`:'No delivered items yet'}</span><small>Tip: press Ctrl/⌘ + Enter to add the next delivery line.</small></div>
  </div>`;
}
function renderDeliveryItemRow(f,i,idx,priced){
  const rowErrors=ui.errors.itemRows?.[idx]||{};
  return `<div class="delivery-item-row ${priced?'priced':''} ${Object.keys(rowErrors).length?'has-error':''}" data-item-row="${esc(i.id)}" role="listitem"><span class="drag" aria-hidden="true">⠿</span><span class="item-index">${idx+1}</span>
    <label class="line-field description-field"><span>Description</span><textarea data-item="description" data-index="${idx}" maxlength="5000" placeholder="Enter material description..." class="${rowErrors.description?'invalid':''}" ${rowErrors.description?'aria-invalid="true"':''}>${esc(i.description)}</textarea><small class="item-char-count">${String(i.description||'').length}/5000</small>${rowErrors.description?`<small class="line-error">${esc(rowErrors.description)}</small>`:''}</label>
    <label class="line-field"><span>Quantity</span><input data-item="quantity" data-index="${idx}" type="number" min="0.0001" step="any" value="${esc(i.quantity)}" class="${rowErrors.quantity?'invalid':''}" ${rowErrors.quantity?'aria-invalid="true"':''}>${rowErrors.quantity?`<small class="line-error">${esc(rowErrors.quantity)}</small>`:''}</label>
    <label class="line-field"><span>Serial No.</span><input data-item="serialNumber" data-index="${idx}" type="text" maxlength="120" value="${esc(i.serialNumber||'')}" placeholder="Optional serial / asset ID"><small>${String(i.serialNumber||'').length}/120</small></label>
    ${priced?`<label class="line-field"><span>Unit price</span><input data-item="unitPrice" data-index="${idx}" type="number" min="0" step="0.01" value="${esc(i.unitPrice||0)}" class="${rowErrors.unitPrice?'invalid':''}" ${rowErrors.unitPrice?'aria-invalid="true"':''}>${rowErrors.unitPrice?`<small class="line-error">${esc(rowErrors.unitPrice)}</small>`:''}</label><strong class="delivery-line-amount" data-delivery-line-amount="${idx}">${money(itemAmount(i),f.currency)}</strong>`:''}
    <div class="line-actions"><button type="button" data-move-delivery-item="${idx}" data-direction="up" aria-label="Move item up" ${idx===0?'disabled':''}>↑</button><button type="button" data-move-delivery-item="${idx}" data-direction="down" aria-label="Move item down" ${idx===f.items.length-1?'disabled':''}>↓</button><button type="button" data-duplicate-delivery-item="${idx}" aria-label="Duplicate item">⧉</button><button type="button" class="danger" data-remove-delivery-item="${idx}" aria-label="Remove item">×</button></div>
  </div>`;
}
function renderDeliveryTerms(f){
  const terms=String(f.terms||''),standard=DEFAULT_TERMS.delivery,status=!terms.trim()?'Empty':terms===standard?'Standard':'Customized';
  return `<div class="form-section delivery-terms-section ${ui.termsExpanded?'is-expanded':''}" data-delivery-terms-section><div class="form-section-title"><div><strong>Terms & Conditions</strong><small>Delivery acceptance, inspection, warranty, and handling terms included with the generated receipt.</small></div><span class="terms-status ${status.toLowerCase()}" data-delivery-terms-status>${status}</span></div><div class="terms-toolbar"><div class="terms-toolbar-copy"><strong>Delivery Receipt Terms & Conditions</strong><small>Review before submission; changes autosave with this draft.</small></div><div class="terms-actions"><button type="button" class="button small" data-copy-delivery-terms>Copy</button><button type="button" class="button small" data-reset-delivery-terms ${terms===standard?'disabled':''}>Restore standard</button><button type="button" class="button small" data-toggle-delivery-terms aria-expanded="${ui.termsExpanded}">${ui.termsExpanded?'Collapse':'Expand'}</button></div></div><label class="field terms-editor-field"><span class="sr-only">Delivery Receipt Terms & Conditions</span><textarea name="terms" maxlength="10000" rows="${ui.termsExpanded?24:10}" class="${ui.errors.terms?'invalid':''}">${esc(terms)}</textarea><div class="terms-editor-meta"><small>These terms appear on the generated Delivery Receipt.</small><small data-delivery-terms-count>${terms.length.toLocaleString()} / 10,000</small></div>${ui.errors.terms?`<small class="field-error" role="alert">${esc(ui.errors.terms)}</small>`:''}</label></div>`;
}
function renderDeliveryTracking(f){
  const checkedValid=!f.checkedBy||DR_QC_PERSONNEL.includes(f.checkedBy), deliveredValid=!f.deliveredBy||DR_LOGISTICS_PERSONNEL.includes(f.deliveredBy);
  return `<div class="form-section delivery-tracking-section" id="deliveryTracking" tabindex="-1"><div class="form-section-title"><div><strong>Delivery Tracking</strong><small>Assign Quality Control and Logistics responsibility before submission.</small></div><span class="workflow-state ${f.checkedAt&&f.deliveredAt?'approved':f.checkedBy&&f.deliveredBy?'ready':'draft'}">${f.checkedAt&&f.deliveredAt?'Delivery recorded':f.checkedBy&&f.deliveredBy?'Ready for submission':'Assignments incomplete'}</span></div>
    <div class="approval-created-card"><span class="person-icon">♙</span><div><div class="approval-person-label"><strong>Created By</strong><em>Auto-captured</em></div><span>${esc(f.createdBy||state.currentUser.name)}</span><small>${f.createdAt?esc(fmtDate(f.createdAt,true)):'Timestamp assigned on first save'}</small></div></div>
    <div class="delivery-tracking-grid"><label class="field"><span>✓ Checked By (Quality Control) <b aria-hidden="true">*</b></span><select name="checkedBy" id="deliveryCheckedBy" class="${ui.errors.checkedBy?'invalid':''}" ${ui.errors.checkedBy?'aria-invalid="true"':''}><option value="">Select QC personnel...</option>${DR_QC_PERSONNEL.map(v=>`<option value="${esc(v)}" ${f.checkedBy===v?'selected':''}>${esc(v)}</option>`).join('')}${f.checkedBy&&!checkedValid?`<option selected value="${esc(f.checkedBy)}">${esc(f.checkedBy)} (legacy)</option>`:''}</select><small class="field-help">Responsible for condition and quantity verification.${f.checkedAt?` Checked ${esc(fmtDate(f.checkedAt,true))}.`:''}</small>${f.checkedBy?`<button type="button" class="button small workflow-capture" data-capture-delivery="checkedAt" ${f.checkedBy!==state.currentUser.name?'disabled title="Only the assigned QC personnel can capture this timestamp"':''}>${f.checkedAt?'Update check time':'Mark checked now'}</button>`:''}${ui.errors.checkedBy?`<small class="field-error">${esc(ui.errors.checkedBy)}</small>`:''}</label>
    <label class="field"><span>🚚 Delivered By (Logistics) <b aria-hidden="true">*</b></span><select name="deliveredBy" id="deliveryDeliveredBy" class="${ui.errors.deliveredBy?'invalid':''}" ${ui.errors.deliveredBy?'aria-invalid="true"':''}><option value="">Select logistics personnel...</option>${DR_LOGISTICS_PERSONNEL.map(v=>`<option value="${esc(v)}" ${f.deliveredBy===v?'selected':''}>${esc(v)}</option>`).join('')}${f.deliveredBy&&!deliveredValid?`<option selected value="${esc(f.deliveredBy)}">${esc(f.deliveredBy)} (legacy)</option>`:''}</select><small class="field-help">Responsible for physical delivery and handoff.${f.deliveredAt?` Delivered ${esc(fmtDate(f.deliveredAt,true))}.`:''}</small>${f.deliveredBy?`<button type="button" class="button small workflow-capture" data-capture-delivery="deliveredAt" ${f.deliveredBy!==state.currentUser.name?'disabled title="Only the assigned Logistics personnel can capture this timestamp"':''}>${f.deliveredAt?'Update delivery time':'Mark delivered now'}</button>`:''}${ui.errors.deliveredBy?`<small class="field-error">${esc(ui.errors.deliveredBy)}</small>`:''}</label></div>
    <div class="approval-readiness ${f.checkedBy&&f.deliveredBy?'ready':'draft'}"><div><strong>${f.checkedBy&&f.deliveredBy?'Tracking assignments complete':'Complete delivery assignments'}</strong><span>Drafts may be saved without assignments. Save & Submit requires both QC and Logistics personnel.</span></div>${f.checkedBy||f.deliveredBy?'<button type="button" class="button small" data-clear-delivery-tracking>Clear assignments</button>':''}</div>
  </div>`;
}

function fieldInput(name,label,type,value,error=null,placeholder=''){const eid=error?`${name}Error`:'';return`<label class="field ${error?'has-field-error':''}"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" class="${error?'invalid':''}" ${error?`aria-invalid="true" aria-describedby="${eid}"`:''}>${error?`<small id="${eid}" class="field-error" role="alert">${esc(error)}</small>`:''}</label>`}
function fieldArea(name,label,value){return`<label class="field"><span>${label}</span><textarea name="${name}">${esc(value)}</textarea></label>`}
function fieldSelect(name,label,opts,value,attrs=''){return`<label class="field"><span>${label}</span><select id="${name}" name="${name}" ${attrs}>${opts.map(([v,l])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`}
function fieldExtensibleSelect(name,label,opts,value,customName,customValue,customTriggers,inputType='text',placeholder='Enter custom value',customLabel='Custom value',error='',customAttrs=''){
  const active=customTriggers.includes(value);
  return `<div class="extensible-field-group ${active?'is-custom':''}" data-extensible-field="${esc(name)}">${fieldSelect(name,label,opts,value)}${active?`<label class="field extensible-custom-field"><span>${esc(customLabel)} <em class="required-dot">Required</em></span><input name="${esc(customName)}" type="${esc(inputType)}" value="${esc(customValue||'')}" placeholder="${esc(placeholder)}" ${customAttrs} class="${error?'invalid':''}" ${error?'aria-invalid="true"':''}>${error?`<small class="field-error" role="alert">${esc(error)}</small>`:`<small class="field-help">This value is stored with the document and used anywhere the selected option is displayed.</small>`}</label>`:''}</div>`;
}
function paymentTermsField(f,label='Payment Terms'){return fieldExtensibleSelect('paymentTerms',label,PAYMENT_TERMS.map(v=>[v,v]),f.paymentTerms,'paymentTermsCustom',f.paymentTermsCustom,['Custom'],'text','Enter the agreed payment terms','Custom Payment Terms',ui.errors.paymentTermsCustom,'maxlength="160" autocomplete="off"');}
function validityField(f,label,options){return fieldExtensibleSelect('validity',label,options.map(v=>[v,v]),f.validity,'validityCustom',f.validityCustom,['Others (Custom Date)'],'date','','Custom Validity Date',ui.errors.validityCustom,`min="${esc(f.date||todayISO())}"`);}
function deliveryCommitmentField(f,label,options){return fieldExtensibleSelect('deliveryCommitment',label,options.map(v=>[v,v]),f.deliveryCommitment,'deliveryCommitmentCustom',f.deliveryCommitmentCustom,['Others (Custom)'],'text','Describe the committed delivery lead time','Custom Delivery Commitment',ui.errors.deliveryCommitmentCustom,'maxlength="160" autocomplete="off"');}

function renderPaymentClientInformation(f){
  const saved=state.clients.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))),options=saved.map(c=>`<option value="${esc(c.name)}"></option>`).join('');
  return `<div class="form-section payment-client-section" id="paymentClientInfo" tabindex="-1"><div class="form-section-title"><div><strong>Client Information</strong><small>Identify the payer and preserve the commercial reference used for reconciliation.</small></div><span class="section-state">${saved.length?`${saved.length} saved client${saved.length===1?'':'s'}`:'Manual entry'}</span></div>
    <div class="client-lookup-card"><div class="client-lookup-copy"><span class="client-lookup-icon">⌕</span><div><strong>Select or search a saved client</strong><small>Reuse known billing details or continue with manual entry.</small></div></div><div class="client-lookup-control"><input id="paymentClientLookup" list="paymentClientOptions" autocomplete="off" placeholder="Search saved clients by name…" value="${esc(f.customerName||'')}"><datalist id="paymentClientOptions">${options}</datalist><button type="button" class="button small" data-clear-payment-client>Clear</button></div></div>
    <div class="form-grid payment-client-grid">
      <label class="field full"><span>Client Name <em class="required-dot">Required</em></span><input name="customerName" value="${esc(f.customerName)}" placeholder="Enter client name" autocomplete="organization" class="${ui.errors.customerName?'invalid':''}" ${ui.errors.customerName?'aria-invalid="true"':''}>${ui.errors.customerName?`<small class="field-error" role="alert">${esc(ui.errors.customerName)}</small>`:'<small class="field-help">Payer or client name shown on the acknowledgement.</small>'}</label>
      <label class="field full"><span>Plant / Billing Address</span><textarea name="customerAddress" placeholder="Enter client address" autocomplete="street-address">${esc(f.customerAddress)}</textarea></label>
      <label class="field full"><span>Contact Person</span><input name="customerContact" value="${esc(f.customerContact)}" placeholder="Enter contact person" autocomplete="name"></label>
      <label class="field"><span>Email</span><input name="customerEmail" type="email" value="${esc(f.customerEmail||'')}" placeholder="client@example.com" class="${ui.errors.customerEmail?'invalid':''}" ${ui.errors.customerEmail?'aria-invalid="true"':''}>${ui.errors.customerEmail?`<small class="field-error" role="alert">${esc(ui.errors.customerEmail)}</small>`:''}</label>
      <label class="field"><span>Phone Number</span><input name="customerPhone" type="tel" value="${esc(f.customerPhone||'')}" placeholder="+63 xxx xxx xxxx" class="${ui.errors.customerPhone?'invalid':''}" ${ui.errors.customerPhone?'aria-invalid="true"':''}>${ui.errors.customerPhone?`<small class="field-error" role="alert">${esc(ui.errors.customerPhone)}</small>`:''}</label>
      <label class="field"><span>Customer TIN</span><input name="customerTin" value="${esc(f.customerTin)}" placeholder="e.g., 000-000-000-000" class="${ui.errors.customerTin?'invalid':''}" ${ui.errors.customerTin?'aria-invalid="true"':''}>${ui.errors.customerTin?`<small class="field-error" role="alert">${esc(ui.errors.customerTin)}</small>`:'<small class="field-help">Optional, when the payment is tied to an official commercial document.</small>'}</label>
      <label class="field"><span>Related Due Date</span><input name="dueDate" type="date" value="${esc(f.dueDate||'')}"><small class="field-help">Optional due date from the referenced invoice or agreement.</small></label>
      <label class="field"><span>Invoice / PO / Reference</span><input name="poNumber" value="${esc(f.poNumber||'')}" placeholder="Invoice, PO, SOA, or reference #"><small class="field-help">Recommended for reconciliation.</small></label>
      ${paymentTermsField(f,'Related Payment Terms')}
      <div class="full">${fieldSelect('currency','Receipt Currency',CURRENCIES.map(([v,l])=>[v,l]),f.currency)}</div>
    </div>
  </div>`;
}
function paymentAmount(f){return f.paymentForm==='cheque'?Number(f.chequeAmount)||0:Number(f.cashAmount)||0;}
function renderPaymentFields(f){
  const amount=paymentAmount(f),currency=f.currency||'PHP',particulars=String(f.paymentParticulars||'');
  return `<div class="form-section payment-method-section" id="paymentDetails" tabindex="-1"><div class="form-section-title"><div><strong>Payment Details</strong><small>Record the payment instrument and amount exactly as received.</small></div><span class="payment-method-badge">${f.paymentForm==='cheque'?'Cheque':'Cash'}</span></div>
    <div class="payment-method-grid">
      <div class="payment-entry-card"><div class="payment-entry-heading"><div><strong>Form of Payment</strong><small>Changing the method preserves the inactive method's values in this draft.</small></div>${fieldSelect('paymentForm','Payment Method',[['cash','Cash'],['cheque','Cheque']],f.paymentForm)}</div>
        ${f.paymentForm==='cash'?`<label class="field payment-amount-field"><span>Cash Amount (${esc(currency)}) <em class="required-dot">Required</em></span><div class="money-input"><span>${esc(currency)}</span><input name="cashAmount" type="number" min="0" step="0.01" value="${esc(f.cashAmount||0)}" class="${ui.errors.cashAmount?'invalid':''}" ${ui.errors.cashAmount?'aria-invalid="true"':''}></div>${ui.errors.cashAmount?`<small class="field-error" role="alert">${esc(ui.errors.cashAmount)}</small>`:'<small class="field-help">Enter the actual amount received.</small>'}</label>`:`<div class="form-grid payment-cheque-grid"><label class="field full"><span>Bank Name</span><input name="bankName" maxlength="120" value="${esc(f.bankName||'')}" placeholder="Enter issuing bank" class="${ui.errors.bankName?'invalid':''}" ${ui.errors.bankName?'aria-invalid="true"':''}>${ui.errors.bankName?`<small class="field-error" role="alert">${esc(ui.errors.bankName)}</small>`:'<small class="field-help">Recommended for cheque reconciliation.</small>'}</label><label class="field"><span>Cheque Number <em class="required-dot">Required</em></span><input name="chequeNumber" maxlength="80" value="${esc(f.chequeNumber||'')}" placeholder="Enter cheque number" class="${ui.errors.chequeNumber?'invalid':''}" ${ui.errors.chequeNumber?'aria-invalid="true"':''}>${ui.errors.chequeNumber?`<small class="field-error" role="alert">${esc(ui.errors.chequeNumber)}</small>`:''}</label><label class="field payment-amount-field"><span>Cheque Amount (${esc(currency)}) <em class="required-dot">Required</em></span><div class="money-input"><span>${esc(currency)}</span><input name="chequeAmount" type="number" min="0" step="0.01" value="${esc(f.chequeAmount||0)}" class="${ui.errors.chequeAmount?'invalid':''}" ${ui.errors.chequeAmount?'aria-invalid="true"':''}></div>${ui.errors.chequeAmount?`<small class="field-error" role="alert">${esc(ui.errors.chequeAmount)}</small>`:''}</label></div>`}
      </div>
      <aside class="payment-amount-summary" aria-live="polite"><span>Amount to acknowledge</span><strong data-payment-total>${money(amount,currency)}</strong><small>${f.paymentForm==='cheque'?'Subject to cheque clearing.':'Cash is considered received once acknowledged.'}</small><button type="button" class="button small" data-clear-payment-amount ${amount<=0?'disabled':''}>Clear amount</button></aside>
    </div>
    <label class="field payment-particulars-field"><span>Payment Particulars <em class="required-dot">Required on submit</em></span><textarea name="paymentParticulars" maxlength="2000" rows="5" placeholder="Describe the payment purpose, referenced invoice(s), covered period, or other reconciliation details" class="${ui.errors.paymentParticulars?'invalid':''}" ${ui.errors.paymentParticulars?'aria-invalid="true"':''}>${esc(particulars)}</textarea><div class="terms-editor-meta"><small>Include enough detail to reconcile this acknowledgement to the source transaction.</small><small data-payment-particulars-count>${particulars.length.toLocaleString()} / 2,000</small></div>${ui.errors.paymentParticulars?`<small class="field-error" role="alert">${esc(ui.errors.paymentParticulars)}</small>`:''}</label>
  </div>`;
}
function renderPaymentTerms(f){
  const terms=String(f.terms||''),standard=DEFAULT_TERMS.payment,status=!terms.trim()?'Empty':terms===standard?'Standard':'Customized';
  return `<div class="form-section payment-terms-section ${ui.termsExpanded?'is-expanded':''}" data-payment-terms-section><div class="form-section-title"><div><strong>Terms & Conditions</strong><small>Payment validation, clearing, reference, and record-retention terms included in the generated acknowledgement.</small></div><span class="terms-status ${status.toLowerCase()}" data-payment-terms-status>${status}</span></div><div class="terms-toolbar"><div class="terms-toolbar-copy"><strong>Payment Acknowledgement Terms</strong><small>Review before submission; edits autosave with this draft.</small></div><div class="terms-actions"><button type="button" class="button small" data-copy-payment-terms>Copy</button><button type="button" class="button small" data-reset-payment-terms ${terms===standard?'disabled':''}>Restore standard</button><button type="button" class="button small" data-toggle-payment-terms aria-expanded="${ui.termsExpanded}">${ui.termsExpanded?'Collapse':'Expand'}</button></div></div><label class="field terms-editor-field"><span class="sr-only">Payment Acknowledgement Terms & Conditions</span><textarea name="terms" maxlength="10000" rows="${ui.termsExpanded?24:10}" class="${ui.errors.terms?'invalid':''}">${esc(terms)}</textarea><div class="terms-editor-meta"><small>These terms appear on the generated Payment AR.</small><small data-payment-terms-count>${terms.length.toLocaleString()} / 10,000</small></div>${ui.errors.terms?`<small class="field-error" role="alert">${esc(ui.errors.terms)}</small>`:''}</label></div>`;
}
function renderPaymentAcknowledgement(f){
  const receiverValid=!f.receivedBy||PAYMENT_RECEIVERS.includes(f.receivedBy),adminValid=!f.verifiedBy||PAYMENT_ADMINS.includes(f.verifiedBy),ready=Boolean(f.receivedBy&&f.verifiedBy);
  const stateKey=f.receivedAt&&f.verifiedAt?'approved':ready?'ready':'draft';
  return `<div class="form-section payment-ack-section" id="paymentAcknowledgement" tabindex="-1"><div class="form-section-title"><div><strong>Payment Acknowledgement</strong><small>Assign Finance receipt ownership and Admin verification before submission.</small></div><span class="workflow-state ${stateKey}">${f.receivedAt&&f.verifiedAt?'Acknowledgement recorded':ready?'Ready for submission':'Assignments incomplete'}</span></div>
    <div class="approval-created-card"><span class="person-icon">♙</span><div><div class="approval-person-label"><strong>Created By</strong><em>Auto-captured</em></div><span>${esc(f.createdBy||state.currentUser.name)}</span><small>${f.createdAt?esc(fmtDate(f.createdAt,true)):'Timestamp assigned on first save'}</small></div></div>
    <div class="payment-ack-grid"><label class="field"><span>✓ Payment Received By (Finance) <b aria-hidden="true">*</b></span><select name="receivedBy" id="paymentReceivedBy" class="${ui.errors.receivedBy?'invalid':''}" ${ui.errors.receivedBy?'aria-invalid="true"':''}><option value="">Select finance team member...</option>${PAYMENT_RECEIVERS.map(v=>`<option value="${esc(v)}" ${f.receivedBy===v?'selected':''}>${esc(v)}</option>`).join('')}${f.receivedBy&&!receiverValid?`<option selected value="${esc(f.receivedBy)}">${esc(f.receivedBy)} (legacy)</option>`:''}</select><small class="field-help">Finance confirms physical or recorded receipt of payment.${f.receivedAt?` Received ${esc(fmtDate(f.receivedAt,true))}.`:''}</small>${f.receivedBy?`<button type="button" class="button small workflow-capture" data-capture-payment="receivedAt" ${f.receivedBy!==state.currentUser.name?'disabled title="Only the assigned Finance receiver can capture this timestamp"':''}>${f.receivedAt?'Update receipt time':'Mark received now'}</button>`:''}${ui.errors.receivedBy?`<small class="field-error">${esc(ui.errors.receivedBy)}</small>`:''}</label>
      <label class="field"><span>✓ Verified By (Admin) <b aria-hidden="true">*</b></span><select name="verifiedBy" id="paymentVerifiedBy" class="${ui.errors.verifiedBy?'invalid':''}" ${ui.errors.verifiedBy?'aria-invalid="true"':''}><option value="">Select admin...</option>${PAYMENT_ADMINS.map(v=>`<option value="${esc(v)}" ${f.verifiedBy===v?'selected':''}>${esc(v)}</option>`).join('')}${f.verifiedBy&&!adminValid?`<option selected value="${esc(f.verifiedBy)}">${esc(f.verifiedBy)} (legacy)</option>`:''}</select><small class="field-help">Admin verifies the acknowledgement details and supporting payment information.${f.verifiedAt?` Verified ${esc(fmtDate(f.verifiedAt,true))}.`:''}</small>${f.verifiedBy?`<button type="button" class="button small workflow-capture" data-capture-payment="verifiedAt" ${f.verifiedBy!==state.currentUser.name?'disabled title="Only the assigned Admin can capture this timestamp"':''}>${f.verifiedAt?'Update verification time':'Mark verified now'}</button>`:''}${ui.errors.verifiedBy?`<small class="field-error">${esc(ui.errors.verifiedBy)}</small>`:''}</label></div>
    <div class="approval-readiness ${ready?'ready':'draft'}"><div><strong>${ready?'Acknowledgement assignments complete':'Complete acknowledgement assignments'}</strong><span>Drafts may be saved without assignments. Save & Submit requires a valid Finance receiver and Admin verifier.</span></div>${f.receivedBy||f.verifiedBy?'<button type="button" class="button small" data-clear-payment-ack>Clear assignments</button>':''}</div>
  </div>`;
}
function renderItems(f,financial){
  if(f.documentType==='packing') return renderPackingItems(f);
  if(f.documentType==='delivery') return renderDeliveryItems(f);
  const enhanced=['esi','quotation','po'].includes(f.documentType);
  const products=state.products.slice(0,80);
  const suggestions=products.map(p=>`<option value="${esc(p.description)}">${p.unitPrice?esc(money(p.unitPrice,p.currency||f.currency)):''}</option>`).join('');
  if(!enhanced) return `<div class="form-section items-section"><div class="form-section-title row-title"><strong>Items</strong><div class="item-actions"><button type="button" class="button dark" data-add-item>＋ Add Blank</button><button type="button" class="button" data-add-item>▱ Add Note</button></div></div><div class="item-editor">${f.items.map((i,idx)=>`<div class="item-row" data-item-row="${i.id}"><span class="drag">⠿</span><span class="item-index">${idx+1}</span><textarea data-item="description" data-index="${idx}" placeholder="Enter material description...">${esc(i.description)}</textarea><input data-item="quantity" data-index="${idx}" type="number" min="0" step="any" value="${esc(i.quantity)}" aria-label="Quantity">${financial?`<input data-item="unitPrice" data-index="${idx}" type="number" min="0" step="0.01" value="${esc(i.unitPrice)}" aria-label="Unit price"><strong class="num">${money(itemAmount(i),f.currency)}</strong>`:''}<button type="button" class="item-remove" data-remove-item="${idx}" aria-label="Remove item">⌫</button></div>`).join('')}</div></div>`;
  const realCount=f.items.filter(isRealItem).length;
  const context=f.documentType==='quotation'?{label:'Quotation',itemHelp:'Build quotation lines, add scope notes, and verify pricing before submission.',savedHelp:'quotation',aria:'Quotation items'}:f.documentType==='po'?{label:'Purchase Order',itemHelp:'Build purchase-order lines, add purchasing notes, and verify pricing before submission.',savedHelp:'purchase order',aria:'Purchase Order items'}:{label:'Electronic SI',itemHelp:'Build the invoice lines, add internal document notes, and verify pricing before submission.',savedHelp:'invoice',aria:'Electronic SI items'};
  return `<div class="form-section items-section esi-items-section shared-financial-items" id="${f.documentType==='esi'?'esiItems':f.documentType==='quotation'?'quotationItems':'poItems'}" tabindex="-1"><div class="form-section-title row-title"><div><strong>Items</strong><small>${context.itemHelp}</small></div><div class="item-actions">${products.length?`<select class="saved-item-select" data-saved-product aria-label="Choose a previously saved item"><option value="">Saved items…</option>${products.map(p=>`<option value="${esc(p.id)}">${esc(p.description)}${p.unitPrice?` · ${esc(money(p.unitPrice,p.currency||f.currency))}`:''}</option>`).join('')}</select>`:''}<button type="button" class="button sourcing" data-add-saved-item ${products.length?'':'disabled'} title="${products.length?'Add the selected saved item':`Saved items become available after you save a ${context.savedHelp}`}">⌕ <span>Add Saved Item</span></button><button type="button" class="button dark" data-add-blank>＋ <span>Add Item</span></button><button type="button" class="button" data-add-note>▱ <span>Add Note</span></button>${f.items.length>1?`<button type="button" class="button subtle danger-text" data-clear-items>Clear</button>`:''}</div></div>
    ${products.length?`<datalist id="sharedProductOptions">${suggestions}</datalist>`:''}
    <div class="items-guidance"><span>Enter a description, quantity, and unit price for every billable line.</span><small>${products.length?`Descriptions can reuse previously saved ${context.savedHelp} items.`:`Saved-item suggestions will appear after you save ${context.savedHelp} items.`}</small></div>
    <div class="esi-item-head" aria-hidden="true"><span></span><span>#</span><span>Description</span><span>Quantity</span><span>Unit price</span><span>Amount</span><span>Actions</span></div>
    <div class="item-editor esi-item-editor" role="list" aria-label="${context.aria}">${f.items.map((i,idx)=>renderEsiItemRow(f,i,idx,financial)).join('')}</div>
    ${ui.errors.items?`<div class="inline-validation error" role="alert">${esc(ui.errors.items)}</div>`:''}
    <div class="items-footer-note"><span>${realCount?`${realCount} billable line${realCount===1?'':'s'}`:'No billable items yet'}</span><small>Tip: press Ctrl/⌘ + Enter while editing a line to add the next item.</small></div>
  </div>`;
}
function renderPackingItems(f){
  const products=state.products.slice(0,80),realCount=f.items.filter(isRealItem).length;
  return `<div class="form-section items-section packing-items-section" id="packingItems" tabindex="-1"><div class="form-section-title row-title"><div><strong>Packing Items</strong><small>Create shipment lines in packing order. Notes can be inserted without affecting item quantities.</small></div><div class="item-actions">${products.length?`<select class="saved-item-select" data-packing-saved-product aria-label="Choose a previously saved item"><option value="">Saved items…</option>${products.map(p=>`<option value="${esc(p.id)}">${esc(p.description)}</option>`).join('')}</select><button type="button" class="button" data-add-packing-saved>⌕ <span>Add Saved Item</span></button>`:''}<button type="button" class="button dark" data-add-packing-item>＋ <span>Add Item</span></button><button type="button" class="button" data-add-packing-note>▱ <span>Add Note</span></button>${f.items.length>1?`<button type="button" class="button subtle danger-text" data-clear-packing-items>Clear</button>`:''}</div></div>
    <div class="items-guidance packing-guidance"><span>Use one row per packed material and enter the actual packed quantity.</span><small>Rows can be reordered, duplicated, or annotated before submission.</small></div>
    <div class="packing-item-head" aria-hidden="true"><span></span><span>#</span><span>Description</span><span>Quantity</span><span>Actions</span></div>
    <div class="item-editor packing-item-editor" role="list" aria-label="Packing List items">${f.items.map((i,idx)=>renderPackingItemRow(f,i,idx)).join('')}</div>
    ${ui.errors.items?`<div class="inline-validation error" role="alert">${esc(ui.errors.items)}</div>`:''}
    <div class="items-footer-note"><span>${realCount?`${realCount} packed line${realCount===1?'':'s'}`:'No packed items yet'}</span><small>Tip: press Ctrl/⌘ + Enter while editing to add the next packed item.</small></div>
  </div>`;
}
function renderPackingItemRow(f,i,idx){
  const note=!isRealItem(i),rowErrors=ui.errors.itemRows?.[idx]||{};
  if(note)return `<div class="esi-note-row packing-note-row ${rowErrors.description?'has-error':''}" data-item-row="${esc(i.id)}" role="listitem"><span class="note-badge">NOTE</span><textarea data-item="description" data-index="${idx}" maxlength="5000" placeholder="Enter packing or handling note…" aria-label="Packing note">${esc(i.description)}</textarea><span class="item-char-count">${String(i.description||'').length}/5000</span><div class="line-actions"><button type="button" data-move-packing-item="${idx}" data-direction="up" aria-label="Move note up" ${idx===0?'disabled':''}>↑</button><button type="button" data-move-packing-item="${idx}" data-direction="down" aria-label="Move note down" ${idx===f.items.length-1?'disabled':''}>↓</button><button type="button" class="danger" data-remove-packing-item="${idx}" aria-label="Remove note">×</button></div>${rowErrors.description?`<small class="line-error">${esc(rowErrors.description)}</small>`:''}</div>`;
  return `<div class="item-row packing-item-row ${Object.keys(rowErrors).length?'has-error':''}" data-item-row="${esc(i.id)}" role="listitem"><span class="drag" aria-hidden="true">⠿</span><span class="item-index">${idx+1}</span><label class="line-field description-field"><span>Description</span><textarea data-item="description" data-index="${idx}" maxlength="5000" placeholder="Enter material description…" aria-label="Packing item ${idx+1} description" class="${rowErrors.description?'invalid':''}">${esc(i.description)}</textarea><small class="packing-char-count">${String(i.description||'').length}/5000</small>${rowErrors.description?`<small class="line-error">${esc(rowErrors.description)}</small>`:''}</label><label class="line-field quantity-field"><span>Quantity</span><input data-item="quantity" data-index="${idx}" type="number" min="0.000001" max="1000000" step="any" value="${esc(i.quantity)}" inputmode="decimal" aria-label="Packing item ${idx+1} quantity" class="${rowErrors.quantity?'invalid':''}">${rowErrors.quantity?`<small class="line-error">${esc(rowErrors.quantity)}</small>`:''}</label><div class="line-actions"><button type="button" data-move-packing-item="${idx}" data-direction="up" aria-label="Move item ${idx+1} up" ${idx===0?'disabled':''}>↑</button><button type="button" data-move-packing-item="${idx}" data-direction="down" aria-label="Move item ${idx+1} down" ${idx===f.items.length-1?'disabled':''}>↓</button><button type="button" data-duplicate-packing-item="${idx}" aria-label="Duplicate item ${idx+1}">⧉</button><button type="button" class="danger" data-remove-packing-item="${idx}" aria-label="Remove item ${idx+1}">×</button></div></div>`;
}

function renderEsiItemRow(f,i,idx,financial){
  const note=!isRealItem(i); const rowErrors=ui.errors.itemRows?.[idx]||{};
  if(note)return `<div class="esi-note-row ${rowErrors.description?'has-error':''}" data-item-row="${esc(i.id)}" role="listitem"><span class="note-badge">NOTE</span><textarea data-item="description" data-index="${idx}" maxlength="5000" placeholder="Enter a note that should appear with the item list…" aria-label="Invoice note">${esc(i.description)}</textarea><span class="item-char-count">${String(i.description||'').length}/5000</span><div class="line-actions"><button type="button" data-move-item="${idx}" data-direction="up" aria-label="Move note up" ${idx===0?'disabled':''}>↑</button><button type="button" data-move-item="${idx}" data-direction="down" aria-label="Move note down" ${idx===f.items.length-1?'disabled':''}>↓</button><button type="button" class="danger" data-remove-item="${idx}" aria-label="Remove note">×</button></div>${rowErrors.description?`<small class="line-error">${esc(rowErrors.description)}</small>`:''}</div>`;
  return `<div class="item-row esi-item-row ${Object.keys(rowErrors).length?'has-error':''}" data-item-row="${esc(i.id)}" role="listitem"><span class="drag" aria-hidden="true">⠿</span><span class="item-index">${idx+1}</span><label class="line-field description-field"><span>Description</span><textarea data-item="description" data-index="${idx}" maxlength="5000" placeholder="Enter material description…" aria-label="Item ${idx+1} description" class="${rowErrors.description?'invalid':''}">${esc(i.description)}</textarea>${rowErrors.description?`<small class="line-error">${esc(rowErrors.description)}</small>`:''}</label><label class="line-field"><span>Quantity</span><input data-item="quantity" data-index="${idx}" type="number" min="0.000001" max="1000000" step="any" value="${esc(i.quantity)}" inputmode="decimal" aria-label="Item ${idx+1} quantity" class="${rowErrors.quantity?'invalid':''}">${rowErrors.quantity?`<small class="line-error">${esc(rowErrors.quantity)}</small>`:''}</label>${financial?`<label class="line-field"><span>Unit price</span><input data-item="unitPrice" data-index="${idx}" type="number" min="0.01" max="1000000000" step="0.01" value="${esc(i.unitPrice)}" inputmode="decimal" aria-label="Item ${idx+1} unit price" class="${rowErrors.unitPrice?'invalid':''}">${rowErrors.unitPrice?`<small class="line-error">${esc(rowErrors.unitPrice)}</small>`:''}</label><strong class="num" data-line-amount="${idx}">${money(itemAmount(i),f.currency)}</strong>`:''}<div class="line-actions"><button type="button" data-move-item="${idx}" data-direction="up" aria-label="Move item ${idx+1} up" ${idx===0?'disabled':''}>↑</button><button type="button" data-move-item="${idx}" data-direction="down" aria-label="Move item ${idx+1} down" ${idx===f.items.length-1?'disabled':''}>↓</button><button type="button" data-duplicate-item="${idx}" aria-label="Duplicate item ${idx+1}">⧉</button><button type="button" class="danger" data-remove-item="${idx}" aria-label="Remove item ${idx+1}">×</button></div></div>`;
}
function renderVatSelector(f){
  // v1.12: a single canonical select owns VAT state. The previous custom
  // listbox + hidden input duplicated state and depended on listener rebinding.
  const raw=String(f.vatType||'zero');
  const validRaw=Boolean(VAT_ALIASES[raw]);
  const current=validRaw ? raw : 'zero';
  const legacyOption=raw==='vat-inclusive'||raw==='vat-exclusive' ? `<option value="${esc(raw)}" selected>${esc(vatLabel(raw))} · Legacy record</option>` : '';
  return `<div class="vat-select-wrap"><select id="esiVatClassification" name="vatType" class="vat-native-select ${ui.errors.vatType?'invalid':''}" aria-label="VAT Classification" aria-describedby="financialVatDescription" ${ui.errors.vatType?'aria-invalid="true"':''}>${legacyOption}${VAT_OPTIONS.map(([value,label])=>`<option value="${esc(value)}" ${!legacyOption&&value===normalizeVatType(current)?'selected':''}>${esc(label)}</option>`).join('')}</select><span class="vat-select-chevron" aria-hidden="true">⌄</span><small class="vat-live sr-only" aria-live="polite" data-vat-live></small>${ui.errors.vatType?`<small class="field-error" role="alert">${esc(ui.errors.vatType)}</small>`:''}</div>`;
}

function renderFinancialFields(f,c){
  const sharedFinancial=['esi','quotation','po'].includes(f.documentType);
  const vatControl=sharedFinancial?renderVatSelector(f):fieldSelect('vatType','',VAT_OPTIONS,f.vatType);
  if(!sharedFinancial)return`<div class="form-section totals-section"><div class="totals-panel"><div class="total-line"><span>Subtotal:</span><strong data-financial="subtotal">${money(c.subtotal,f.currency)}</strong></div><div class="discount-box"><div><strong>Discount:</strong>${fieldSelect('discountType','',[['percentage','Percentage (%)'],['fixed','Fixed amount']],f.discountType)}</div><div class="discount-value"><label class="field compact"><span class="sr-only">Discount value</span><input name="discountValue" type="number" min="0" ${f.discountType==='percentage'?'max="100" step="0.01"':'step="0.01"'} value="${esc(f.discountValue)}" class="${ui.errors.discountValue?'invalid':''}"></label><strong data-financial="discount">− ${money(c.discount,f.currency)}</strong></div>${ui.errors.discountValue?`<small class="field-error" role="alert">${esc(ui.errors.discountValue)}</small>`:''}</div><div class="total-line strong"><span>Subtotal After Discount:</span><strong data-financial="after">${money(Math.max(0,c.subtotal-c.discount),f.currency)}</strong></div><div class="total-line vat-line"><span>VAT:</span>${vatControl}<strong data-financial="vat">${money(c.vat,f.currency)}</strong></div><small class="vat-help">VAT is calculated from the subtotal after discount.</small><div class="total-line grand"><span>TOTAL:</span><strong data-financial="total">${money(c.total,f.currency)}</strong></div></div></div>`;
  const rate=vatRate(f.vatType); const after=Math.max(0,c.subtotal-c.discount); const hasDiscount=c.discount>0; const nonPhp=f.documentType==='esi'&&f.currency!=='PHP'&&Number(f.exchangeRate)>0; const phpTotal=nonPhp?c.total*Number(f.exchangeRate):0;
  const financialContext=f.documentType==='quotation'?{kicker:'QUOTATION ADJUSTMENTS',title:'Quotation Total',noun:'Quotation'}:f.documentType==='po'?{kicker:'PURCHASE ORDER ADJUSTMENTS',title:'Purchase Order Total',noun:'Purchase Order'}:{kicker:'INVOICE ADJUSTMENTS',title:'Electronic SI Total',noun:'Electronic SI'};
  const financialId=f.documentType==='esi'?'esiFinancial':f.documentType==='quotation'?'quotationFinancial':'poFinancial';
  return`<div class="form-section totals-section esi-financial-section shared-financial-section" id="${financialId}" tabindex="-1"><div class="financial-workspace">
    <section class="adjustment-panel" aria-labelledby="sharedAdjustmentsTitle"><div class="financial-panel-head"><div><span class="financial-kicker">${financialContext.kicker}</span><h3 id="sharedAdjustmentsTitle">Discount & VAT</h3><small>Adjustments recalculate instantly and are preserved with this ${financialContext.noun}.</small></div><button type="button" class="button small ghost" data-reset-adjustments ${hasDiscount||normalizeVatType(f.vatType)!=='zero'||String(f.discountReason||'').trim()?'':'disabled'}>Reset adjustments</button></div>
      <div class="adjustment-grid"><label class="field"><span>Discount Method</span><select name="discountType"><option value="percentage" ${f.discountType==='percentage'?'selected':''}>Percentage (%)</option><option value="fixed" ${f.discountType==='fixed'?'selected':''}>Fixed amount</option></select><small class="field-help">Applied before VAT.</small></label><label class="field"><span>${f.discountType==='fixed'?'Discount Amount':'Discount Percentage'}</span><div class="financial-input-affix">${f.discountType==='fixed'?`<span>${esc(f.currency)}</span>`:''}<input name="discountValue" type="number" inputmode="decimal" min="0" ${f.discountType==='percentage'?'max="100" step="0.01"':'step="0.01"'} value="${esc(f.discountValue)}" class="${ui.errors.discountValue?'invalid':''}" aria-describedby="discountHelp discountError" ${ui.errors.discountValue?'aria-invalid="true"':''}>${f.discountType==='percentage'?'<span>%</span>':''}</div><small id="discountHelp" class="field-help">${f.discountType==='percentage'?'Enter 0–100%.':'Cannot exceed the current subtotal.'}</small><small id="discountError" class="field-error live-field-error" role="alert" ${ui.errors.discountValue?'':'hidden'}>${esc(ui.errors.discountValue||'')}</small></label><label class="field full"><span>Discount / Adjustment Note <em class="optional-label">Optional</em></span><input name="discountReason" type="text" maxlength="160" value="${esc(f.discountReason||'')}" placeholder="e.g., Contract discount, promotional adjustment"><small class="field-help">Context retained with this document and shown in document preview when provided.</small></label></div>
      <div class="vat-control-card"><div><strong>VAT Classification</strong><small id="financialVatDescription" data-vat-description>${rate?`${Math.round(rate*100)}% VAT is calculated after discount.`:'This selection calculates 0% VAT while preserving its tax classification.'}</small></div>${vatControl}</div>
      <div class="calculation-order" aria-label="Calculation order"><span>1. Items subtotal</span><span>→</span><span>2. Discount</span><span>→</span><span>3. VAT</span><span>→</span><span>4. Final total</span></div>
    </section>
    <aside class="totals-panel esi-summary-panel" aria-labelledby="esiAmountSummaryTitle"><div class="financial-panel-head compact"><div><span class="financial-kicker">AMOUNT SUMMARY</span><h3 id="esiAmountSummaryTitle">${financialContext.title}</h3></div><span class="currency-badge" data-financial-currency>${esc(f.currency)}</span></div><div class="total-line"><span>Subtotal</span><strong data-financial="subtotal">${money(c.subtotal,f.currency)}</strong></div><div class="total-line discount-summary ${hasDiscount?'is-active':''}"><span data-financial-discount-label>Discount${hasDiscount&&f.discountType==='percentage'?` (${Number(f.discountValue)||0}%)`:''}</span><strong data-financial="discount">− ${money(c.discount,f.currency)}</strong></div><div class="total-line strong"><span>Taxable amount</span><strong data-financial="after">${money(after,f.currency)}</strong></div><div class="total-line"><span data-financial-vat-label>${esc(vatLabel(f.vatType))}</span><strong data-financial="vat">${money(c.vat,f.currency)}</strong></div><div class="summary-divider"></div><div class="total-line grand"><span>TOTAL</span><strong data-financial="total">${money(c.total,f.currency)}</strong></div>${nonPhp?`<div class="php-equivalent"><span>Approx. PHP equivalent</span><strong data-financial="phpEquivalent">${money(phpTotal,'PHP')}</strong><small>Using 1 ${esc(f.currency)} = ${esc(f.exchangeRate)} PHP</small></div>`:''}<div class="calculation-status" aria-live="polite" data-financial-status><span class="status-dot"></span><span>Totals are up to date</span></div></aside>
  </div></div>`;
}

function documentMatchesRange(d){
  if(ui.documentRange==='all')return true;
  const raw=d.date||d.updatedAt||d.createdAt; if(!raw)return false;
  const value=new Date(raw); if(Number.isNaN(value.getTime()))return false;
  const now=new Date(); const start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(ui.documentRange==='today')return value>=start;
  const days=Number(ui.documentRange)||0; if(!days)return true;
  const threshold=new Date(start);threshold.setDate(threshold.getDate()-(days-1));return value>=threshold;
}
function documentSearchText(d){
  return [d.documentNumber,createTypeLabel(d.documentType),d.customerName,d.customerAddress,d.customerContact,d.customerEmail,d.customerPhone,d.customerTin,d.referenceNumber,d.poNumber,resolvedPaymentTerms(d),resolvedValidity(d),resolvedDeliveryCommitment(d),d.status,d.quoteStatus,d.createdBy,documentVendor(d)?.name,d.currency,d.remarks,d.paymentParticulars,...(d.items||[]).map(i=>i.description),...(state.comments[d.id]||[]).map(c=>c.text)].filter(Boolean).join(' ').toLowerCase();
}
function sortDocuments(rows){
  const collator=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'}); const copy=[...rows];
  copy.sort((a,b)=>{
    if(ui.documentSort==='date-desc')return new Date(b.date||0)-new Date(a.date||0);
    if(ui.documentSort==='date-asc')return new Date(a.date||0)-new Date(b.date||0);
    if(ui.documentSort==='number-asc')return collator.compare(a.documentNumber||'',b.documentNumber||'');
    if(ui.documentSort==='party-asc')return collator.compare(a.customerName||'',b.customerName||'');
    if(ui.documentSort==='status-asc')return collator.compare(a.status||'',b.status||'');
    return new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0);
  }); return copy;
}
function filteredDocs(){ const term=String(ui.search||'').trim().toLowerCase(); return sortDocuments(state.documents.filter(d=>(ui.type==='all'||d.documentType===ui.type)&&(ui.status==='all'||d.status===ui.status)&&(ui.quoteStatus==='all'||(d.documentType==='quotation'&&documentQuoteStatus(d)===ui.quoteStatus))&&(ui.companyFilter==='all'||documentVendor(d)?.id===ui.companyFilter)&&documentMatchesRange(d)&&(!term||documentSearchText(d).includes(term)))); }
function selectedDocuments(){ const set=new Set(ui.selectedDocumentIds||[]); return state.documents.filter(d=>set.has(d.id)); }
function persistDocumentView(){ globalThis.WMModuleStore.setItem(UI_KEY,JSON.stringify({...ui,form:undefined,errors:{},modal:null,companyPanelOpen:false})); }
function clearDocumentFilters(){ ui.search='';ui.type='all';ui.status='all';ui.quoteStatus='all';ui.companyFilter='all';ui.documentRange='all';ui.documentSort='updated-desc';ui.page=1;persistDocumentView();render(); }
function exportSelectedDocuments(){ const docs=selectedDocuments(); if(!docs.length)return toast('Select at least one document to export','error'); const payload={schema:'TradeLinkDocumentExport',version:APP_VERSION,exportedAt:nowISO(),documents:docs,comments:Object.fromEntries(docs.map(d=>[d.id,state.comments[d.id]||[]]))}; const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`TradeLink-selected-documents-${todayISO()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);addAudit('export','Selected documents exported',`${docs.length} documents`,null,false);persist('selected document export',false);toast(`${docs.length} document${docs.length===1?'':'s'} exported`); }
function copySelectedDocumentNumbers(){ const docs=selectedDocuments();if(!docs.length)return toast('Select at least one document','error');const text=docs.map(d=>d.documentNumber).join('\n');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>toast('Document numbers copied')).catch(()=>fallbackCopy(text));else fallbackCopy(text); }
function deleteSelectedDocuments(){ const docs=selectedDocuments(); if(!docs.length)return toast('Select at least one document to delete','error'); if(!confirm(`Delete ${docs.length} selected document${docs.length===1?'':'s'}? A recovery snapshot will be created automatically first.`))return; snapshot(`Before bulk delete · ${docs.length} documents`); const ids=new Set(docs.map(d=>d.id)); state.documents=state.documents.filter(d=>!ids.has(d.id)); docs.forEach(d=>delete state.comments[d.id]); addAudit('delete','Bulk documents deleted',docs.map(d=>d.documentNumber).join(', '),null,false); ui.selectedDocumentIds=[];persist('bulk delete',false);render();toast(`${docs.length} document${docs.length===1?'':'s'} deleted`); }
function documentAmount(d){ return TYPES[d.documentType]?.financial||d.documentType==='payment'||(d.documentType==='delivery'&&d.drIncludePricing)?Number(d.total)||0:null; }
function documentRevision(d){ return String(d.referenceNumber||'0').trim()||'0'; }
function documentQuoteStatus(d){ return d.documentType==='quotation'?(QUOTE_STATUS_OPTIONS.includes(d.quoteStatus)?d.quoteStatus:'Working on it'):'—'; }
function quoteStatusClass(value){ return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''); }
function documentCompanyTag(d){ const v=documentVendor(d); return `<div class="document-company-cell"><strong>${esc(v?.name||'—')}</strong><span class="company-pill company-${esc(v?.id||'unknown')}">${esc(vendorShortName(v))}</span></div>`; }
function updateQuoteStatus(id,value){ const d=state.documents.find(x=>x.id===id); if(!d||d.documentType!=='quotation')return; if(!QUOTE_STATUS_OPTIONS.includes(value))return toast('Unsupported Quote Status','error'); if((d.quoteStatus||'Working on it')===value)return; const previous=d.quoteStatus||'Working on it'; d.quoteStatus=value; d.updatedAt=nowISO(); addAudit('workflow','Quote status changed',`${d.documentNumber} · ${previous} → ${value}`,d.id,false); persist('quote status changed',false); render(); toast(`Quote Status: ${value}`); }
let documentActionMenuCleanup=null;
function closeDocumentActionMenu(options={}){
  const menu=document.querySelector('#documentActionMenu');
  const returnFocus=options.returnFocus!==false;
  const triggerId=menu?.dataset.triggerId||'';
  const trigger=triggerId?document.getElementById(triggerId):null;
  if(documentActionMenuCleanup){
    try{documentActionMenuCleanup();}catch(error){console.warn('Action menu cleanup failed',error);}
    documentActionMenuCleanup=null;
  }
  if(trigger){
    trigger.setAttribute('aria-expanded','false');
    trigger.removeAttribute('aria-controls');
  }
  menu?.remove();
  if(returnFocus&&trigger&&document.contains(trigger))requestAnimationFrame(()=>stableFocus(trigger));
}
function exportDocumentExcel(id){
  const d=state.documents.find(x=>x.id===id); if(!d)return toast('Document no longer exists.','error'); const c=calc(d),v=documentVendor(d); const amount=documentAmount(d);
  const rows=(d.items||[]).map((i,idx)=>`<tr><td>${idx+1}</td><td>${esc(i.description||'')}</td><td>${isRealItem(i)?esc(i.quantity||0):''}</td><td>${isRealItem(i)&&TYPES[d.documentType]?.financial?esc(i.unitPrice||0):''}</td><td>${isRealItem(i)&&TYPES[d.documentType]?.financial?esc(itemAmount(i)):''}</td></tr>`).join('');
  const html=`<html><head><meta charset="utf-8"></head><body><table border="1"><tr><th colspan="5">${esc(d.documentNumber)} - ${esc(d.customerName||'')}</th></tr><tr><td>Document Type</td><td colspan="4">${esc(createTypeLabel(d.documentType))}</td></tr><tr><td>Date</td><td colspan="4">${esc(d.date||'')}</td></tr><tr><td>Workflow Status</td><td colspan="4">${esc(d.status||'')}</td></tr><tr><td>Quote Status</td><td colspan="4">${esc(documentQuoteStatus(d))}</td></tr><tr><td>Creator</td><td colspan="4">${esc(d.createdBy||'')}</td></tr><tr><td>Active Company</td><td colspan="4">${esc(v?.name||'')}</td></tr><tr><td>Revision No.</td><td colspan="4">${esc(documentRevision(d))}</td></tr><tr><th>#</th><th>Material Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>${rows}${amount!==null?`<tr><td colspan="4">Subtotal</td><td>${esc(c.subtotal)}</td></tr><tr><td colspan="4">VAT</td><td>${esc(c.vat)}</td></tr><tr><td colspan="4"><b>TOTAL</b></td><td><b>${esc(c.total)}</b></td></tr>`:''}</table></body></html>`;
  try{
    const blob=new Blob(['\ufeff',html],{type:'application/vnd.ms-excel;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url;a.download=`${String(d.documentNumber||'TradeLink-document').replace(/[^a-z0-9_-]+/gi,'-')}.xls`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);addAudit('export','Document exported to Excel',d.documentNumber,d.id,false);persist('excel export',false);toast('Excel export created'); return true;
  }catch(error){toast(`Excel export failed: ${error.message}`,'error');return false;}
}
function openDocumentComments(id){ const d=state.documents.find(x=>x.id===id); if(!d)return toast('Document no longer exists.','error'); closeDocumentActionMenu({returnFocus:false}); renderModal('preview',id); requestAnimationFrame(()=>stableFocus(document.querySelector('#commentForm textarea'))); }
function renderDocumentHistory(id){
  const d=state.documents.find(x=>x.id===id);if(!d)return toast('Document no longer exists.','error'); const events=state.audit.filter(a=>a.documentId===id); const host=document.querySelector('#modalHost'); if(!host)return toast('Unable to open Change History.','error'); ui.modal={type:'history',id};
  host.innerHTML=`<div class="modal-backdrop" data-close-modal><div class="modal document-history-modal" role="dialog" aria-modal="true" aria-labelledby="historyTitle" onclick="event.stopPropagation()"><button class="modal-close" data-close-modal aria-label="Close">×</button><div class="section-head"><div><p class="eyebrow">CHANGE HISTORY</p><h3 id="historyTitle">${esc(d.documentNumber)} · ${esc(d.customerName||createTypeLabel(d.documentType))}</h3><p class="section-description">Recorded document changes, workflow transitions, comments, and exports.</p></div><span>${events.length} event${events.length===1?'':'s'}</span></div>${events.length?renderActivityList(events,{actions:false}):'<div class="empty-state"><strong>No recorded changes yet</strong><span>Future edits and workflow actions will appear here.</span></div>'}<div class="modal-actions"><button type="button" class="button" data-close-modal>Close</button></div></div></div>`;
  host.querySelectorAll('[data-close-modal]').forEach(el=>el.addEventListener('click',closeModal)); host.querySelectorAll('[data-preview]').forEach(el=>el.addEventListener('click',()=>renderModal('preview',el.dataset.preview))); requestAnimationFrame(()=>stableFocus(host.querySelector('.modal-close')));
}
function prepareDuplicateDocument(id){
  const src=state.documents.find(x=>x.id===id); if(!src)return toast('Document no longer exists.','error');
  const copy=deepCopy(src);
  Object.assign(copy,{id:null,documentNumber:'',status:'Draft',quoteStatus:copy.documentType==='quotation'?'Working on it':copy.quoteStatus,createdAt:null,updatedAt:null,verifiedAt:'',approvedAt:'',checkedAt:'',deliveredAt:'',receivedAt:''});
  ui.form=normalizeForm(copy);ui.editingId=null;ui.errors={};ui.tab='create';syncRoute('create');autosaveDraft();render();toast(`${src.documentNumber} duplicated as a new draft`);
}
function dispatchDocumentAction(action,id){
  const d=state.documents.find(x=>x.id===id); if(!d){closeDocumentActionMenu({returnFocus:false});toast('This document is no longer available. Refresh the register and try again.','error');return false;}
  closeDocumentActionMenu({returnFocus:false});
  try{
    switch(action){
      case 'preview': renderModal('preview',id); break;
      case 'edit':
        if(d.status==='Approved'&&!confirm(`${d.documentNumber} is Approved. Continue editing this document? Changes will be recorded in Change History.`))return false;
        editDoc(id); break;
      case 'comment': openDocumentComments(id); break;
      case 'print': generateDocumentPdf(id); break;
      case 'excel': exportDocumentExcel(id); break;
      case 'duplicate': prepareDuplicateDocument(id); break;
      case 'history': renderDocumentHistory(id); break;
      case 'delete': deleteDoc(id); break;
      default: toast('Unsupported document action.','error'); return false;
    }
    return true;
  }catch(error){console.error('Document action failed',action,id,error);toast(`${actionLabel(action)} failed: ${error.message||'Unexpected error'}`,'error');return false;}
}
function actionLabel(action){return ({preview:'Preview',edit:'Edit',comment:'Comment',print:'Print PDF',excel:'Export to Excel',duplicate:'Duplicate',history:'Change History',delete:'Delete'})[action]||'Action';}
function positionDocumentActionMenu(menu,anchor){
  if(!menu||!anchor)return; const r=anchor.getBoundingClientRect(); const margin=12,gap=8; const mw=Math.min(menu.offsetWidth||300,window.innerWidth-margin*2); const mh=Math.min(menu.offsetHeight||460,window.innerHeight-margin*2);
  let left=Math.min(window.innerWidth-mw-margin,Math.max(margin,r.right-mw)); let top=r.bottom+gap; if(top+mh>window.innerHeight-margin)top=Math.max(margin,r.top-mh-gap); Object.assign(menu.style,{left:`${Math.round(left)}px`,top:`${Math.round(top)}px`,maxHeight:`${Math.floor(window.innerHeight-margin*2)}px`});
}
function openDocumentActionMenu(id,anchor,options={}){
  closeDocumentActionMenu({returnFocus:false});
  const d=state.documents.find(x=>x.id===id);
  if(!d||!anchor||!document.contains(anchor))return toast('Unable to open document actions.','error');
  if(!anchor.id)anchor.id=`doc-action-trigger-${id}`;
  const menu=document.createElement('div');
  menu.id='documentActionMenu';
  menu.className='document-action-menu';
  menu.setAttribute('role','menu');
  menu.setAttribute('aria-label',`Actions for ${d.documentNumber}`);
  menu.setAttribute('tabindex','-1');
  menu.dataset.documentId=id;
  menu.dataset.triggerId=anchor.id;
  // Text-only source markup is intentional: css3-buttons.js owns icon presentation.
  // This prevents legacy glyphs from leaking into accessible labels after enhancement.
  menu.innerHTML=`<button type="button" role="menuitem" data-document-action="preview">Preview</button><button type="button" role="menuitem" data-document-action="edit">${d.status==='Approved'?'Edit/Approved':'Edit'}</button><button type="button" role="menuitem" data-document-action="comment">Comment</button><button type="button" role="menuitem" data-document-action="print">Print PDF</button><button type="button" role="menuitem" data-document-action="excel">Export to Excel</button><button type="button" role="menuitem" data-document-action="duplicate">Duplicate</button><button type="button" role="menuitem" data-document-action="history">Change History</button><button type="button" role="menuitem" class="danger" data-document-action="delete">Delete</button>`;
  document.body.appendChild(menu);
  positionDocumentActionMenu(menu,anchor);
  anchor.setAttribute('aria-expanded','true');
  anchor.setAttribute('aria-controls',menu.id);

  const items=[...menu.querySelectorAll('[role="menuitem"]')];
  const invoke=button=>{
    if(!button||button.disabled||button.getAttribute('aria-disabled')==='true')return;
    const action=button.dataset.documentAction;
    if(!action)return;
    button.disabled=true;
    button.setAttribute('aria-busy','true');
    const ok=dispatchDocumentAction(action,id);
    if(ok===false&&document.contains(button)){button.disabled=false;button.removeAttribute('aria-busy');}
  };
  menu.addEventListener('pointerdown',event=>event.stopPropagation());
  menu.addEventListener('click',event=>{
    const button=event.target.closest('[data-document-action]');
    if(!button||!menu.contains(button))return;
    event.preventDefault();
    event.stopPropagation();
    invoke(button);
  });
  menu.addEventListener('keydown',event=>{
    const index=items.indexOf(document.activeElement);
    let next=index<0?0:index;
    if(event.key==='Escape'){event.preventDefault();closeDocumentActionMenu();return;}
    if(event.key==='ArrowDown')next=(next+1)%items.length;
    else if(event.key==='ArrowUp')next=(next-1+items.length)%items.length;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=items.length-1;
    else if((event.key==='Enter'||event.key===' ')&&document.activeElement?.matches?.('[data-document-action]')){event.preventDefault();invoke(document.activeElement);return;}
    else return;
    event.preventDefault();
    stableFocus(items[next]);
  });

  const dismiss=event=>{
    if(menu.contains(event.target)||anchor.contains(event.target))return;
    closeDocumentActionMenu({returnFocus:false});
  };
  const closeOnResize=()=>closeDocumentActionMenu({returnFocus:false});
  const tableWrap=document.querySelector('.documents-table-wrap');
  const closeOnTableScroll=()=>closeDocumentActionMenu({returnFocus:false});
  document.addEventListener('pointerdown',dismiss,true);
  window.addEventListener('resize',closeOnResize);
  tableWrap?.addEventListener('scroll',closeOnTableScroll,{passive:true});
  documentActionMenuCleanup=()=>{
    document.removeEventListener('pointerdown',dismiss,true);
    window.removeEventListener('resize',closeOnResize);
    tableWrap?.removeEventListener('scroll',closeOnTableScroll);
  };

  // Pointer-opened menus keep focus on the trigger to avoid an unintended selected/fill visual state.
  // Keyboard-opened menus move focus to the first item, following menu accessibility conventions.
  if(options.focusFirst)requestAnimationFrame(()=>stableFocus(items[0]));
}
function approvalQueueActions(d){
  const needsReview=!!d.verifiedBy&&!d.verifiedAt;
  const needsApproval=!!d.approvedBy&&!d.approvedAt;
  const reviewLabel=d.documentType==='esi'?'Verify':'Mark reviewed';
  const reviewAllowed=needsReview&&canCurrentUserActAs(d.verifiedBy);
  const approveAllowed=needsApproval&&!needsReview&&canCurrentUserActAs(d.approvedBy);
  return `<button class="button" data-preview="${d.id}">Review document</button>${needsReview?`<button class="button" data-approval-step-id="${d.id}" data-approval-step="verifiedAt" ${reviewAllowed?'':`disabled title="Only ${esc(d.verifiedBy)} can complete this step"`}>Use Time Now · ${reviewLabel}</button>`:''}${needsApproval&&!needsReview?`<button class="button primary" data-approval-step-id="${d.id}" data-approval-step="approvedAt" ${approveAllowed?'':`disabled title="Only ${esc(d.approvedBy)} can complete final approval"`}>Use Time Now · Approve</button>`:''}<button class="button danger" data-status-id="${d.id}" data-status="Rejected">Reject</button>`;
}
function renderDocuments(){
  const rows=filteredDocs(); const ps=Number(state.settings.pageSize)||20; const pages=Math.max(1,Math.ceil(rows.length/ps)); ui.page=clamp(ui.page,1,pages); const shown=rows.slice((ui.page-1)*ps,ui.page*ps); const pending=state.documents.filter(d=>TYPES[d.documentType]?.approval&&['For Approval','Submitted','Under Review'].includes(d.status)).sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0));
  const visibleIds=new Set(rows.map(d=>d.id)); ui.selectedDocumentIds=(ui.selectedDocumentIds||[]).filter(id=>visibleIds.has(id)); const selectedCount=ui.selectedDocumentIds.length; const pageIds=shown.map(d=>d.id); const pageAll=pageIds.length&&pageIds.every(id=>ui.selectedDocumentIds.includes(id));
  const filterCount=[ui.search,ui.type!=='all',ui.status!=='all',ui.quoteStatus!=='all',ui.companyFilter!=='all',ui.documentRange!=='all',ui.documentSort!=='updated-desc'].filter(Boolean).length;
  return `<section class="view documents-view">${hero('ALL DOCUMENTS','Every record,','one operational ledger.','Find, inspect, manage, approve, export, or recover commercial records without leaving the document workspace.',`${rows.length} matching`)}
  ${pending.length?`<section class="card section-card approval-queue-inline ${ui.approvalQueueOpen?'':'is-collapsed'}"><div class="section-head"><div><p class="eyebrow">NEEDS APPROVAL</p><h3>Decision queue</h3><p class="section-description">Review submitted approval-controlled documents without changing your register filters.</p></div><div class="documents-head-actions"><span>${pending.length} pending</span><button type="button" class="button small" data-toggle-approval-queue aria-expanded="${ui.approvalQueueOpen}">${ui.approvalQueueOpen?'Hide queue':'Show queue'}</button></div></div>${ui.approvalQueueOpen?`<div class="approval-list">${pending.map(d=>`<article class="approval-card"><div><p class="eyebrow">${esc(createTypeLabel(d.documentType))}</p><h3>${esc(d.documentNumber)} · ${esc(d.customerName||'Unspecified party')}</h3><div class="approval-meta"><span>${fmtDate(d.date)}</span><span>•</span><span>${TYPES[d.documentType]?.financial?money(d.total||0,d.currency||'PHP'):'No financial total'}</span><span>•</span><span>${esc(d.status)}</span></div></div><div class="actions">${approvalQueueActions(d)}</div></article>`).join('')}</div>`:''}</section>`:''}
  <div class="documents-commandbar" aria-label="Document workspace actions"><div class="documents-command-copy"><strong>Document workspace</strong><span>Search, organize, back up, and manage the complete commercial register.</span></div><div class="documents-command-actions"><div class="toolbar-group documents-utility-actions"><button class="button" data-export>Export backup</button><label class="button file-button">Import backup<input id="importFile" type="file" accept="application/json,.json"></label><button class="button" data-snapshot>Snapshot</button></div><button class="button primary create-document-cta" data-tab="create"><span aria-hidden="true">＋</span> Create Document</button></div></div>
  <section class="card documents-filter-panel" aria-label="Document filters"><div class="documents-filter-head"><div><strong>Find documents</strong><small>${filterCount?`${filterCount} active filter${filterCount===1?'':'s'}`:'Showing the complete register'}</small></div><button type="button" class="button small" data-clear-document-filters ${filterCount?'':'disabled'}>Clear filters</button></div><div class="document-filter-grid">${fieldInput('filterSearch','Search','search',ui.search,null,'Number, party, reference, item, note, comment')}${fieldSelect('filterType','Document type',[['all','All types'],...Object.entries(TYPES).map(([v,t])=>[v,createTypeLabel(v)])],ui.type)}${fieldSelect('filterStatus','Workflow status',[['all','All workflow statuses'],...STATUS_FLOW.map(v=>[v,v])],ui.status)}${fieldSelect('filterQuoteStatus','Quote status',[['all','All quote statuses'],...QUOTE_STATUS_OPTIONS.map(v=>[v,v])],ui.quoteStatus)}${fieldSelect('filterCompany','Active company',[['all','All companies'],...state.vendors.map(v=>[v.id,v.name])],ui.companyFilter)}${fieldSelect('filterRange','Document date',[['all','All dates'],['today','Today'],['7','Last 7 days'],['30','Last 30 days'],['90','Last 90 days']],ui.documentRange)}${fieldSelect('filterSort','Sort by',[['updated-desc','Recently updated'],['date-desc','Document date · newest'],['date-asc','Document date · oldest'],['number-asc','Document number'],['party-asc','Party name'],['status-asc','Status']],ui.documentSort)}${fieldSelect('filterPageSize','Rows per page',[['20','20 rows'],['50','50 rows'],['100','100 rows']],String(ps))}</div></section>
  ${selectedCount?`<div class="bulk-actionbar" role="region" aria-label="Selected document actions"><div><strong>${selectedCount} selected</strong><span>${selectedCount===1?'Open or edit the selected record, or use a document action below.':'Actions apply only to the selected records.'}</span></div><div class="toolbar-group">${selectedCount===1?`<button class="button small" data-open-selected>Open</button><button class="button small" data-edit-selected>Edit</button>`:''}<button class="button small" data-copy-selected>Copy numbers</button><button class="button small" data-export-selected>Export selected</button><button class="button small" data-clear-selection>Clear selection</button><button class="button small danger" data-delete-selected>Delete selected</button></div></div>`:''}
  <div class="table-wrap documents-table-wrap"><table class="data-table documents-table document-ledger-table"><thead><tr><th class="selection-cell"><input type="checkbox" data-select-page aria-label="Select all documents on this page" ${pageAll?'checked':''}></th><th class="row-number-col">No.</th><th class="document-main-col">Document</th><th>Date</th><th>Workflow Status</th><th>Quote Status</th><th class="amount-col">Amount</th><th>Creator</th><th>Rev. No.</th><th class="company-col">Active Company</th><th class="actions-col">Actions</th></tr></thead><tbody>${shown.length?shown.map((d,rowIndex)=>{const amount=documentAmount(d),quoteStatus=documentQuoteStatus(d),number=(ui.page-1)*ps+rowIndex+1;return `<tr class="${ui.selectedDocumentIds.includes(d.id)?'is-selected':''}"><td class="selection-cell"><input type="checkbox" data-select-document="${d.id}" aria-label="Select ${esc(d.documentNumber)}" ${ui.selectedDocumentIds.includes(d.id)?'checked':''}></td><td class="row-number-col"><span class="row-number-badge">${number}</span></td><td class="document-main-col"><button class="document-link ledger-document-link" data-preview="${d.id}" title="Preview ${esc(d.documentNumber)}"><span class="doc-number">${esc(d.documentNumber)}${d.customerName?` - ${esc(d.customerName)}`:''}</span><span class="doc-sub">${esc(createTypeLabel(d.documentType))}${d.poNumber||d.referenceNumber?` · ${esc(d.poNumber||d.referenceNumber)}`:''}</span></button></td><td><time datetime="${esc(d.date||'')}">${esc(d.date||'—')}</time></td><td><span class="workflow-pill"><span class="status-badge ${String(d.status).toLowerCase().replaceAll(' ','-')}">${esc(d.status)}</span></span></td><td>${d.documentType==='quotation'?`<select class="quote-status-select quote-${quoteStatusClass(quoteStatus)}" data-quote-status-id="${d.id}" aria-label="Quote Status for ${esc(d.documentNumber)}">${QUOTE_STATUS_OPTIONS.map(v=>`<option value="${esc(v)}" ${quoteStatus===v?'selected':''}>${esc(v)}</option>`).join('')}</select>`:'<span class="muted-cell">—</span>'}</td><td class="amount-col">${amount!==null?`<strong>${money(amount,d.currency||'PHP')}</strong><span class="currency-mini">${esc(d.currency||'PHP')}</span>`:'<span class="muted-cell">—</span>'}</td><td><span class="creator-name">${esc(d.createdBy||'—')}</span></td><td><span class="revision-pill">${esc(documentRevision(d))}</span></td><td class="company-col">${documentCompanyTag(d)}</td><td class="actions-col"><button type="button" class="document-menu-trigger" data-document-menu="${d.id}" aria-label="Actions for ${esc(d.documentNumber)}" aria-haspopup="menu" aria-expanded="false">•••</button></td></tr>`}).join(''):`<tr><td colspan="11"><div class="empty-state empty-state-workspace documents-empty-state"><div class="empty-state-content"><strong>${state.documents.length?'No matching documents':'No documents yet'}</strong><span>${state.documents.length?'No documents match the current search or filters. Clear them to return to the complete register.':'Create your first TradeLink document or restore an existing workspace from backup.'}</span></div><div class="empty-state-actions">${state.documents.length?'<button type="button" class="button primary" data-clear-document-filters>Clear filters</button>':'<button type="button" class="button primary" data-tab="create">Create document</button><button type="button" class="button" data-import>Import backup</button>'}</div></div></td></tr>`}</tbody></table></div>
  <div class="documents-pagination"><div><strong>${rows.length?`${(ui.page-1)*ps+1}–${Math.min(ui.page*ps,rows.length)}`:'0'} of ${rows.length}</strong><span>Page ${ui.page} of ${pages}</span></div><div class="toolbar-group"><button class="button small" data-page="1" ${ui.page<=1?'disabled':''}>First</button><button class="button small" data-page="${ui.page-1}" ${ui.page<=1?'disabled':''}>Previous</button><button class="button small" data-page="${ui.page+1}" ${ui.page>=pages?'disabled':''}>Next</button><button class="button small" data-page="${pages}" ${ui.page>=pages?'disabled':''}>Last</button></div></div></section>`;
}

function renderApprovals(){ const pending=state.documents.filter(d=>TYPES[d.documentType]?.approval&&['For Approval','Submitted','Under Review'].includes(d.status)); return `<section class="view">${hero('APPROVAL WORKSPACE','Decision queue,','with traceability.','Quotation, purchase-order, and ESI approval states are preserved as auditable workflow transitions instead of UI-only labels.',`${pending.length} pending`)}<div class="approval-list">${pending.length?pending.map(d=>`<article class="approval-card"><div><p class="eyebrow">${esc(TYPES[d.documentType].label)}</p><h3>${esc(d.documentNumber)} · ${esc(d.customerName)}</h3><div class="approval-meta"><span>${fmtDate(d.date)}</span><span>•</span><span>${money(d.total||0,d.currency||'PHP')}</span><span>•</span><span>${esc(d.status)}</span></div></div><div class="actions">${approvalQueueActions(d)}</div></article>`).join(''):`<div class="card empty-state"><strong>Approval queue is clear</strong><span>Submitted approval-controlled documents will appear here.</span></div>`}</div></section>`; }
function renderActivity(){ ui.recoveryPane='activity'; return renderRecovery(); }
function renderRecovery(){
  const pane=ui.recoveryPane==='activity'?'activity':'tools';
  const content=pane==='activity'?renderActivityWorkspace():`<div class="recovery-grid"><section class="card section-card"><div class="section-head"><div><p class="eyebrow">SNAPSHOTS</p><h3>Recovery points</h3></div><button class="button primary" data-snapshot>Create snapshot</button></div>${state.snapshots.length?state.snapshots.map(s=>`<article class="snapshot-card"><div><strong>${esc(s.label)}</strong><small class="doc-sub">${fmtDate(s.at,true)} · ${esc(s.hash)}</small></div><button class="button small" data-restore="${s.id}">Restore</button></article>`).join(''):`<div class="empty-state"><strong>No snapshots yet</strong><span>Create a recovery point before major workflow changes.</span></div>`}</section><section class="card section-card"><p class="eyebrow">STORAGE HEALTH</p><h3>Cloud persistence</h3><div class="summary-row"><span>Documents</span><strong>${state.documents.length}</strong></div><div class="summary-row"><span>Audit events</span><strong>${state.audit.length}</strong></div><div class="summary-row"><span>State hash</span><strong>${simpleHash(JSON.stringify({...state,snapshots:[]}))}</strong></div><div class="summary-row"><span>Last write</span><strong>${fmtDate(state.updatedAt,true)}</strong></div><div class="toolbar-group" style="margin-top:16px"><button class="button" data-export>Export backup</button><button class="button danger" data-reset>Reset application</button></div><div class="notice" style="margin-top:15px">The primary state is copied to a cloud recovery key before each committed write. Snapshot restores operate against authenticated Supabase-backed module state.</div></section></div>`;
  return `<section class="view">${hero(pane==='activity'?'ACTIVITY':'DISASTER RECOVERY',pane==='activity'?'Every change,':'Local-first,',pane==='activity'?'easy to trace.':'recoverable by design.',pane==='activity'?'Find document changes, workflow decisions, comments, backups, restores, and other recorded actions without leaving the recovery module.':'TradeLink keeps a rolling primary backup and supports named snapshots, integrity hashes, export/import, and full local reset.',pane==='activity'?`${state.audit.length} recorded events`:`${state.snapshots.length} snapshots`)}<div class="recovery-tabs wm-tabs" role="tablist" aria-label="Recovery sections"><button role="tab" aria-selected="${pane==='tools'}" class="wm-tab ${pane==='tools'?'active is-active':''}" data-recovery-pane="tools">Recovery Tools</button><button role="tab" aria-selected="${pane==='activity'}" class="wm-tab ${pane==='activity'?'active is-active':''}" data-recovery-pane="activity">Activity</button></div>${content}</section>`;
}
function renderManual(){ return `<section class="view">${hero('USER MANUAL','TradeLink,','operationalized.','This edition preserves the supplied TradeLink commercial-document logic in an authenticated cloud implementation with a TradeLink-specific interface and workflow model.',`v${APP_VERSION}`)}<div class="manual-grid"><section class="card manual-card"><p class="eyebrow">DOCUMENTS</p><h3>Supported types</h3><ul>${Object.values(TYPES).map(t=>`<li><strong>${t.short}</strong> — ${t.label}</li>`).join('')}</ul></section><section class="card manual-card"><p class="eyebrow">WORKFLOW</p><h3>Validation & approval</h3><p>Client/supplier and date are required. Item documents require descriptions; financial documents require positive unit prices. Payment receipts validate cash or cheque details. Verification and approval preserve the supplied TradeLink hierarchy. Quotation approval uses the predefined identities Angelica Anne Camille Señagan (aacsenagan@watchdogautomation.com.ph), Sales Supervisor, and Alex P. Señagan (asenagan@watchdogautomation.com.ph), General Manager / final approver. Approval marks are recorded by the assigned user through Use Time Now; email approval/notification is reserved for a future update.</p></section><section class="card manual-card"><p class="eyebrow">PERSISTENCE</p><h3>Cloud persistence</h3><p>Committed state, recovery data, document assets, and autosave state are persisted through the authenticated Work Management cloud data service. Named snapshots retain integrity checks and can restore the complete dataset.</p></section><section class="card manual-card"><p class="eyebrow">PORTABILITY</p><h3>Managed runtime</h3><p>TradeLink runs only inside the authenticated Work Management environment. JSON export/import remains available as an explicit portability and recovery path.</p></section></div></section>`; }

function bindActivityControls(){
  const workspace=document.querySelector('.activity-workspace');if(!workspace)return;
  workspace.querySelector('#activitySearch')?.addEventListener('input',e=>{ui.activitySearch=e.currentTarget.value;ui.activityPage=1;renderActivityInPlace();});
  [['activityAction','activityAction'],['activityType','activityType'],['activityRange','activityRange'],['activitySort','activitySort']].forEach(([name,key])=>workspace.querySelector(`[name="${name}"]`)?.addEventListener('change',e=>{ui[key]=e.currentTarget.value;ui.activityPage=1;renderActivityInPlace();}));
  workspace.querySelector('[data-export-activity]')?.addEventListener('click',exportActivity);
  workspace.querySelector('[data-clear-activity-filters]')?.addEventListener('click',clearActivityFilters);
  workspace.querySelector('[data-load-more-activity]')?.addEventListener('click',()=>{ui.activityPage+=1;renderActivityInPlace();});
  workspace.querySelectorAll('[data-copy-activity]').forEach(b=>b.addEventListener('click',()=>copyActivity(b.dataset.copyActivity)));
  workspace.querySelectorAll('[data-preview]').forEach(b=>b.addEventListener('click',()=>renderModal('preview',b.dataset.preview)));
}
function renderActivityInPlace(){
  const workspace=document.querySelector('.activity-workspace'); if(!workspace){render();return;}
  const active=document.activeElement===document.querySelector('#activitySearch'); const pos=document.querySelector('#activitySearch')?.selectionStart||ui.activitySearch.length;
  workspace.outerHTML=renderActivityWorkspace(); bindActivityControls(); enhanceTradeLinkPresentation(document.querySelector('#mainView'));
  if(active){const input=document.querySelector('#activitySearch');stableFocus(input);try{input?.setSelectionRange(pos,pos)}catch{}}
}

function switchActiveVendor(id){
  const next=vendorById(id); if(!next)return toast('The selected company is not available.','error');
  if(next.id===state.selectedVendorId){ui.companyPanelOpen=true;render();return;}
  const previous=selectedVendor(); state.selectedVendorId=next.id;
  const boundDraftVendor=ui.form?documentVendor(ui.form):null;
  persist('active company changed',false); addAudit('system','Active company changed',`${previous.name} → ${next.name}`,null,false);
  ui.companyPanelOpen=true; render();
  toast(ui.form&&boundDraftVendor?.id&&boundDraftVendor.id!==next.id?`Active company: ${next.name}. Current document remains assigned to ${boundDraftVendor.name}.`:`Active company: ${next.name}`);
}
function vendorAssetInput(){
  let input=document.querySelector('#vendorAssetFile'); if(input)return input;
  input=document.createElement('input'); input.type='file'; input.id='vendorAssetFile'; input.accept='image/png,image/jpeg,image/webp'; input.hidden=true;
  input.addEventListener('change',handleVendorAssetFile); document.body.appendChild(input); return input;
}
function openVendorAssetPicker(kind){ const input=vendorAssetInput(); input.dataset.assetKind=kind==='qr'?'qr':'logo'; input.value=''; try{input.click()}catch(error){toast(`Unable to open image picker: ${error.message}`,'error')} }
function handleVendorAssetFile(e){
  const input=e.currentTarget,file=input.files?.[0],kind=input.dataset.assetKind==='qr'?'qr':'logo'; if(!file)return;
  if(!/^image\/(png|jpeg|webp)$/i.test(file.type)) {input.value='';return toast('Choose a PNG, JPG, or WebP image.','error');}
  if(file.size>MAX_VENDOR_ASSET_BYTES){input.value='';return toast('Image must be 1 MB or smaller to preserve reliable local storage.','error');}
  const vendorId=state.selectedVendorId, reader=new FileReader();
  reader.onerror=()=>{input.value='';toast('The selected image could not be read.','error')};
  reader.onload=()=>{try{setVendorAsset(vendorId,kind,String(reader.result||''));addAudit('update',kind==='qr'?'Company QR updated':'Company logo updated',vendorById(vendorId)?.name||vendorId,null,false);persist('company asset updated',false);render();toast(kind==='qr'?'Footer QR code saved':'Company logo saved')}catch(error){toast(`Unable to save image: ${error.message}`,'error')}finally{input.value=''}};
  reader.readAsDataURL(file);
}
function removeActiveVendorAsset(kind){ const v=selectedVendor(),label=kind==='qr'?'footer QR code':'custom logo'; if(!getVendorAsset(v.id,kind))return; if(!confirm(`Delete the ${label} for ${v.name}?`))return; deleteVendorAsset(v.id,kind);addAudit('update',kind==='qr'?'Company QR removed':'Company logo removed',v.name,null,false);persist('company asset removed',false);render();toast(`${kind==='qr'?'QR code':'Logo'} removed`); }
function safeCounterFloor(type){ let highest=11130; for(const d of state.documents){if(d.documentType!==type)continue;const match=String(d.documentNumber||'').match(/(\d+)$/);if(match)highest=Math.max(highest,Number(match[1])||0);} return highest; }
function resetCounters(scope){
  const all=scope==='all',label=all?'all document counters':'the Packing List counter'; if(!confirm(`Reset ${label}? Existing document numbers will be preserved and each counter will remain at or above the highest number already issued to prevent duplicates.`))return;
  snapshot(`Before counter reset · ${label}`); if(all)for(const key of Object.keys(state.counters))state.counters[key]=safeCounterFloor(key); else state.counters.packing=safeCounterFloor('packing');
  addAudit('system','Document counter reset',all?'All counters reset to safe issued-number floors':'Packing List counter reset to its safe issued-number floor',null,false);persist('counter reset',false);render();toast(all?'All counters reset safely':'Packing List counter reset safely');
}

function bindGlobal(){
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
  document.querySelector('#vendorTrigger')?.addEventListener('click',()=>{ui.companyPanelOpen=!ui.companyPanelOpen;render();});
  document.querySelectorAll('[data-close-company-panel]').forEach(el=>el.addEventListener('click',()=>{ui.companyPanelOpen=false;render();}));
  document.querySelector('#vendorSelect')?.addEventListener('change',e=>switchActiveVendor(e.target.value));
  document.querySelectorAll('[data-upload-vendor-asset]').forEach(b=>b.addEventListener('click',()=>openVendorAssetPicker(b.dataset.uploadVendorAsset)));
  document.querySelectorAll('[data-delete-vendor-asset]').forEach(b=>b.addEventListener('click',()=>removeActiveVendorAsset(b.dataset.deleteVendorAsset)));
  document.querySelectorAll('[data-reset-counters]').forEach(b=>b.addEventListener('click',()=>resetCounters(b.dataset.resetCounters)));
  document.querySelector('#vendorTemplateAccent')?.addEventListener('change',e=>updateActiveCompanyTemplate({accent:e.target.value}));
  document.querySelector('#vendorTemplateTerms')?.addEventListener('change',e=>updateActiveCompanyTemplate({termsMode:e.target.value}));
  document.querySelector('[data-reset-company-template]')?.addEventListener('click',resetActiveCompanyTemplate);
  document.querySelector('[data-open-template-reference]')?.addEventListener('click',openActiveTemplateReference);
  document.querySelectorAll('[data-create]').forEach(b=>b.addEventListener('click',()=>startCreate(b.dataset.create)));
  document.querySelectorAll('[data-create-type]').forEach(b=>b.addEventListener('click',()=>switchCreateType(b.dataset.createType)));
  document.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>editDoc(b.dataset.edit)));
  document.querySelectorAll('[data-preview]').forEach(b=>b.addEventListener('click',()=>renderModal('preview',b.dataset.preview)));
  document.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>deleteDoc(b.dataset.delete)));
  document.querySelectorAll('[data-duplicate]').forEach(b=>b.addEventListener('click',()=>{const d=state.documents.find(x=>x.id===b.dataset.duplicate);if(!d)return;ui.form=normalizeForm({...d,id:null,documentNumber:'',status:'Draft',createdAt:null,updatedAt:null,verifiedAt:'',approvedAt:''});ui.editingId=null;ui.tab='create';render();toast('Duplicate prepared as a new draft');}));
  document.querySelectorAll('[data-status-id]').forEach(b=>b.addEventListener('click',()=>changeStatus(b.dataset.statusId,b.dataset.status)));
  document.querySelectorAll('[data-approval-step-id]').forEach(b=>b.addEventListener('click',()=>captureApprovalStep(b.dataset.approvalStepId,b.dataset.approvalStep)));
  document.querySelectorAll('[data-snapshot]').forEach(b=>b.addEventListener('click',()=>snapshot()));
  document.querySelectorAll('[data-restore]').forEach(b=>b.addEventListener('click',()=>{if(confirm('Restore this snapshot? Current state will be replaced.'))restoreSnapshot(b.dataset.restore)}));
  document.querySelectorAll('[data-recovery-pane]').forEach(b=>b.addEventListener('click',()=>{ui.recoveryPane=b.dataset.recoveryPane==='activity'?'activity':'tools';ui.activityPage=1;globalThis.WMModuleStore.setItem(UI_KEY,JSON.stringify({...ui,form:undefined,errors:{},modal:null,companyPanelOpen:false}));render();}));
  bindActivityControls();
  document.querySelectorAll('[data-export]').forEach(b=>b.addEventListener('click',exportState));
  document.querySelectorAll('[data-import]').forEach(b=>b.addEventListener('click',openImportPicker));
  document.querySelector('[data-reset]')?.addEventListener('click',resetApp);
  document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>{ui.page=Number(b.dataset.page)||1;persistDocumentView();render()}));
  document.querySelector('#filterSearch')?.addEventListener('input',e=>{ui.search=e.target.value;ui.page=1;persistDocumentView();renderDocumentsInPlace()});
  document.querySelector('#filterType')?.addEventListener('change',e=>{ui.type=e.target.value;ui.page=1;persistDocumentView();render()});
  document.querySelector('#filterStatus')?.addEventListener('change',e=>{ui.status=e.target.value;ui.page=1;persistDocumentView();render()});
  document.querySelector('#filterQuoteStatus')?.addEventListener('change',e=>{ui.quoteStatus=e.target.value;ui.page=1;persistDocumentView();render()});
  document.querySelector('#filterCompany')?.addEventListener('change',e=>{ui.companyFilter=e.target.value;ui.page=1;persistDocumentView();render()});
  document.querySelector('#filterRange')?.addEventListener('change',e=>{ui.documentRange=e.target.value;ui.page=1;persistDocumentView();render()});
  document.querySelector('#filterSort')?.addEventListener('change',e=>{ui.documentSort=e.target.value;ui.page=1;persistDocumentView();render()});
  document.querySelector('#filterPageSize')?.addEventListener('change',e=>{state.settings.pageSize=Number(e.target.value)||20;ui.page=1;persist('document page size',false);render()});
  document.querySelectorAll('[data-clear-document-filters]').forEach(b=>b.addEventListener('click',clearDocumentFilters));
  document.querySelector('[data-toggle-approval-queue]')?.addEventListener('click',()=>{ui.approvalQueueOpen=!ui.approvalQueueOpen;persistDocumentView();render()});
  document.querySelectorAll('[data-select-document]').forEach(c=>c.addEventListener('change',()=>{const ids=new Set(ui.selectedDocumentIds||[]);c.checked?ids.add(c.dataset.selectDocument):ids.delete(c.dataset.selectDocument);ui.selectedDocumentIds=[...ids];persistDocumentView();render()}));
  document.querySelector('[data-select-page]')?.addEventListener('change',e=>{const ids=new Set(ui.selectedDocumentIds||[]);document.querySelectorAll('[data-select-document]').forEach(c=>e.target.checked?ids.add(c.dataset.selectDocument):ids.delete(c.dataset.selectDocument));ui.selectedDocumentIds=[...ids];persistDocumentView();render()});
  document.querySelector('[data-clear-selection]')?.addEventListener('click',()=>{ui.selectedDocumentIds=[];persistDocumentView();render()});
  document.querySelector('[data-open-selected]')?.addEventListener('click',()=>{const docs=selectedDocuments();if(docs.length===1)renderModal('preview',docs[0].id)});
  document.querySelector('[data-edit-selected]')?.addEventListener('click',()=>{const docs=selectedDocuments();if(docs.length===1)editDoc(docs[0].id)});
  document.querySelector('[data-copy-selected]')?.addEventListener('click',copySelectedDocumentNumbers);
  document.querySelector('[data-export-selected]')?.addEventListener('click',exportSelectedDocuments);
  document.querySelector('[data-delete-selected]')?.addEventListener('click',deleteSelectedDocuments);
  document.querySelectorAll('[data-quote-status-id]').forEach(el=>el.addEventListener('change',()=>updateQuoteStatus(el.dataset.quoteStatusId,el.value)));
  document.querySelectorAll('[data-document-menu]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openDocumentActionMenu(b.dataset.documentMenu,b,{focusFirst:e.detail===0})}));
  document.querySelector('#importFile')?.addEventListener('change',importState);
  if(ui.tab==='create') bindForm();
}
function renderDocumentsInPlace(){ if(ui.tab!=='documents')return; render(); const el=document.querySelector('#filterSearch'); if(el){stableFocus(el);el.setSelectionRange(el.value.length,el.value.length)} }
function autosaveDraft(){ if(state.settings.autosave&&ui.form)globalThis.WMModuleStore.setItem(AUTOSAVE_KEY,JSON.stringify(ui.form)); }
function addEsiLine(item){ if(!ui.form||ui.form.items.length>=100){toast('A document can contain up to 100 lines','error');return;} ui.form.items.push(item); autosaveDraft(); render(); requestAnimationFrame(()=>stableFocus(document.querySelector(`[data-item-row="${item.id}"] textarea`))); }

function announceVatSelection(value){
  const live=document.querySelector('[data-vat-live]');
  if(live)live.textContent=`VAT classification set to ${vatLabel(value)}`;
}

function bindForm(){
  const form=document.querySelector('#docForm'); if(!form)return;
  const dedicatedFields=new Set(ui.form.documentType==='esi'?['verifiedBy','approvedBy']:ui.form.documentType==='delivery'?['checkedBy','deliveredBy']:ui.form.documentType==='payment'?['receivedBy','verifiedBy']:ui.form.documentType==='po'?['verifiedBy']:[]);
  const syncControl=el=>{
    const name=el.name;if(!name||dedicatedFields.has(name))return;
    let value=el.type==='checkbox'?el.checked:el.value;if(el.type==='number')value=el.value===''?0:Number(el.value);
    ui.form[name]=value;delete ui.errors[name];
    if(name==='paymentTerms'&&value!=='Custom')delete ui.errors.paymentTermsCustom;
    if(name==='validity'&&!String(value).startsWith('Others'))delete ui.errors.validityCustom;
    if(name==='deliveryCommitment'&&!String(value).startsWith('Others'))delete ui.errors.deliveryCommitmentCustom;
    el.classList.remove('invalid');el.removeAttribute('aria-invalid');
    const field=el.closest('.field');field?.classList.remove('has-field-error');field?.querySelector('.field-error')?.remove();
    if(name==='documentType'){const old=ui.form.documentType;ui.form={...newForm(value),...ui.form,documentType:value,terms:ui.form.terms===DEFAULT_TERMS[old]?DEFAULT_TERMS[value]:ui.form.terms};}
    autosaveDraft();
    if(name==='vatType'){announceVatSelection(value);toast(`VAT set to ${vatLabel(value)}`);}
    if(name==='date'){const due=form.querySelector('[name="dueDate"]');if(due)due.min=value||todayISO();}
    renderCreateSoft(name);
    const customTarget=name==='paymentTerms'&&value==='Custom'?'paymentTermsCustom':name==='validity'&&String(value).startsWith('Others')?'validityCustom':name==='deliveryCommitment'&&String(value).startsWith('Others')?'deliveryCommitmentCustom':'';
    if(customTarget)requestAnimationFrame(()=>stableFocus(document.querySelector(`[name="${customTarget}"]`)));
  };
  form.querySelectorAll('input[name],select[name],textarea[name]').forEach(el=>{
    if(dedicatedFields.has(el.name))return;
    const eventName=el.tagName==='SELECT'?'change':'input';
    el.addEventListener(eventName,()=>syncControl(el));
  });
  form.querySelectorAll('[data-item]').forEach(el=>el.addEventListener('input',()=>{const i=Number(el.dataset.index);const field=el.dataset.item;if(!ui.form.items[i])return;ui.form.items[i][field]=['description','serialNumber'].includes(field)?el.value:Number(el.value);if(ui.errors.itemRows?.[i]){delete ui.errors.itemRows[i][field];if(!Object.keys(ui.errors.itemRows[i]).length)delete ui.errors.itemRows[i];}if(state.settings.autosave)globalThis.WMModuleStore.setItem(AUTOSAVE_KEY,JSON.stringify(ui.form));if(field!=='description'){if(ui.form.documentType==='delivery'&&ui.form.drIncludePricing){document.querySelectorAll('[data-delivery-line-amount]').forEach(out=>{const n=Number(out.dataset.deliveryLineAmount);if(ui.form.items[n])out.textContent=money(itemAmount(ui.form.items[n]),ui.form.currency)});const total=document.querySelector('[data-delivery-total]');if(total)total.textContent=money(calc(ui.form).subtotal,ui.form.currency);}else refreshFinancialDisplay();}const row=el.closest('[data-item-row]');row?.classList.toggle('has-error',Boolean(ui.errors.itemRows?.[i]));el.classList.remove('invalid');el.removeAttribute('aria-invalid');const lineField=el.closest('.line-field');lineField?.querySelector('.line-error')?.remove();if(field==='description'){const count=row?.querySelector('.item-char-count,.packing-char-count');if(count)count.textContent=`${el.value.length}/5000`;}}));
  document.querySelector('[data-add-item]')?.addEventListener('click',()=>{ui.form.items.push(defaultItem());autosaveDraft();render()});
  document.querySelector('[data-add-blank]')?.addEventListener('click',()=>addEsiLine(defaultItem()));
  document.querySelector('[data-add-note]')?.addEventListener('click',()=>addEsiLine(defaultNote()));
  document.querySelector('[data-add-saved-item]')?.addEventListener('click',()=>{const picker=document.querySelector('[data-saved-product]');const product=state.products.find(p=>p.id===picker?.value);if(!product)return toast('Choose a saved item first','error');const sameCurrency=(product.currency||ui.form.currency)===ui.form.currency;const item={...defaultItem(),description:product.description||'',unitPrice:sameCurrency?(Number(product.unitPrice)||0):0};addEsiLine(item);if(!sameCurrency)toast(`Saved price was ${product.currency}; description added without carrying the price`);});
  document.querySelector('[data-clear-items]')?.addEventListener('click',()=>{const populated=ui.form.items.some(i=>i.description?.trim()||itemAmount(i)>0);if(populated&&!confirm(`Clear all ${createTypeLabel(ui.form.documentType)} items and notes? This affects only the current draft.`))return;ui.form.items=[defaultItem()];ui.errors.itemRows={};delete ui.errors.items;autosaveDraft();render();toast(`${createTypeLabel(ui.form.documentType)} item list cleared`);});
  document.querySelectorAll('[data-duplicate-item]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.duplicateItem);const src=ui.form.items[idx];if(!src||ui.form.items.length>=100)return toast('A document can contain up to 100 lines','error');ui.form.items.splice(idx+1,0,{...deepCopy(src),id:uid('line')});autosaveDraft();render();toast('Item duplicated');}));
  document.querySelectorAll('[data-move-item]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.moveItem),dir=b.dataset.direction==='up'?-1:1,target=idx+dir;if(target<0||target>=ui.form.items.length)return;[ui.form.items[idx],ui.form.items[target]]=[ui.form.items[target],ui.form.items[idx]];autosaveDraft();render();requestAnimationFrame(()=>stableFocus(document.querySelector(`[data-item-row="${ui.form.items[target].id}"] textarea`)));}));
  document.querySelectorAll('[data-remove-item]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.removeItem),item=ui.form.items[idx];if(!item)return;const populated=item.description?.trim()||itemAmount(item)>0;if(populated&&!confirm(`${isRealItem(item)?'Remove this item':'Remove this note'} from the current draft?`))return;if(ui.form.items.length===1)ui.form.items[0]=defaultItem();else ui.form.items.splice(idx,1);ui.errors.itemRows={};delete ui.errors.items;autosaveDraft();render();}));
  if(ui.form.documentType==='packing'){
    const addPackingLine=item=>{if(ui.form.items.length>=100)return toast('A Packing List can contain up to 100 lines','error');ui.form.items.push(item);autosaveDraft();render();requestAnimationFrame(()=>stableFocus(document.querySelector(`[data-item-row="${item.id}"] textarea`)));};
    form.querySelector('.packing-item-editor')?.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();addPackingLine(defaultItem());}});
    document.querySelector('[data-add-packing-item]')?.addEventListener('click',()=>addPackingLine(defaultItem()));
    document.querySelector('[data-add-packing-note]')?.addEventListener('click',()=>addPackingLine(defaultNote()));
    document.querySelector('[data-add-packing-saved]')?.addEventListener('click',()=>{const picker=document.querySelector('[data-packing-saved-product]'),product=state.products.find(p=>p.id===picker?.value);if(!product)return toast('Choose a saved item first','error');addPackingLine({...defaultItem(),description:product.description||''});});
    document.querySelector('[data-clear-packing-items]')?.addEventListener('click',()=>{const populated=ui.form.items.some(i=>i.description?.trim());if(populated&&!confirm('Clear all Packing List items and notes? This affects only the current draft.'))return;ui.form.items=[defaultItem()];ui.errors.itemRows={};delete ui.errors.items;autosaveDraft();render();toast('Packing item list cleared');});
    document.querySelectorAll('[data-duplicate-packing-item]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.duplicatePackingItem),src=ui.form.items[idx];if(!src)return;if(ui.form.items.length>=100)return toast('A Packing List can contain up to 100 lines','error');ui.form.items.splice(idx+1,0,{...deepCopy(src),id:uid('line')});autosaveDraft();render();toast('Packing item duplicated');}));
    document.querySelectorAll('[data-move-packing-item]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.movePackingItem),dir=b.dataset.direction==='up'?-1:1,target=idx+dir;if(target<0||target>=ui.form.items.length)return;[ui.form.items[idx],ui.form.items[target]]=[ui.form.items[target],ui.form.items[idx]];autosaveDraft();render();requestAnimationFrame(()=>stableFocus(document.querySelector(`[data-item-row="${ui.form.items[target].id}"] textarea`)));}));
    document.querySelectorAll('[data-remove-packing-item]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.removePackingItem),item=ui.form.items[idx];if(!item)return;const populated=item.description?.trim();if(populated&&!confirm(`${isRealItem(item)?'Remove this packed item':'Remove this note'} from the current draft?`))return;if(ui.form.items.length===1)ui.form.items[0]=defaultItem();else ui.form.items.splice(idx,1);ui.errors.itemRows={};delete ui.errors.items;autosaveDraft();render();}));
  }
  if(ui.form.documentType==='po'){
    const lookup=document.querySelector('#poSupplierLookup');
    const applySupplier=()=>{const name=(lookup?.value||'').trim(),supplier=state.suppliers.find(x=>String(x.name||'').toLowerCase()===name.toLowerCase());if(!supplier)return;Object.assign(ui.form,{customerName:supplier.name||'',customerAddress:supplier.address||'',customerTin:supplier.tin||'',customerContact:supplier.contact||'',customerEmail:supplier.email||'',customerPhone:supplier.phone||'',paymentTerms:supplier.paymentTerms||ui.form.paymentTerms,paymentTermsCustom:supplier.paymentTermsCustom||ui.form.paymentTermsCustom,currency:supplier.currency||ui.form.currency});autosaveDraft();render();toast(`Loaded ${supplier.name}`);};
    lookup?.addEventListener('change',applySupplier);lookup?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applySupplier();}});
    document.querySelector('[data-clear-po-supplier]')?.addEventListener('click',()=>{Object.assign(ui.form,{customerName:'',customerAddress:'',customerTin:'',customerContact:'',customerEmail:'',customerPhone:'',dueDate:'',poNumber:''});autosaveDraft();render();toast('PO supplier details cleared');});
    form.querySelector('[name="customerTin"]')?.addEventListener('blur',e=>{const digits=e.target.value.replace(/\D/g,'').slice(0,12);if([9,12].includes(digits.length)){const formatted=digits.length===12?`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)}-${digits.slice(9)}`:`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;ui.form.customerTin=formatted;e.target.value=formatted;autosaveDraft();}});
    const addPoLine=item=>{if(ui.form.items.length>=100)return toast('A Purchase Order can contain up to 100 lines','error');ui.form.items.push(item);autosaveDraft();render();requestAnimationFrame(()=>stableFocus(document.querySelector(`[data-item-row="${item.id}"] textarea`)));};
    document.querySelector('[data-add-po-item]')?.addEventListener('click',()=>addPoLine(defaultItem()));
    document.querySelector('[data-add-po-note]')?.addEventListener('click',()=>addPoLine(defaultNote()));
    document.querySelector('[data-add-po-saved]')?.addEventListener('click',()=>{const id=document.querySelector('[data-po-saved-product]')?.value,p=state.products.find(x=>x.id===id);if(!p)return toast('Choose a saved item first','error');const same=(p.currency||ui.form.currency)===ui.form.currency;addPoLine({...defaultItem(),description:p.description||'',unitPrice:same?(Number(p.unitPrice)||0):0});if(!same)toast(`Saved item uses ${p.currency}; description added without carrying price`);});
    form.querySelector('.po-item-editor')?.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();addPoLine(defaultItem());}});
    document.querySelectorAll('[data-duplicate-po-item]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.duplicatePoItem),src=ui.form.items[idx];if(!src||ui.form.items.length>=100)return toast('A Purchase Order can contain up to 100 lines','error');ui.form.items.splice(idx+1,0,{...deepCopy(src),id:uid('line')});autosaveDraft();render();toast('Purchase item duplicated');}));
    document.querySelectorAll('[data-move-po-item]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.movePoItem),target=idx+(b.dataset.direction==='up'?-1:1);if(target<0||target>=ui.form.items.length)return;[ui.form.items[idx],ui.form.items[target]]=[ui.form.items[target],ui.form.items[idx]];autosaveDraft();render();}));
    document.querySelectorAll('[data-remove-po-item]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.removePoItem),item=ui.form.items[idx];if(!item)return;if((item.description?.trim()||itemAmount(item)>0)&&!confirm(`${isRealItem(item)?'Remove this purchase item':'Remove this purchase note'}?`))return;if(ui.form.items.length===1)ui.form.items[0]=defaultItem();else ui.form.items.splice(idx,1);ui.errors.itemRows={};delete ui.errors.items;autosaveDraft();render();}));
    document.querySelector('[data-clear-po-items]')?.addEventListener('click',()=>{if(!confirm('Clear all Purchase Order items and notes?'))return;ui.form.items=[defaultItem()];ui.errors.itemRows={};delete ui.errors.items;autosaveDraft();render();toast('Purchase items cleared');});
    const template=document.querySelector('[data-po-note-template]');template?.addEventListener('change',()=>{const text=PO_NOTE_TEMPLATES.find(([k])=>k===template.value)?.[1];if(!text)return;ui.form.remarks=[String(ui.form.remarks||'').trim(),text].filter(Boolean).join('\n\n').slice(0,5000);autosaveDraft();render();toast('Purchasing note added');});
    const notes=form.querySelector('textarea[name="remarks"]');notes?.addEventListener('input',()=>{const c=document.querySelector('[data-po-notes-count]');if(c)c.textContent=`${notes.value.length.toLocaleString()} / 5,000`;});
    const terms=form.querySelector('textarea[name="terms"]');terms?.addEventListener('input',()=>{const c=document.querySelector('[data-po-terms-count]');if(c)c.textContent=`${terms.value.length.toLocaleString()} / 10,000`;const badge=document.querySelector('[data-po-terms-status]');if(badge){const status=!terms.value.trim()?'Empty':terms.value===DEFAULT_TERMS.po?'Standard':'Customized';badge.textContent=status;badge.className=`terms-status ${status.toLowerCase()}`;}});
    document.querySelector('[data-copy-po-terms]')?.addEventListener('click',()=>{const text=String(ui.form.terms||'');if(!text.trim())return toast('There are no PO terms to copy','error');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>toast('PO terms copied')).catch(()=>fallbackCopy(text));else fallbackCopy(text);});
    document.querySelector('[data-reset-po-terms]')?.addEventListener('click',()=>{if(ui.form.terms===DEFAULT_TERMS.po)return;if(ui.form.terms?.trim()&&!confirm('Restore the standard Purchase Order Terms & Conditions?'))return;ui.form.terms=DEFAULT_TERMS.po;delete ui.errors.terms;autosaveDraft();render();toast('Standard PO terms restored');});
    document.querySelector('[data-toggle-po-terms]')?.addEventListener('click',()=>{ui.termsExpanded=!ui.termsExpanded;const section=document.querySelector('[data-po-terms-section]'),button=document.querySelector('[data-toggle-po-terms]');section?.classList.toggle('is-expanded',ui.termsExpanded);if(button)button.textContent=ui.termsExpanded?'Collapse':'Expand';stableFocus(terms);});
    form.querySelector('[name="verifiedBy"]')?.addEventListener('change',e=>{if(e.target.value!==ui.form.verifiedBy){ui.form.verifiedBy=e.target.value;ui.form.verifiedAt='';delete ui.errors.verifiedBy;autosaveDraft();render();toast(e.target.value?`Account Manager assigned: ${e.target.value}`:'Account Manager cleared');}});
  }
  if(ui.form.documentType==='delivery'){
    const addDeliveryLine=item=>{if(ui.form.items.length>=100)return toast('A Delivery Receipt can contain up to 100 lines','error');ui.form.items.push(item);autosaveDraft();render();requestAnimationFrame(()=>stableFocus(document.querySelector(`[data-item-row="${item.id}"] textarea`)));};
    form.querySelector('.delivery-item-editor')?.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();addDeliveryLine(defaultItem());}});
    document.querySelector('[data-add-delivery-item]')?.addEventListener('click',()=>addDeliveryLine(defaultItem()));
    document.querySelector('[data-add-delivery-saved]')?.addEventListener('click',()=>{const picker=document.querySelector('[data-delivery-saved-product]'),p=state.products.find(x=>x.id===picker?.value);if(!p)return toast('Choose a saved item first','error');addDeliveryLine({...defaultItem(),description:p.description||'',unitPrice:ui.form.drIncludePricing&&((p.currency||ui.form.currency)===ui.form.currency)?Number(p.unitPrice)||0:0});});
    document.querySelector('[data-clear-delivery-items]')?.addEventListener('click',()=>{if(ui.form.items.some(i=>i.description?.trim())&&!confirm('Clear all Delivery Receipt items? This affects only the current draft.'))return;ui.form.items=[defaultItem()];ui.errors.itemRows={};delete ui.errors.items;autosaveDraft();render();toast('Delivery item list cleared');});
    document.querySelectorAll('[data-duplicate-delivery-item]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.duplicateDeliveryItem),src=ui.form.items[idx];if(!src)return;if(ui.form.items.length>=100)return toast('A Delivery Receipt can contain up to 100 lines','error');ui.form.items.splice(idx+1,0,{...deepCopy(src),id:uid('line')});autosaveDraft();render();toast('Delivery item duplicated');}));
    document.querySelectorAll('[data-move-delivery-item]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.moveDeliveryItem),dir=b.dataset.direction==='up'?-1:1,target=idx+dir;if(target<0||target>=ui.form.items.length)return;[ui.form.items[idx],ui.form.items[target]]=[ui.form.items[target],ui.form.items[idx]];autosaveDraft();render();}));
    document.querySelectorAll('[data-remove-delivery-item]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.removeDeliveryItem),item=ui.form.items[idx];if(!item)return;if((item.description?.trim()||item.serialNumber?.trim())&&!confirm('Remove this delivered item from the current draft?'))return;if(ui.form.items.length===1)ui.form.items[0]=defaultItem();else ui.form.items.splice(idx,1);ui.errors.itemRows={};delete ui.errors.items;autosaveDraft();render();}));
    const pricing=form.querySelector('[name="drIncludePricing"]');pricing?.addEventListener('change',e=>{ui.form.drIncludePricing=e.target.checked;autosaveDraft();render();toast(e.target.checked?'Pricing enabled for this Delivery Receipt':'Pricing hidden for this Delivery Receipt');});
    const lookup=document.querySelector('#deliveryClientLookup');const applyDeliveryClient=()=>{const name=(lookup?.value||'').trim(),c=state.clients.find(x=>String(x.name||'').toLowerCase()===name.toLowerCase());if(!c)return;Object.assign(ui.form,{customerName:c.name||'',customerAddress:c.address||'',customerTin:c.tin||'',customerContact:c.contact||'',customerEmail:c.email||'',customerPhone:c.phone||'',paymentTerms:c.paymentTerms||ui.form.paymentTerms,paymentTermsCustom:c.paymentTermsCustom||ui.form.paymentTermsCustom});if(!ui.form.dueDate)ui.form.dueDate=dueDateFromTerms(ui.form.date,ui.form.paymentTerms);autosaveDraft();render();toast(`Loaded ${c.name}`);};lookup?.addEventListener('change',applyDeliveryClient);lookup?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyDeliveryClient();}});
    document.querySelector('[data-clear-delivery-client]')?.addEventListener('click',()=>{Object.assign(ui.form,{customerName:'',customerAddress:'',customerTin:'',customerContact:'',customerEmail:'',customerPhone:'',dueDate:'',poNumber:''});autosaveDraft();render();toast('Delivery client details cleared');});
    const checked=form.querySelector('#deliveryCheckedBy'),delivered=form.querySelector('#deliveryDeliveredBy');checked?.addEventListener('change',e=>{if(e.target.value!==ui.form.checkedBy){ui.form.checkedBy=e.target.value;ui.form.checkedAt='';delete ui.errors.checkedBy;autosaveDraft();render();}});delivered?.addEventListener('change',e=>{if(e.target.value!==ui.form.deliveredBy){ui.form.deliveredBy=e.target.value;ui.form.deliveredAt='';delete ui.errors.deliveredBy;autosaveDraft();render();}});
    document.querySelector('[data-clear-delivery-tracking]')?.addEventListener('click',()=>{if(!confirm('Clear the QC and Logistics assignments for this draft?'))return;Object.assign(ui.form,{checkedBy:'',checkedAt:'',deliveredBy:'',deliveredAt:''});delete ui.errors.checkedBy;delete ui.errors.deliveredBy;autosaveDraft();render();toast('Delivery tracking assignments cleared');});
    document.querySelectorAll('[data-capture-delivery]').forEach(b=>b.addEventListener('click',()=>{const field=b.dataset.captureDelivery,assignment=field==='checkedAt'?ui.form.checkedBy:ui.form.deliveredBy;if(!assignment||assignment!==state.currentUser.name)return toast(`Only ${assignment||'the assigned personnel'} can capture this timestamp`,'error');ui.form[field]=nowISO();autosaveDraft();render();toast(field==='checkedAt'?'QC check timestamp captured':'Delivery timestamp captured');}));
    form.querySelector('[name="customerTin"]')?.addEventListener('blur',e=>{const digits=e.target.value.replace(/\D/g,'').slice(0,12);if([9,12].includes(digits.length)){const formatted=digits.length===12?`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)}-${digits.slice(9)}`:`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;ui.form.customerTin=formatted;e.target.value=formatted;autosaveDraft();}});
    const termsArea=form.querySelector('textarea[name="terms"]');termsArea?.addEventListener('input',()=>{const count=document.querySelector('[data-delivery-terms-count]');if(count)count.textContent=`${termsArea.value.length.toLocaleString()} / 10,000`;const badge=document.querySelector('[data-delivery-terms-status]');if(badge){const value=termsArea.value,status=!value.trim()?'Empty':value===DEFAULT_TERMS.delivery?'Standard':'Customized';badge.textContent=status;badge.className=`terms-status ${status.toLowerCase()}`;}});
    document.querySelector('[data-copy-delivery-terms]')?.addEventListener('click',()=>{const text=String(ui.form.terms||'');if(!text.trim())return toast('There are no Delivery Receipt terms to copy','error');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>toast('Delivery Receipt terms copied')).catch(()=>fallbackCopy(text));else fallbackCopy(text);});
    document.querySelector('[data-reset-delivery-terms]')?.addEventListener('click',()=>{if(ui.form.terms===DEFAULT_TERMS.delivery)return;if(ui.form.terms?.trim()&&!confirm('Restore the standard Delivery Receipt Terms & Conditions?'))return;ui.form.terms=DEFAULT_TERMS.delivery;delete ui.errors.terms;autosaveDraft();render();toast('Standard Delivery Receipt terms restored');});
    document.querySelector('[data-toggle-delivery-terms]')?.addEventListener('click',()=>{ui.termsExpanded=!ui.termsExpanded;const section=document.querySelector('[data-delivery-terms-section]'),button=document.querySelector('[data-toggle-delivery-terms]');section?.classList.toggle('is-expanded',ui.termsExpanded);if(button){button.setAttribute('aria-expanded',String(ui.termsExpanded));button.textContent=ui.termsExpanded?'Collapse':'Expand';}stableFocus(termsArea);});
  }
  if(['esi','quotation','po'].includes(ui.form.documentType)) form.querySelector('.esi-item-editor')?.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();addEsiLine(defaultItem());}});
  if(ui.form.documentType==='esi'){
    const verifier=document.querySelector('#esiVerifiedBy'), approver=document.querySelector('#esiApprovedBy');
    verifier?.addEventListener('change',e=>{const next=e.currentTarget.value;if(next!==ui.form.verifiedBy){ui.form.verifiedBy=next;ui.form.verifiedAt='';delete ui.errors.verifiedBy;autosaveDraft();render();toast(next?`Finance verifier assigned: ${next}`:'Finance verifier cleared');}});
    approver?.addEventListener('change',e=>{const next=e.currentTarget.value;if(next!==ui.form.approvedBy){ui.form.approvedBy=next;ui.form.approvedAt='';delete ui.errors.approvedBy;autosaveDraft();render();toast(next?`Management approver assigned: ${next}`:'Management approver cleared');}});
    document.querySelector('[data-clear-approval-assignments]')?.addEventListener('click',()=>{if(!confirm('Clear the Electronic SI verifier and approver assignments? Existing captured workflow timestamps in this draft will also be cleared.'))return;Object.assign(ui.form,{verifiedBy:'',verifiedAt:'',approvedBy:'',approvedAt:''});delete ui.errors.verifiedBy;delete ui.errors.approvedBy;autosaveDraft();render();toast('Approval assignments cleared');});
  }
  document.querySelectorAll('[data-capture-approval-step]').forEach(button=>button.addEventListener('click',()=>{
    const field=button.dataset.captureApprovalStep;
    if(!['verifiedAt','approvedAt'].includes(field))return;
    const isReview=field==='verifiedAt',assignee=isReview?ui.form.verifiedBy:ui.form.approvedBy;
    if(!assignee)return toast(isReview?'Assign the reviewer / verifier first.':'Assign the final approver first.','error');
    if(!isReview&&ui.form.verifiedBy&&!ui.form.verifiedAt)return toast('Complete the review / verification stage before final approval.','error');
    if(!canCurrentUserActAs(assignee))return toast(`Only ${assignee} can complete this workflow step. Current user: ${state.currentUser.name}.`,'error');
    const capturedAt=nowISO();
    ui.form[field]=capturedAt;
    if(ui.form.documentType==='quotation'){
      if(isReview)ui.form.verifiedByEmail=workflowEmail(assignee)||ui.form.verifiedByEmail||'';
      else ui.form.approvedByEmail=workflowEmail(assignee)||ui.form.approvedByEmail||'';
    }
    ui.form.status=approvalStatusForDocument(ui.form);
    autosaveDraft();
    if(ui.form.documentType==='quotation'&&ui.form.id){
      const persisted=state.documents.find(d=>d.id===ui.form.id);
      if(persisted){
        persisted[field]=capturedAt;
        persisted.verifiedBy=ui.form.verifiedBy; persisted.verifiedByEmail=ui.form.verifiedByEmail||'';
        persisted.approvedBy=ui.form.approvedBy; persisted.approvedByEmail=ui.form.approvedByEmail||'';
        persisted.status=ui.form.status; persisted.updatedAt=capturedAt;
        const actor=workflowPerson(assignee);
        addAudit('workflow',`${persisted.documentNumber} ${isReview?'reviewed':'approved'}`,`${assignee}${actor?.email?` (${actor.email})`:''} recorded ${isReview?'Sales Supervisor review':'General Manager final approval'} using Use Time Now at ${capturedAt}`,persisted.id,false);
        persist(`quotation Use Time Now ${field}`,false);
      }
    }
    const capturedDocType=ui.form.documentType;
    render();
    toast(capturedDocType==='quotation'?(isReview?'Review timestamp recorded with Use Time Now':'Final approval timestamp recorded with Use Time Now'):(isReview?(capturedDocType==='esi'?'Finance verification captured':'Review captured'):'Final approval captured'));
  }));
  document.querySelector('[data-reset-adjustments]')?.addEventListener('click',()=>{if(!confirm(`Reset the ${createTypeLabel(ui.form.documentType)} discount and VAT to their defaults?`))return;ui.form.discountType='percentage';ui.form.discountValue=0;ui.form.discountReason='';ui.form.vatType='zero';delete ui.errors.discountValue;autosaveDraft();render();toast(`${createTypeLabel(ui.form.documentType)} adjustments reset`);});
  document.querySelectorAll('[data-form-action]').forEach(b=>b.addEventListener('click',()=>syncFormAndSave(b.dataset.formAction)));
  if(ui.form.documentType==='packing'){
    const lookup=document.querySelector('#packingClientLookup');
    const applySavedClient=()=>{const name=(lookup?.value||'').trim(),c=state.clients.find(x=>String(x.name||'').toLowerCase()===name.toLowerCase());if(!c)return;Object.assign(ui.form,{customerName:c.name||'',customerAddress:c.address||'',customerTin:c.tin||'',customerContact:c.contact||'',customerEmail:c.email||'',customerPhone:c.phone||'',paymentTerms:c.paymentTerms||ui.form.paymentTerms,paymentTermsCustom:c.paymentTermsCustom||ui.form.paymentTermsCustom});if(!ui.form.dueDate)ui.form.dueDate=dueDateFromTerms(ui.form.date,ui.form.paymentTerms);autosaveDraft();render();toast(`Loaded ${c.name}`);};
    lookup?.addEventListener('change',applySavedClient);lookup?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applySavedClient();}});
    document.querySelector('[data-clear-packing-client]')?.addEventListener('click',()=>{Object.assign(ui.form,{customerName:'',customerAddress:'',customerTin:'',customerContact:'',customerEmail:'',customerPhone:'',dueDate:'',poNumber:''});autosaveDraft();render();toast('Packing List client details cleared');});
    form.querySelector('[name="paymentTerms"]')?.addEventListener('change',e=>{const suggested=dueDateFromTerms(ui.form.date,e.target.value);if(suggested&&!ui.form.dueDate){ui.form.dueDate=suggested;autosaveDraft();render();toast('Expected delivery date suggested from terms');}});
    form.querySelector('[name="customerTin"]')?.addEventListener('blur',e=>{const digits=e.target.value.replace(/\D/g,'').slice(0,12);if([9,12].includes(digits.length)){const formatted=digits.length===12?`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)}-${digits.slice(9)}`:`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;ui.form.customerTin=formatted;e.target.value=formatted;autosaveDraft();}});
  }
  if(ui.form.documentType==='esi'){
    const lookup=document.querySelector('#esiClientLookup');
    const applySavedClient=()=>{ const name=(lookup?.value||'').trim(); const c=state.clients.find(x=>String(x.name||'').toLowerCase()===name.toLowerCase()); if(!c)return; Object.assign(ui.form,{customerName:c.name||'',customerAddress:c.address||'',customerTin:c.tin||'',customerContact:c.contact||'',customerEmail:c.email||'',customerPhone:c.phone||'',paymentTerms:c.paymentTerms||ui.form.paymentTerms,paymentTermsCustom:c.paymentTermsCustom||ui.form.paymentTermsCustom,currency:c.currency||ui.form.currency}); if(ui.form.currency==='PHP')ui.form.exchangeRate=1; if(!ui.form.dueDate)ui.form.dueDate=dueDateFromTerms(ui.form.date,ui.form.paymentTerms); if(state.settings.autosave)globalThis.WMModuleStore.setItem(AUTOSAVE_KEY,JSON.stringify(ui.form)); render(); toast(`Loaded ${c.name}`); };
    lookup?.addEventListener('change',applySavedClient);
    lookup?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applySavedClient();}});
    document.querySelector('[data-clear-client]')?.addEventListener('click',()=>{Object.assign(ui.form,{customerName:'',customerAddress:'',customerTin:'',customerContact:'',customerEmail:'',customerPhone:'',dueDate:'',poNumber:''}); if(state.settings.autosave)globalThis.WMModuleStore.setItem(AUTOSAVE_KEY,JSON.stringify(ui.form)); render();});
    document.querySelector('[data-reset-rate]')?.addEventListener('click',()=>{ui.form.exchangeRate=1;delete ui.errors.exchangeRate;autosaveDraft();const input=form.querySelector('[name="exchangeRate"]');if(input){input.value='1';input.classList.remove('invalid');input.removeAttribute('aria-invalid');}refreshFinancialDisplay();toast('Exchange rate reset to 1 PHP');});
    form.querySelector('[name="paymentTerms"]')?.addEventListener('change',e=>{const suggested=dueDateFromTerms(ui.form.date,e.target.value); if(suggested&&!ui.form.dueDate){ui.form.dueDate=suggested;autosaveDraft();render();toast('Due date suggested from payment terms');}});
    form.querySelector('[name="customerTin"]')?.addEventListener('blur',e=>{const digits=e.target.value.replace(/\D/g,'').slice(0,12); if([9,12].includes(digits.length)){const formatted=digits.length===12?`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)}-${digits.slice(9)}`:`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`; ui.form.customerTin=formatted;e.target.value=formatted;autosaveDraft();}});
  }
  if(ui.form.documentType==='quotation'){
    const lookup=document.querySelector('#quotationClientLookup');
    const applyQuotationClient=()=>{const name=(lookup?.value||'').trim(),c=state.clients.find(x=>String(x.name||'').toLowerCase()===name.toLowerCase());if(!c)return;Object.assign(ui.form,{customerName:c.name||'',customerAddress:c.address||'',customerTin:c.tin||'',customerContact:c.contact||'',customerEmail:c.email||'',customerPhone:c.phone||'',paymentTerms:c.paymentTerms||ui.form.paymentTerms,paymentTermsCustom:c.paymentTermsCustom||ui.form.paymentTermsCustom,currency:c.currency||ui.form.currency});autosaveDraft();render();toast(`Loaded ${c.name}`);};
    lookup?.addEventListener('change',applyQuotationClient);lookup?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyQuotationClient();}});
    document.querySelector('[data-clear-quotation-client]')?.addEventListener('click',()=>{Object.assign(ui.form,{customerName:'',customerAddress:'',customerTin:'',customerContact:'',customerEmail:'',customerPhone:'',dueDate:'',poNumber:''});autosaveDraft();render();toast('Quotation client details cleared');});
    form.querySelector('[name="customerTin"]')?.addEventListener('blur',e=>{const digits=e.target.value.replace(/\D/g,'').slice(0,12);if([9,12].includes(digits.length)){const formatted=digits.length===12?`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)}-${digits.slice(9)}`:`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;ui.form.customerTin=formatted;e.target.value=formatted;autosaveDraft();}});
    const addQuoteLine=item=>{if(ui.form.items.length>=100)return toast('A Quotation can contain up to 100 lines','error');ui.form.items.push(item);autosaveDraft();render();requestAnimationFrame(()=>stableFocus(document.querySelector(`[data-item-row="${item.id}"] textarea`)));};
    document.querySelector('[data-add-quote-item]')?.addEventListener('click',()=>addQuoteLine(defaultItem()));
    document.querySelector('[data-add-quote-note]')?.addEventListener('click',()=>addQuoteLine(defaultNote()));
    document.querySelector('[data-add-quote-saved]')?.addEventListener('click',()=>{const id=document.querySelector('[data-quote-saved-product]')?.value,p=state.products.find(x=>x.id===id);if(!p)return toast('Choose a saved item first','error');const same=(p.currency||ui.form.currency)===ui.form.currency;addQuoteLine({...defaultItem(),description:p.description||'',unitPrice:same?(Number(p.unitPrice)||0):0});if(!same)toast(`Saved item uses ${p.currency}; description added without carrying price`);});
    form.querySelector('.quotation-item-editor')?.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();addQuoteLine(defaultItem());}});
    document.querySelectorAll('[data-duplicate-quote-item]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.duplicateQuoteItem),src=ui.form.items[idx];if(!src||ui.form.items.length>=100)return toast('A Quotation can contain up to 100 lines','error');ui.form.items.splice(idx+1,0,{...deepCopy(src),id:uid('line')});autosaveDraft();render();toast('Quotation item duplicated');}));
    document.querySelectorAll('[data-move-quote-item]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.moveQuoteItem),dir=b.dataset.direction==='up'?-1:1,target=idx+dir;if(target<0||target>=ui.form.items.length)return;[ui.form.items[idx],ui.form.items[target]]=[ui.form.items[target],ui.form.items[idx]];autosaveDraft();render();requestAnimationFrame(()=>stableFocus(document.querySelector(`[data-item-row="${ui.form.items[target].id}"] textarea`)));}));
    document.querySelectorAll('[data-remove-quote-item]').forEach(b=>b.addEventListener('click',()=>{const idx=Number(b.dataset.removeQuoteItem),item=ui.form.items[idx];if(!item)return;if((item.description?.trim()||itemAmount(item)>0)&&!confirm(`${isRealItem(item)?'Remove this quotation item':'Remove this quotation note'}?`))return;if(ui.form.items.length===1)ui.form.items[0]=defaultItem();else ui.form.items.splice(idx,1);ui.errors.itemRows={};delete ui.errors.items;autosaveDraft();render();}));
    document.querySelector('[data-clear-quote-items]')?.addEventListener('click',()=>{if(ui.form.items.some(i=>i.description?.trim()||itemAmount(i)>0)&&!confirm('Clear all quotation items and notes from this draft?'))return;ui.form.items=[defaultItem()];ui.errors.itemRows={};delete ui.errors.items;autosaveDraft();render();toast('Quotation items cleared');});
    const noteTemplate=document.querySelector('[data-quote-note-template]');noteTemplate?.addEventListener('change',()=>{const tpl=QUOTATION_NOTE_TEMPLATES.find(([k])=>k===noteTemplate.value)?.[1];if(!tpl)return;ui.form.remarks=[String(ui.form.remarks||'').trim(),tpl].filter(Boolean).join('\n\n');if(ui.form.remarks.length>5000)ui.form.remarks=ui.form.remarks.slice(0,5000);autosaveDraft();render();toast('Quick note added');});
    const notes=form.querySelector('textarea[name="remarks"]');notes?.addEventListener('input',()=>{const count=document.querySelector('[data-quote-notes-count]');if(count)count.textContent=`${notes.value.length.toLocaleString()} / 5,000`;});
    const terms=form.querySelector('textarea[name="terms"]');terms?.addEventListener('input',()=>{const count=document.querySelector('[data-quotation-terms-count]');if(count)count.textContent=`${terms.value.length.toLocaleString()} / 10,000`;const badge=document.querySelector('[data-quotation-terms-status]');if(badge){const status=!terms.value.trim()?'Empty':terms.value===DEFAULT_TERMS.quotation?'Standard':'Customized';badge.textContent=status;badge.className=`terms-status ${status.toLowerCase()}`;}});
    document.querySelector('[data-copy-quotation-terms]')?.addEventListener('click',()=>{const text=String(ui.form.terms||'');if(!text.trim())return toast('There are no quotation terms to copy','error');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>toast('Quotation terms copied')).catch(()=>fallbackCopy(text));else fallbackCopy(text);});
    document.querySelector('[data-reset-quotation-terms]')?.addEventListener('click',()=>{if(ui.form.terms===DEFAULT_TERMS.quotation)return;if(ui.form.terms?.trim()&&!confirm('Restore the standard Quotation Terms & Conditions? Current custom terms will be replaced in this draft.'))return;ui.form.terms=DEFAULT_TERMS.quotation;delete ui.errors.terms;autosaveDraft();render();toast('Standard quotation terms restored');});
    document.querySelector('[data-toggle-quotation-terms]')?.addEventListener('click',()=>{const section=document.querySelector('[data-quotation-terms-section]'),button=document.querySelector('[data-toggle-quotation-terms]');section?.classList.toggle('is-expanded');const expanded=section?.classList.contains('is-expanded');button?.setAttribute('aria-expanded',String(Boolean(expanded)));if(button)button.textContent=expanded?'Collapse':'Expand';stableFocus(terms);});
  }
  if(ui.form.documentType==='payment'){
    const lookup=document.querySelector('#paymentClientLookup');
    const applyPaymentClient=()=>{const name=(lookup?.value||'').trim(),c=state.clients.find(x=>String(x.name||'').toLowerCase()===name.toLowerCase());if(!c)return;Object.assign(ui.form,{customerName:c.name||'',customerAddress:c.address||'',customerTin:c.tin||'',customerContact:c.contact||'',customerEmail:c.email||'',customerPhone:c.phone||'',paymentTerms:c.paymentTerms||ui.form.paymentTerms,paymentTermsCustom:c.paymentTermsCustom||ui.form.paymentTermsCustom,currency:c.currency||ui.form.currency});autosaveDraft();render();toast(`Loaded ${c.name}`);};
    lookup?.addEventListener('change',applyPaymentClient);lookup?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyPaymentClient();}});
    document.querySelector('[data-clear-payment-client]')?.addEventListener('click',()=>{Object.assign(ui.form,{customerName:'',customerAddress:'',customerTin:'',customerContact:'',customerEmail:'',customerPhone:'',dueDate:'',poNumber:''});autosaveDraft();render();toast('Payment AR client details cleared');});
    document.querySelector('[data-clear-payment-amount]')?.addEventListener('click',()=>{const key=ui.form.paymentForm==='cheque'?'chequeAmount':'cashAmount';if((Number(ui.form[key])||0)>0&&!confirm('Clear the current payment amount?'))return;ui.form[key]=0;delete ui.errors[key];autosaveDraft();render();toast('Payment amount cleared');});
    form.querySelector('[name="customerTin"]')?.addEventListener('blur',e=>{const digits=e.target.value.replace(/\D/g,'').slice(0,12);if([9,12].includes(digits.length)){const formatted=digits.length===12?`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6,9)}-${digits.slice(9)}`:`${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;ui.form.customerTin=formatted;e.target.value=formatted;autosaveDraft();}});
    const particulars=form.querySelector('textarea[name="paymentParticulars"]');particulars?.addEventListener('input',()=>{const count=document.querySelector('[data-payment-particulars-count]');if(count)count.textContent=`${particulars.value.length.toLocaleString()} / 2,000`;});
    const received=form.querySelector('#paymentReceivedBy'),verified=form.querySelector('#paymentVerifiedBy');
    received?.addEventListener('change',()=>{const old=ui.form.receivedBy;ui.form.receivedBy=received.value;if(old!==received.value)ui.form.receivedAt='';delete ui.errors.receivedBy;autosaveDraft();render();toast(received.value?`Finance receiver assigned to ${received.value}`:'Finance receiver cleared');});
    verified?.addEventListener('change',()=>{const old=ui.form.verifiedBy;ui.form.verifiedBy=verified.value;if(old!==verified.value)ui.form.verifiedAt='';delete ui.errors.verifiedBy;autosaveDraft();render();toast(verified.value?`Admin verifier assigned to ${verified.value}`:'Admin verifier cleared');});
    document.querySelectorAll('[data-capture-payment]').forEach(button=>button.addEventListener('click',()=>{const field=button.dataset.capturePayment,person=field==='receivedAt'?ui.form.receivedBy:ui.form.verifiedBy;if(!person)return toast('Assign responsible personnel first','error');if(person!==state.currentUser.name)return toast(`Only ${person} can capture this timestamp`,'error');ui.form[field]=nowISO();autosaveDraft();render();toast(field==='receivedAt'?'Payment receipt time captured':'Admin verification time captured');}));
    document.querySelector('[data-clear-payment-ack]')?.addEventListener('click',()=>{if(!confirm('Clear the Payment AR Finance and Admin assignments? Captured acknowledgement timestamps will also be removed.'))return;Object.assign(ui.form,{receivedBy:'',receivedAt:'',verifiedBy:'',verifiedAt:''});delete ui.errors.receivedBy;delete ui.errors.verifiedBy;autosaveDraft();render();toast('Payment acknowledgement assignments cleared');});
    const termsArea=form.querySelector('textarea[name="terms"]');
    termsArea?.addEventListener('input',()=>{const count=document.querySelector('[data-payment-terms-count]');if(count)count.textContent=`${termsArea.value.length.toLocaleString()} / 10,000`;const badge=document.querySelector('[data-payment-terms-status]');if(badge){const value=termsArea.value,status=!value.trim()?'Empty':value===DEFAULT_TERMS.payment?'Standard':'Customized';badge.textContent=status;badge.className=`terms-status ${status.toLowerCase()}`;}});
    document.querySelector('[data-copy-payment-terms]')?.addEventListener('click',()=>{const text=String(ui.form.terms||'');if(!text.trim())return toast('There are no Payment AR terms to copy','error');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>toast('Payment AR terms copied')).catch(()=>fallbackCopy(text));else fallbackCopy(text);});
    document.querySelector('[data-reset-payment-terms]')?.addEventListener('click',()=>{if(ui.form.terms===DEFAULT_TERMS.payment)return;if(ui.form.terms?.trim()&&!confirm('Restore the standard Payment Acknowledgement Terms & Conditions? Current custom terms will be replaced in this draft.'))return;ui.form.terms=DEFAULT_TERMS.payment;delete ui.errors.terms;autosaveDraft();render();toast('Standard Payment AR terms restored');});
    document.querySelector('[data-toggle-payment-terms]')?.addEventListener('click',()=>{ui.termsExpanded=!ui.termsExpanded;globalThis.WMModuleStore.setItem(UI_KEY,JSON.stringify({...ui,form:undefined,errors:{},modal:null,companyPanelOpen:false}));const section=document.querySelector('[data-payment-terms-section]'),button=document.querySelector('[data-toggle-payment-terms]');section?.classList.toggle('is-expanded',ui.termsExpanded);if(button){button.setAttribute('aria-expanded',String(ui.termsExpanded));button.textContent=ui.termsExpanded?'Collapse':'Expand';}stableFocus(termsArea);});
  }
  if(ui.form.documentType==='packing'){
    const termsArea=form.querySelector('textarea[name="terms"]');
    termsArea?.addEventListener('input',()=>{const count=document.querySelector('[data-packing-terms-count]');if(count)count.textContent=`${termsArea.value.length.toLocaleString()} / 10,000`;const badge=document.querySelector('[data-packing-terms-status]');if(badge){const value=termsArea.value,status=!value.trim()?'Empty':value===DEFAULT_TERMS.packing?'Standard':'Customized';badge.textContent=status;badge.className=`terms-status ${status.toLowerCase()}`;}});
    document.querySelector('[data-copy-packing-terms]')?.addEventListener('click',()=>{const text=String(ui.form.terms||'');if(!text.trim())return toast('There are no Packing List terms to copy','error');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>toast('Packing List terms copied')).catch(()=>fallbackCopy(text));else fallbackCopy(text);});
    document.querySelector('[data-reset-packing-terms]')?.addEventListener('click',()=>{if(ui.form.terms===DEFAULT_TERMS.packing)return;if(ui.form.terms?.trim()&&!confirm('Restore the standard Packing List Terms & Conditions? Current custom terms will be replaced in this draft.'))return;ui.form.terms=DEFAULT_TERMS.packing;delete ui.errors.terms;autosaveDraft();render();toast('Standard Packing List terms restored');});
    document.querySelector('[data-toggle-packing-terms]')?.addEventListener('click',()=>{ui.termsExpanded=!ui.termsExpanded;globalThis.WMModuleStore.setItem(UI_KEY,JSON.stringify({...ui,form:undefined,errors:{},modal:null,companyPanelOpen:false}));const section=document.querySelector('[data-packing-terms-section]'),button=document.querySelector('[data-toggle-packing-terms]');section?.classList.toggle('is-expanded',ui.termsExpanded);if(button){button.setAttribute('aria-expanded',String(ui.termsExpanded));button.textContent=ui.termsExpanded?'Collapse':'Expand';}stableFocus(termsArea);});
  }
  if(ui.form.documentType==='esi'){
    const termsArea=form.querySelector('textarea[name="terms"]');
    termsArea?.addEventListener('input',()=>{const count=document.querySelector('[data-terms-count]');if(count)count.textContent=`${termsArea.value.length.toLocaleString()} / 10,000`;const badge=document.querySelector('[data-terms-status]');if(badge){const value=termsArea.value,status=!value.trim()?'Empty':value===DEFAULT_TERMS.esi?'Standard':'Customized';badge.textContent=status;badge.className=`terms-status ${status.toLowerCase()}`;}});
    document.querySelector('[data-copy-terms]')?.addEventListener('click',()=>{const text=String(ui.form.terms||'');if(!text.trim())return toast('There are no Terms & Conditions to copy','error');if(navigator.clipboard?.writeText)navigator.clipboard.writeText(text).then(()=>toast('Terms & Conditions copied')).catch(()=>fallbackCopy(text));else fallbackCopy(text);});
    document.querySelector('[data-reset-terms]')?.addEventListener('click',()=>{if(ui.form.terms===DEFAULT_TERMS.esi)return;if(ui.form.terms?.trim()&&!confirm('Restore the standard Electronic SI Terms & Conditions? Your current custom terms will be replaced in this draft.'))return;ui.form.terms=DEFAULT_TERMS.esi;delete ui.errors.terms;autosaveDraft();render();toast('Standard Terms & Conditions restored');});
    document.querySelector('[data-toggle-terms]')?.addEventListener('click',()=>{ui.termsExpanded=!ui.termsExpanded;globalThis.WMModuleStore.setItem(UI_KEY,JSON.stringify({...ui,form:undefined,errors:{},modal:null,companyPanelOpen:false}));const section=document.querySelector('[data-esi-terms-section]');const button=document.querySelector('[data-toggle-terms]');section?.classList.toggle('is-expanded',ui.termsExpanded);if(button){button.setAttribute('aria-expanded',String(ui.termsExpanded));button.textContent=ui.termsExpanded?'Collapse':'Expand';}stableFocus(termsArea);});
  }
  if(ui.form.documentType==='esi'){document.querySelectorAll('[data-scroll-section]').forEach(button=>button.addEventListener('click',()=>{const target=document.getElementById(button.dataset.scrollSection);if(!target)return;target.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'auto':'smooth',block:'start'});requestAnimationFrame(()=>stableFocus(target));document.querySelectorAll('[data-scroll-section]').forEach(x=>x.classList.toggle('active',x===button));}));}
  document.querySelector('[data-template]')?.addEventListener('click',()=>toast('Document template defaults are already applied'));
  document.querySelector('[data-generate-pdf]')?.addEventListener('click',()=>toast('Save the document first to generate its PDF','error'));
  document.querySelectorAll('[data-generate-document-pdf]').forEach(button=>button.addEventListener('click',()=>generateDocumentPdf(button.dataset.generateDocumentPdf)));
  document.querySelector('[data-cancel-form]')?.addEventListener('click',()=>{if(confirm('Discard the current form view? Committed records will not be changed.')){globalThis.WMModuleStore.removeItem(AUTOSAVE_KEY);ui.form=null;ui.editingId=null;setTab('documents')}});
}

function refreshPaymentDisplay(){
  const f=ui.form;if(!f||f.documentType!=='payment')return;const amount=paymentAmount(f);
  document.querySelectorAll('[data-payment-total]').forEach(out=>out.textContent=money(amount,f.currency||'PHP'));
  const footer=document.querySelector('.form-footer>span strong');if(footer)footer.textContent=money(amount,f.currency||'PHP');
}

function refreshFinancialDisplay({announce=false}={}){
  const f=ui.form;if(!f||!TYPES[f.documentType]?.financial)return;
  const c=calc(f),after=Math.max(0,c.subtotal-c.discount),rate=vatRate(f.vatType);
  document.querySelectorAll('[data-line-amount]').forEach(out=>{const idx=Number(out.dataset.lineAmount);if(f.items[idx])out.textContent=money(itemAmount(f.items[idx]),f.currency)});
  const values={subtotal:c.subtotal,discount:c.discount,after,vat:c.vat,total:c.total};
  Object.entries(values).forEach(([key,val])=>document.querySelectorAll(`[data-financial="${key}"]`).forEach(out=>{out.textContent=(key==='discount'?'− ':'')+money(val,f.currency)}));
  document.querySelectorAll('[data-financial-discount-label]').forEach(out=>{out.textContent=`Discount${c.discount>0&&f.discountType==='percentage'?` (${Number(f.discountValue)||0}%)`:''}`;});
  document.querySelectorAll('[data-financial-vat-label]').forEach(out=>{out.textContent=vatLabel(f.vatType);});
  document.querySelectorAll('[data-financial-currency]').forEach(out=>{out.textContent=f.currency;});
  document.querySelectorAll('[data-vat-description]').forEach(out=>{out.textContent=rate?`${Math.round(rate*100)}% VAT is calculated after discount.`:'This selection calculates 0% VAT while preserving its tax classification.';});
  const php=document.querySelector('[data-financial="phpEquivalent"]');if(php&&f.currency!=='PHP'&&Number(f.exchangeRate)>0)php.textContent=money(c.total*Number(f.exchangeRate),'PHP');
  const discountInput=document.querySelector('[name="discountValue"]'),discountError=document.querySelector('#discountError');if(discountInput&&discountError){const raw=Number(f.discountValue)||0;let message='';if(raw<0)message='Discount cannot be negative.';else if(f.discountType==='percentage'&&raw>100)message='Percentage discount cannot exceed 100%.';else if(f.discountType==='fixed'&&raw>c.subtotal)message='Fixed discount cannot exceed the subtotal.';discountInput.classList.toggle('invalid',Boolean(message));if(message)discountInput.setAttribute('aria-invalid','true');else discountInput.removeAttribute('aria-invalid');discountError.hidden=!message;discountError.textContent=message;}
  const reset=document.querySelector('[data-reset-adjustments]');if(reset)reset.disabled=!(c.discount>0||normalizeVatType(f.vatType)!=='zero'||String(f.discountReason||'').trim());
  const status=document.querySelector('[data-financial-status] span:last-child');if(status)status.textContent='Totals are up to date';
  const footer=document.querySelector('.form-footer>span strong');if(footer)footer.textContent=money(c.total,f.currency);
  if(announce){const live=document.querySelector('[data-vat-live]');if(live)live.textContent=`Amount summary updated. Total ${money(c.total,f.currency)}`;}
}

function renderCreateSoft(changed){
  if(['documentType','paymentForm','currency','discountType','status','paymentTerms','validity','deliveryCommitment'].includes(changed)){render();return;}
  if(ui.form?.documentType==='payment'&&['cashAmount','chequeAmount'].includes(changed)){refreshPaymentDisplay();return;}
  if(['vatType','discountValue','exchangeRate'].includes(changed)){refreshFinancialDisplay({announce:changed==='vatType'});return;}
}

function syncFormAndSave(intent){
  const form=document.querySelector('#docForm'); if(form){ new FormData(form).forEach((v,k)=>{ui.form[k]=['discountValue','cashAmount','chequeAmount','exchangeRate'].includes(k)?Number(v):v}); const pricing=form.querySelector('[name="drIncludePricing"]'); if(pricing)ui.form.drIncludePricing=pricing.checked; }
  saveForm(intent);
}



/* ---------- v1.30 professional PDF / print document renderer ---------- */
function pdfSafeLines(value=''){return String(value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);}
function pdfPartyLabel(d){return d.documentType==='po'?'SUPPLIER':d.documentType==='payment'?'PAYOR / CLIENT':'CLIENT';}
function pdfDocTitle(d){return ({esi:'ELECTRONIC SALES INVOICE',packing:'PACKING LIST',delivery:'DELIVERY RECEIPT',payment:'PAYMENT ACKNOWLEDGEMENT RECEIPT',quotation:'QUOTATION',po:'PURCHASE ORDER TO SUPPLIER'})[d.documentType]||createTypeLabel(d.documentType).toUpperCase();}
function pdfTermsHtml(terms=''){
  const lines=String(terms||'').replace(/\r/g,'').split('\n');
  if(!lines.some(x=>x.trim()))return '';
  return lines.map((raw,idx)=>{const line=raw.trim();if(!line)return '<div class="pdf-term-gap"></div>';const h=/^(?:\d+\.?\s+|[A-Z][A-Za-z &/\-]{2,}:?$)/.test(line)&&line.length<95;return h?`<h3>${esc(line)}</h3>`:`<p>${esc(line)}</p>`;}).join('');
}
function pdfApprovalHtml(d){
  const created=d.createdBy||state.currentUser.name||'—', createdAt=d.createdAt?fmtDate(d.createdAt,true):'—';
  if(d.documentType==='delivery')return `<div class="pdf-approval"><div><b>CREATED BY</b><strong>${esc(created)}</strong><small>${esc(createdAt)}</small></div><div><b>CHECKED BY</b><strong>${esc(d.checkedBy||'Pending')}</strong><small>${d.checkedAt?esc(fmtDate(d.checkedAt,true)):'Quality Control'}</small></div><div><b>DELIVERED BY</b><strong>${esc(d.deliveredBy||'Pending')}</strong><small>${d.deliveredAt?esc(fmtDate(d.deliveredAt,true)):'Logistics'}</small></div></div>`;
  if(d.documentType==='payment')return `<div class="pdf-approval"><div><b>CREATED BY</b><strong>${esc(created)}</strong><small>${esc(createdAt)}</small></div><div><b>PAYMENT RECEIVED BY</b><strong>${esc(d.receivedBy||'Pending')}</strong><small>${d.receivedAt?esc(fmtDate(d.receivedAt,true)):'Finance'}</small></div><div><b>VERIFIED BY</b><strong>${esc(d.verifiedBy||'Pending')}</strong><small>${d.verifiedAt?esc(fmtDate(d.verifiedAt,true)):'Admin'}</small></div></div>`;
  const creatorAuthority=(d.documentType==='quotation'&&quotationHasCreatorAuthority(d))||(d.documentType==='po'&&poHasCreatorAuthority(d));
  const reviewLabel=d.documentType==='po'?'REVIEWED BY ACCOUNT MANAGER':'REVIEWED BY';
  return `<div class="pdf-approval"><div><b>CREATED BY</b><strong>${esc(created)}</strong><small>${esc(createdAt)}</small></div><div><b>${reviewLabel}</b><strong>${esc(d.verifiedBy||(creatorAuthority?'Not Applicable':'Pending'))}</strong><small>${d.verifiedAt?esc(fmtDate(d.verifiedAt,true)):(creatorAuthority?'Creator has approval authority':'Review pending')}</small></div><div><b>APPROVED BY</b><strong>${esc(d.approvedBy||(creatorAuthority?'Not Applicable':'Pending'))}</strong><small>${d.approvedAt?esc(fmtDate(d.approvedAt,true)):(creatorAuthority?'Creator is General Manager / final approver':samePerson(d.approvedBy,GENERAL_MANAGER.name)?'General Manager · final approval pending':'Approval pending')}</small></div></div>`;
}
function pdfItemsHtml(d){
  const financial=TYPES[d.documentType]?.financial||(d.documentType==='delivery'&&d.drIncludePricing), serial=d.documentType==='delivery';
  const cols=2+(serial?1:0)+(financial?2:0);
  const rows=(d.items||[]).map((i,idx)=>{if(!isRealItem(i))return `<tr class="pdf-note-row"><td>${idx+1}</td><td colspan="${cols-1}">${esc(i.description||'')}</td></tr>`;return `<tr><td class="num">${idx+1}</td><td>${esc(i.description||'')}</td><td class="num">${esc(i.quantity||'')}</td>${serial?`<td>${esc(i.serialNumber||'—')}</td>`:''}${financial?`<td class="money">${money(i.unitPrice,d.currency)}</td><td class="money strong">${money(itemAmount(i),d.currency)}</td>`:''}</tr>`}).join('');
  return `<table class="pdf-items"><thead><tr><th>#</th><th>MATERIAL DESCRIPTION</th><th>QTY</th>${serial?'<th>SERIAL / ASSET ID</th>':''}${financial?'<th>UNIT PRICE</th><th>TOTAL</th>':''}</tr></thead><tbody>${rows||`<tr><td colspan="${cols}" class="empty">No line items</td></tr>`}</tbody></table>`;
}
function pdfFinancialHtml(d){
  const c=calc(d),after=Math.max(0,c.subtotal-c.discount);
  if(d.documentType==='delivery'&&d.drIncludePricing)return `<div class="pdf-totals"><div class="grand"><span>TOTAL DELIVERED VALUE</span><strong>${money(c.subtotal,d.currency)}</strong></div></div>`;
  if(!TYPES[d.documentType]?.financial)return '';
  const discountLabel=d.discountType==='percentage'&&Number(d.discountValue)>0?`Discount (${Number(d.discountValue)}%)`:'Discount';
  return `<div class="pdf-totals"><div><span>Subtotal</span><strong>${money(c.subtotal,d.currency)}</strong></div><div class="discount"><span>${esc(discountLabel)}</span><strong>-${money(c.discount,d.currency)}</strong></div><div><span>After Discount</span><strong>${money(after,d.currency)}</strong></div><div class="vat"><span>${esc(vatLabel(d.vatType))}</span><strong>${money(c.vat,d.currency)}</strong></div><div class="grand"><span>TOTAL</span><strong>${money(c.total,d.currency)}</strong></div></div>`;
}
function pdfCommercialHtml(d){
  const rows=[];
  const ref=d.poNumber||d.referenceNumber;if(ref)rows.push(['Reference',ref]);
  const pt=resolvedPaymentTerms(d);if(pt)rows.push(['Payment Terms',pt]);
  if(['quotation','po'].includes(d.documentType)){const v=resolvedValidity(d),del=resolvedDeliveryCommitment(d);if(v)rows.push(['Validity',v]);if(del)rows.push(['Delivery',del]);}
  if(d.dueDate)rows.push([d.documentType==='delivery'?'Delivery Date':'Due Date',fmtDate(d.dueDate)]);
  if(d.currency)rows.push(['Currency',d.currency]);
  return rows.map(([k,v])=>`<div><b>${esc(k)}:</b> <span>${esc(v)}</span></div>`).join('');
}
function buildPdfDocumentHtml(d){
  const v=documentVendor(d), t=documentTemplate(d), c=calc(d), addr=pdfSafeLines(v.address), logoUrl=vendorLogoSource(v), qrUrl=v.qrCode||'';
  const partyBits=[d.customerAddress,d.customerContact&&`Contact: ${d.customerContact}`,d.customerEmail&&`Email: ${d.customerEmail}`,d.customerPhone&&`Phone: ${d.customerPhone}`,d.customerTin&&`TIN: ${d.customerTin}`].filter(Boolean);
  const terms=String(d.terms||'').trim();
  const paymentBody=d.documentType==='payment'?`<div class="pdf-payment"><div><span>Form of Payment</span><strong>${esc(d.paymentForm==='cheque'?'Cheque':'Cash')}</strong></div><div><span>Amount Received</span><strong>${money(paymentAmount(d),d.currency||'PHP')}</strong></div>${d.paymentForm==='cheque'?`<div><span>Bank</span><strong>${esc(d.bankName||'—')}</strong></div><div><span>Cheque No.</span><strong>${esc(d.chequeNumber||'—')}</strong></div>`:''}</div><div class="pdf-particulars"><b>Payment Particulars</b><p>${esc(d.paymentParticulars||'—')}</p></div>`:'';
  const notes=d.remarks?`<section class="pdf-notes"><b>ADDITIONAL NOTES</b><p>${esc(d.remarks)}</p></section>`:'';
  // This block is deliberately part of the terminal document flow instead of a fixed print footer.
  // Fixed elements are repeated by browser print engines on every physical page; keeping the QR
  // block in normal flow guarantees it is emitted exactly once, after all document/terms content.
  const finalFooter=`<footer class="pdf-final-footer" aria-label="Final document footer"><div class="pdf-footer-brand">${qrUrl?`<img class="pdf-footer-qr" src="${qrUrl}" alt="QR code for ${esc(v.name)}">`:''}<span>${esc(v.name)}</span></div><span class="pdf-footer-document">${esc(d.documentNumber||'Draft')}</span></footer>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.documentNumber||pdfDocTitle(d))}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  @page{size:A4;margin:13mm 14mm 14mm}:root{--pdf-accent:${esc(t.accent)};--pdf-table-bg:${esc(t.tableBackground)};--pdf-table-text:${esc(t.tableText)};--pdf-rule:${esc(t.ruleColor)}}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#172033;font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;line-height:1.35}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.pdf-page{min-height:260mm}.pdf-header{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(210px,.8fr);gap:28px;align-items:start}.pdf-brand{display:grid;grid-template-columns:${logoUrl?'82px':'0px'} 1fr;gap:14px}.pdf-logo{width:76px;height:76px;object-fit:contain}.pdf-company h1{margin:0 0 4px;color:var(--pdf-accent);font-size:20pt;line-height:1.08}.pdf-company p{margin:1px 0;color:#364153;font-size:9.3pt}.pdf-doc-title{text-align:right}.pdf-doc-title h2{margin:0 0 12px;color:var(--pdf-accent);font-size:23pt;letter-spacing:.02em}.pdf-doc-meta{display:grid;grid-template-columns:64px 1fr;gap:5px 10px;text-align:left;justify-content:end;margin-left:auto;max-width:260px}.pdf-doc-meta b{font-weight:800}.pdf-party-grid{display:grid;grid-template-columns:1fr .95fr;gap:32px;margin:25px 0 20px}.pdf-party h3{margin:0 0 5px;color:#203658;font-size:11pt}.pdf-party strong{display:block;font-size:12.5pt;margin-bottom:3px}.pdf-party p{margin:2px 0;white-space:pre-line}.pdf-commercial{padding-top:3px}.pdf-commercial div{margin:3px 0}.pdf-items{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:12px}.pdf-items th,.pdf-items td{border:1px solid #d9e1ef;padding:5px 7px;vertical-align:top}.pdf-items th{background:var(--pdf-table-bg);color:var(--pdf-table-text);border-top:2px solid var(--pdf-rule);font-size:9.2pt;text-align:left}.pdf-items th:first-child,.pdf-items td:first-child{width:36px;text-align:center}.pdf-items th:nth-last-child(1),.pdf-items th:nth-last-child(2),.pdf-items td.money{text-align:right}.pdf-items .num{text-align:center}.pdf-items .strong{font-weight:800}.pdf-items .pdf-note-row td{background:#f8fafc;font-style:italic;color:#526071}.pdf-items .empty{text-align:center;color:#7b8799}.pdf-totals{width:44%;margin:14px 0 0 auto}.pdf-totals>div{display:grid;grid-template-columns:1fr auto;gap:18px;padding:3px 8px}.pdf-totals .discount{color:#ff6a20}.pdf-totals .vat{color:#72809a}.pdf-totals .grand{margin-top:3px;border-top:1.5px solid #1f2937;padding-top:8px;font-size:13pt;font-weight:800}.pdf-approval{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;border-top:1px solid #cbd5e1;margin-top:25px;padding-top:12px}.pdf-approval b,.pdf-notes>b{display:block;color:#59677d;font-size:8.8pt}.pdf-approval strong{display:block;margin-top:3px;font-size:10.5pt}.pdf-approval small{display:block;margin-top:2px;color:#718096}.pdf-notes{margin:18px 0 0;padding:10px 12px;border-left:3px solid var(--pdf-rule);background:#f8fafc}.pdf-notes p,.pdf-particulars p{white-space:pre-line;margin:5px 0 0}.pdf-payment{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:14px 0}.pdf-payment>div{border:1px solid #d9e1ef;border-radius:6px;padding:10px}.pdf-payment span{display:block;color:#667085;font-size:8.5pt}.pdf-payment strong{display:block;margin-top:3px;font-size:12pt}.pdf-particulars{border:1px solid #d9e1ef;padding:10px 12px;margin-bottom:16px}.pdf-terms-page{${t.termsMode==='new-page'?'break-before:page;page-break-before:always':'break-before:auto;page-break-before:auto'}}.pdf-terms-page header{border-top:1px solid #b9c8df;padding-top:15px;margin-bottom:12px}.pdf-terms-page h2{margin:0;font-size:13.5pt}.pdf-terms{font-size:9.5pt;line-height:1.42}.pdf-terms h3{margin:12px 0 4px;font-size:10pt}.pdf-terms p{margin:2px 0}.pdf-term-gap{height:4px}.pdf-accept{margin-top:30px;width:48%}.pdf-sign-line{height:32px;border-bottom:1px solid #111}.pdf-thanks{margin-top:34px;color:#526071;font-style:italic}.pdf-final-footer{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-top:28px;padding-top:9px;border-top:1px solid #d9e1ef;color:#7f8ba0;font-size:7.5pt;break-inside:avoid;page-break-inside:avoid}.pdf-footer-brand{display:flex;gap:8px;align-items:center;min-width:0}.pdf-footer-brand span{overflow-wrap:anywhere}.pdf-footer-document{white-space:nowrap}.pdf-footer-qr{width:34px;height:34px;object-fit:contain;flex:0 0 auto}@media print{.pdf-page{min-height:auto}.pdf-final-footer{display:flex}}@media screen{body{max-width:1000px;margin:24px auto;padding:0 20px;background:#eef2f7}.pdf-page{background:#fff;padding:20mm 14mm;box-shadow:0 10px 35px rgba(15,23,42,.12)}.pdf-terms-page{margin-top:24px}.pdf-final-footer{display:flex}}
  </style></head><body><main><section class="pdf-page"><header class="pdf-header"><div class="pdf-brand">${logoUrl?`<img class="pdf-logo" src="${logoUrl}" alt="">`:''}<div class="pdf-company"><h1>${esc(v.name)}</h1>${addr.map(x=>`<p>${esc(x)}</p>`).join('')}<p>Tel: ${esc(v.phone||'—')}</p><p>Email: ${esc(v.email||'—')}</p><p>Website: ${esc(v.website||'—')}</p><p>TIN: ${esc(v.tin||'—')}</p></div></div><div class="pdf-doc-title"><h2>${esc(pdfDocTitle(d))}</h2><div class="pdf-doc-meta"><b>No:</b><span>${esc(d.documentNumber||'Draft')}</span><b>Rev:</b><span>${esc(d.referenceNumber||'0')}</span><b>Date:</b><span>${esc(fmtDate(d.date))}</span></div></div></header><section class="pdf-party-grid"><div class="pdf-party"><h3>${pdfPartyLabel(d)}:</h3><strong>${esc(d.customerName||'—')}</strong>${partyBits.map(x=>`<p>${esc(x)}</p>`).join('')}</div><div class="pdf-commercial">${pdfCommercialHtml(d)}</div></section>${paymentBody}${d.documentType!=='payment'?pdfItemsHtml(d):''}${pdfFinancialHtml(d)}${notes}${pdfApprovalHtml(d)}${terms?'':finalFooter}</section>${terms?`<section class="pdf-page pdf-terms-page"><header><h2>${d.documentType==='quotation'?'Standard Terms & Conditions of Sale':'Terms & Conditions'}</h2></header><div class="pdf-terms">${pdfTermsHtml(terms)}</div>${d.documentType==='quotation'?`<div class="pdf-accept"><b>Accepted by: (Client)</b><div class="pdf-sign-line"></div><small>(Printed Name & Signature)</small><div style="height:18px"></div><b>Date:</b><div class="pdf-sign-line"></div></div><p class="pdf-thanks">Thank you for considering ${esc(v.name)}. We appreciate the opportunity to support your requirements.</p>`:''}${finalFooter}</section>`:''}</main><script>window.addEventListener('load',()=>{setTimeout(()=>window.print(),180)});<\/script></body></html>`;
}
function generateDocumentPdf(id){
  const d=state.documents.find(x=>x.id===id);if(!d){toast('Save the document first to generate its PDF','error');return;}
  if(['quotation','po'].includes(d.documentType)&&approvalStatusForDocument(d)!=='Approved'){toast(`${d.documentNumber} must complete its assigned review and final approval before PDF generation.`,'error');return;}
  const win=window.open('','_blank');if(!win){toast('Pop-up blocked. Allow pop-ups to generate the PDF.','error');return;}
  try{win.document.open();win.document.write(buildPdfDocumentHtml(d));win.document.close();addAudit('export','PDF generated',`${d.documentNumber} · ${createTypeLabel(d.documentType)}`);toast('PDF layout opened. Choose Save as PDF in the print dialog.');}catch(err){try{win.close()}catch{};toast(`Unable to generate PDF: ${err.message}`,'error');}
}

function renderModal(type,id){ ui.modal={type,id}; const host=document.querySelector('#modalHost'); if(!host)return; if(type==='preview'){
  const d=state.documents.find(x=>x.id===id); if(!d)return; const v=documentVendor(d),c=calc(d),comments=state.comments[id]||[];
  host.innerHTML=`<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="previewDialogTitle" onclick="event.stopPropagation()"><div class="modal-head"><div><p class="eyebrow">DOCUMENT PREVIEW</p><h3 id="previewDialogTitle">${esc(d.documentNumber)}</h3></div><button class="modal-close" data-close-modal>×</button></div><div class="preview-sheet"><div class="preview-head"><div><strong style="font-size:15px">${esc(v.name)}</strong><small class="doc-sub">${esc(v.address)} · TIN ${esc(v.tin)}</small></div><div style="text-align:right"><div class="preview-title">${esc(TYPES[d.documentType].label)}</div><small>${esc(d.documentNumber)} · ${fmtDate(d.date)}</small></div></div><div class="form-grid"><div><strong>${d.documentType==='po'?'Supplier':'Bill / Deliver to'}</strong><p style="font-size:11px;line-height:1.5">${esc(d.customerName)}<br>${esc(d.customerAddress||'')}<br>${esc(d.customerTin?`TIN ${d.customerTin}`:'')}</p></div><div><strong>Reference</strong><p style="font-size:11px;line-height:1.5">${esc(d.referenceNumber||d.poNumber||'—')}<br>Status: ${esc(d.status)}</p></div></div>${d.documentType==='payment'?`<div class="payment-preview-card"><div><span>Payment method</span><strong>${esc(d.paymentForm==='cheque'?'Cheque':'Cash')}</strong></div><div><span>Amount received</span><strong class="preview-title">${money(d.total||0,d.currency||'PHP')}</strong></div>${d.paymentForm==='cheque'?`<div><span>Bank</span><strong>${esc(d.bankName||'—')}</strong></div><div><span>Cheque number</span><strong>${esc(d.chequeNumber||'—')}</strong></div>`:''}</div><div class="payment-preview-particulars"><strong>Payment particulars</strong><p>${esc(d.paymentParticulars||'—')}</p></div><div class="payment-preview-workflow"><div><span>Received by Finance</span><strong>${esc(d.receivedBy||'—')}</strong><small>${d.receivedAt?esc(fmtDate(d.receivedAt,true)):'Timestamp pending'}</small></div><div><span>Verified by Admin</span><strong>${esc(d.verifiedBy||'—')}</strong><small>${d.verifiedAt?esc(fmtDate(d.verifiedAt,true)):'Timestamp pending'}</small></div></div>`:`<table class="preview-table"><thead><tr><th>Description</th><th>Qty</th>${d.documentType==='delivery'?'<th>Serial No.</th>':''}${TYPES[d.documentType].financial||(d.documentType==='delivery'&&d.drIncludePricing)?'<th>Unit price</th><th>Amount</th>':''}</tr></thead><tbody>${(d.items||[]).map(i=>`<tr><td>${esc(i.description)}</td><td>${esc(i.quantity)}</td>${d.documentType==='delivery'?`<td>${esc(i.serialNumber||'—')}</td>`:''}${TYPES[d.documentType].financial||(d.documentType==='delivery'&&d.drIncludePricing)?`<td>${money(i.unitPrice,d.currency)}</td><td>${money((Number(i.quantity)||0)*(Number(i.unitPrice)||0),d.currency)}</td>`:''}</tr>`).join('')}</tbody></table>${d.documentType==='delivery'&&d.drIncludePricing?`<div class="preview-totals"><div class="grand"><span>Total delivered value</span><strong>${money(c.subtotal,d.currency)}</strong></div></div>`:TYPES[d.documentType].financial?`<div class="preview-totals"><div><span>Subtotal</span><strong>${money(c.subtotal,d.currency)}</strong></div><div><span>Discount${d.discountReason?` · ${esc(d.discountReason)}`:''}</span><strong>− ${money(c.discount,d.currency)}</strong></div><div><span>${esc(vatLabel(d.vatType))}</span><strong>${money(c.vat,d.currency)}</strong></div><div class="grand"><span>Total</span><strong>${money(c.total,d.currency)}</strong></div></div>`:''}`}${['quotation','po'].includes(d.documentType)?`<div class="quotation-preview-meta"><div><span>Validity</span><strong>${esc(resolvedValidity(d)||'—')}</strong></div><div><span>Delivery commitment</span><strong>${esc(resolvedDeliveryCommitment(d)||'—')}</strong></div><div><span>Payment terms</span><strong>${esc(resolvedPaymentTerms(d)||'—')}</strong></div></div>${d.remarks?`<div class="payment-preview-particulars"><strong>Additional notes</strong><p>${esc(d.remarks)}</p></div>`:''}`:''}<p style="font-size:10px;line-height:1.55;margin-top:24px"><strong>Terms:</strong> ${esc(d.terms||'')}</p></div>
  <div style="margin-top:18px"><div class="section-head"><div><p class="eyebrow">DISCUSSION</p><h3>Comments</h3></div><span>${comments.length}</span></div>${comments.map(c=>`<article class="activity-item"><div class="activity-icon">${esc(c.user.slice(0,1))}</div><div><strong>${esc(c.user)}</strong><small>${esc(c.text)}</small></div><time>${fmtDate(c.at,true)}</time></article>`).join('')||'<div class="notice">No comments yet.</div>'}<form id="commentForm" style="margin-top:12px"><textarea name="comment" required placeholder="Add an internal workflow note…"></textarea><div class="modal-actions"><button type="button" data-close-modal>Close</button><button type="button" class="button" data-print>Print / PDF</button><button type="submit" class="button primary">Add comment</button></div></form></div></section></div>`;
  enhanceTradeLinkPresentation(host); document.querySelectorAll('[data-close-modal]').forEach(el=>el.addEventListener('click',closeModal)); requestAnimationFrame(()=>stableFocus(document.querySelector('.modal-close'))); document.querySelector('[data-print]')?.addEventListener('click',()=>generateDocumentPdf(id)); document.querySelector('#commentForm')?.addEventListener('submit',e=>{e.preventDefault();addComment(id,new FormData(e.currentTarget).get('comment')||'')});
  }
}
function closeModal(){ ui.modal=null; const host=document.querySelector('#modalHost'); if(host)host.innerHTML=''; }
function exportState(){ const blob=new Blob([JSON.stringify({schema:'TradeLinkBackup',version:APP_VERSION,exportedAt:nowISO(),state,vendorAssets:collectVendorAssets()},null,2)],{type:'application/json'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`TradeLink-backup-${todayISO()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);addAudit('export','Backup exported',`${state.documents.length} documents`);toast('Backup exported'); }

function importInput(){
  let input=document.querySelector('#importFile');
  if(input)return input;
  input=document.createElement('input');
  input.id='importFileRuntime';
  input.type='file';
  input.accept='application/json,.json';
  input.hidden=true;
  input.setAttribute('aria-hidden','true');
  input.addEventListener('change',importState);
  document.body.appendChild(input);
  return input;
}

function openImportPicker(){
  const input=importInput();
  if(!input || input.disabled)return;
  input.value='';
  try{input.click()}catch(error){toast(`Unable to open the backup picker: ${error.message}`,'error')}
}

function sanitizeImportedState(raw){
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw new Error('Backup state is missing or invalid.');
  const out={};
  ['version','createdAt','updatedAt','selectedVendorId'].forEach(k=>{if(raw[k]!==undefined)out[k]=raw[k]});
  if(raw.currentUser!==undefined)out.currentUser=raw.currentUser;
  if(raw.vendors!==undefined)out.vendors=raw.vendors;
  if(raw.counters!==undefined)out.counters=raw.counters;
  if(raw.documents!==undefined)out.documents=raw.documents;
  if(raw.audit!==undefined)out.audit=raw.audit;
  if(raw.comments!==undefined)out.comments=raw.comments;
  if(raw.snapshots!==undefined)out.snapshots=raw.snapshots;
  if(raw.clients!==undefined)out.clients=raw.clients;
  if(raw.suppliers!==undefined)out.suppliers=raw.suppliers;
  if(raw.products!==undefined)out.products=raw.products;
  if(raw.settings!==undefined)out.settings=raw.settings;
  return out;
}

function validateImportedBackup(parsed,file){
  if(!parsed || typeof parsed!=='object' || Array.isArray(parsed))throw new Error('The selected file does not contain a TradeLink backup object.');
  if(parsed.schema && parsed.schema!=='TradeLinkBackup')throw new Error(`Unsupported backup schema "${parsed.schema}". Select a full TradeLink backup exported with Export backup.`);
  const incoming=sanitizeImportedState(parsed.state||parsed);
  if(!Array.isArray(incoming.documents))throw new Error('Backup is missing the documents collection.');
  if(incoming.documents.length>100000)throw new Error('Backup contains too many documents to import safely.');
  const arrayFields=['audit','snapshots','clients','suppliers','products','vendors'];
  for(const key of arrayFields)if(incoming[key]!==undefined&&!Array.isArray(incoming[key]))throw new Error(`Backup field "${key}" has an invalid format.`);
  if(incoming.comments!==undefined && (!incoming.comments || typeof incoming.comments!=='object' || Array.isArray(incoming.comments)))throw new Error('Backup comments have an invalid format.');
  if(incoming.counters!==undefined && (!incoming.counters || typeof incoming.counters!=='object' || Array.isArray(incoming.counters)))throw new Error('Backup counters have an invalid format.');
  if(incoming.settings!==undefined && (!incoming.settings || typeof incoming.settings!=='object' || Array.isArray(incoming.settings)))throw new Error('Backup settings have an invalid format.');
  for(let i=0;i<incoming.documents.length;i++){
    const doc=incoming.documents[i];
    if(!doc || typeof doc!=='object' || Array.isArray(doc))throw new Error(`Document ${i+1} is invalid.`);
    if(!TYPES[doc.documentType])throw new Error(`Document ${i+1} uses unsupported type "${doc.documentType||'unknown'}".`);
    if(doc.items!==undefined && !Array.isArray(doc.items))throw new Error(`Document ${doc.documentNumber||i+1} has an invalid items collection.`);
  }
  const normalized=normalizeState(incoming);
  const sourceVersion=String(parsed.version||incoming.version||'legacy');
  const hasVendorAssets=Object.prototype.hasOwnProperty.call(parsed,'vendorAssets');
  const vendorAssets=hasVendorAssets&&parsed.vendorAssets&&typeof parsed.vendorAssets==='object'&&!Array.isArray(parsed.vendorAssets)?parsed.vendorAssets:{};
  for(const [id,data] of Object.entries(vendorAssets)){if(!normalized.vendors.some(v=>v.id===id))continue;if(data?.logo&&!validImageData(data.logo))throw new Error(`Backup contains an invalid logo for ${id}.`);if(data?.qrCode&&!validImageData(data.qrCode))throw new Error(`Backup contains an invalid QR code for ${id}.`);}
  return {incoming,normalized,vendorAssets,hasVendorAssets,sourceVersion,exportedAt:parsed.exportedAt||'',fileName:file?.name||'backup.json'};
}

function makeRecoverySnapshot(sourceState,label){
  const data={...deepCopy(sourceState),snapshots:[]},vendorAssets=collectVendorAssets();
  const encoded=JSON.stringify({data,vendorAssets});
  return {id:uid('snapshot'),at:nowISO(),label,hash:simpleHash(encoded),data,vendorAssets};
}

async function importState(e){
  const input=e?.target;
  const file=input?.files?.[0];
  if(!file)return;
  const MAX_BACKUP_BYTES=25*1024*1024;
  let previousState=null, previousPrimary=null, previousBackup=null, previousVendorAssets=null;
  try{
    if(file.size>MAX_BACKUP_BYTES)throw new Error('Backup exceeds the 25 MB safety limit.');
    if(file.name && !/\.json$/i.test(file.name) && file.type!=='application/json')throw new Error('Select a JSON backup file.');
    let text;
    try{text=await file.text()}catch{throw new Error('The backup file could not be read.');}
    let parsed;
    try{parsed=JSON.parse(text)}catch{throw new Error('The backup contains invalid JSON.');}
    const check=validateImportedBackup(parsed,file);
    const importedCount=check.normalized.documents.length;
    const when=check.exportedAt?`\nExported: ${fmtDate(check.exportedAt,true)}`:'';
    if(!confirm(`Import ${importedCount} document${importedCount===1?'':'s'} from ${check.fileName}?${when}\n\nThis replaces the current cloud workspace. A recovery snapshot of the current workspace will be retained.`))return;

    previousState=deepCopy(state);
    previousPrimary=globalThis.WMModuleStore.getItem(STORAGE_KEY);
    previousBackup=globalThis.WMModuleStore.getItem(BACKUP_KEY);
    previousVendorAssets=collectVendorAssets();
    const recovery=makeRecoverySnapshot(previousState,`Pre-import · ${check.fileName}`);
    const imported=check.normalized;
    const importedSnapshots=Array.isArray(imported.snapshots)?imported.snapshots:[];
    const existingSnapshots=Array.isArray(previousState.snapshots)?previousState.snapshots:[];
    imported.snapshots=[recovery,...existingSnapshots,...importedSnapshots]
      .filter((snap,index,list)=>snap&&snap.id&&list.findIndex(x=>x?.id===snap.id)===index)
      .slice(0,12);
    imported.version=APP_VERSION;
    state=imported;
    if(check.hasVendorAssets)restoreVendorAssets(check.vendorAssets||{}, {clear:true});
    addAudit('import','Backup imported',`${check.fileName} · ${importedCount} documents · source ${check.sourceVersion}`,null,false);
    persist('import backup',false);
    globalThis.WMModuleStore.removeItem(AUTOSAVE_KEY);
    ui.editingId=null;ui.form=null;ui.errors={};ui.modal=null;ui.selectedDocumentIds=[];ui.page=1;ui.tab='documents';
    persistDocumentView();
    syncRoute('documents',true);
    render();
    toast(`Backup imported · ${importedCount} document${importedCount===1?'':'s'} restored`);
  }catch(err){
    if(previousState){
      state=previousState;
      try{
        if(previousPrimary===null)globalThis.WMModuleStore.removeItem(STORAGE_KEY);else globalThis.WMModuleStore.setItem(STORAGE_KEY,previousPrimary);
        if(previousBackup===null)globalThis.WMModuleStore.removeItem(BACKUP_KEY);else globalThis.WMModuleStore.setItem(BACKUP_KEY,previousBackup);
        restoreVendorAssets(previousVendorAssets||{}, {clear:true});
      }catch{}
    }
    toast(`Import failed: ${err.message}`,'error');
  }finally{
    if(input)input.value='';
  }
}
function resetApp(){ if(!confirm('Reset all TradeLink cloud data? This is destructive. Export or snapshot first.'))return; if(!confirm('Final confirmation: permanently remove all cloud documents, audit events, and settings?'))return; for(const v of state.vendors){deleteVendorAsset(v.id,'logo');deleteVendorAsset(v.id,'qr')} globalThis.WMModuleStore.removeItem(STORAGE_KEY);globalThis.WMModuleStore.removeItem(BACKUP_KEY);globalThis.WMModuleStore.removeItem(AUTOSAVE_KEY);state=initialState();persist('reset',false);ui={...ui,tab:'create',editingId:null,form:null,modal:null};syncRoute('create',true);render();toast('TradeLink reset'); }

document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(ui.modal){e.preventDefault();closeModal();return;}if(ui.companyPanelOpen){e.preventDefault();ui.companyPanelOpen=false;render();requestAnimationFrame(()=>stableFocus(document.querySelector('#vendorTrigger')));}});

window.addEventListener('hashchange',()=>{ const requested=location.hash; const next=ROUTE_TABS[requested]||LEGACY_ROUTE_REDIRECTS[requested]||'create'; if(requested==='#/activity')ui.recoveryPane='activity'; if(ui.tab!==next){ui.tab=next;ui.modal=null;render();window.scrollTo({top:0,behavior:scrollBehavior()});} if(location.hash!==TAB_ROUTES[next])syncRoute(next,true); });
window.addEventListener('storage',e=>{ if(e.key===STORAGE_KEY&&e.newValue){try{state=normalizeState(JSON.parse(e.newValue));render();toast('Cloud data synchronized')}catch{}} });
window.addEventListener('beforeunload',()=>{if(state.settings.autosave&&ui.form)try{globalThis.WMModuleStore.setItem(AUTOSAVE_KEY,JSON.stringify(ui.form))}catch{}});

if(!state.audit.length){ addAudit('system','TradeLink initialized',`Authenticated cloud edition v${APP_VERSION}`,null,false); persist('initialization',false); }
syncRoute(ui.tab,true);
render();
