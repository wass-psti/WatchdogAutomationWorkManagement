const { LOCATIONS, DEPARTMENTS, ROLES, DEFAULT_ROLE, RBAC_KEY, RBAC_BACKUP_KEY, PERMISSIONS, ROLE_DEFINITIONS, ADMIN_ROLES, ATTENDANCE_POLICY, AUTO_GPS_CACHE_KEY, AUTO_GPS_FALLBACK_MAX_AGE_MS, AUTO_GPS_RETRY_DELAY_MS, STORAGE_KEY, BACKUP_KEY, UI_KEY, AUDIT_KEY, AUDIT_BACKUP_KEY, OT_KEY, OT_BACKUP_KEY, OT_ACTIVITY_KEY, OT_ACTIVITY_BACKUP_KEY, PH_HOLIDAYS_2026 } = globalThis.WMTimeTrackerDomain || (() => { throw new Error('TimeTracker domain configuration failed to load.'); })();
const emptyState = () => ({ version: 1, records: [], selection: { location: '', department: '' } });
const emptyUi = () => ({
  clock: { selection: { location: '', department: '' } },
  overview: { query: '', location: '', department: '', status: 'all', sort: 'newest', lateAfter: '08:00', whereaboutsExpanded: true, attendanceFilter: 'all' },
  log: { query: '', status: 'all', department: '', location: '', from: '', to: '', sort: 'newest', expanded: [] },
  audit: { query: '', action: 'all', from: '', to: '', sort: 'newest' },
  map: { eventType: 'all', maxAccuracy: '250' },
  gps: { enabled: true, required: true, highAccuracy: true },
  reports: { preset: '30d', department: '', location: '', from: '', to: '' },
  calendar: { cursor: monthKey(new Date()), selected: localDateKey(new Date()), customEvents: [] },
  ot: { query: '', status: 'all', scope: 'accessible', sort: 'newest', from: '', to: '', activityOpen: false },
});


function cloudPrincipal() {
  const ctx = globalThis.WM_IDENTITY_CONTEXT;
  const timestamp = new Date().toISOString();
  const id = `cloud:${ctx?.user?.id || uid()}`;
  return { id, name: ctx?.user?.displayName || ctx?.user?.email || 'Authenticated User', email: ctx?.user?.email || '', role: ROLES.includes(ctx?.module?.role) ? ctx.module.role : DEFAULT_ROLE, department: '', active: true, createdAt: timestamp, updatedAt: timestamp, source: 'work-management-cloud' };
}
function emptyRbac() {
  const user = cloudPrincipal();
  return { version: 1, currentUserId: user.id, users: [user], bootstrappedAt: new Date().toISOString() };
}
function parseRbac(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.users) || !value.currentUserId) return null;
    value.users = value.users.filter((u) => u && u.id && ROLES.includes(u.role)).map((u) => ({ ...u, role: ROLES.includes(u.role) ? u.role : DEFAULT_ROLE, active: u.active !== false }));
    return value.users.some((u) => u.id === value.currentUserId) ? value : null;
  } catch { return null; }
}
function loadRbac() {
  const current = cloudPrincipal();
  const directory = Array.isArray(globalThis.WMModuleDirectory) ? globalThis.WMModuleDirectory : [];
  const users = directory.map((entry) => {
    const id = `cloud:${entry.id}`;
    const recent = state?.records?.find?.((record) => record.ownerId === id);
    return {
      id,
      name: entry.display_name || entry.email || 'User',
      email: entry.email || '',
      role: ROLES.includes(entry.module_role) ? entry.module_role : DEFAULT_ROLE,
      department: recent?.clockIn?.department || '',
      active: entry.status !== 'disabled',
      source: 'work-management-cloud-directory',
    };
  });
  const existing = users.find((u) => u.id === current.id);
  if (existing) Object.assign(existing, { ...current, department: existing.department || current.department });
  else users.push(current);
  return { version: 2, currentUserId: current.id, users, source: 'work-management-cloud-directory' };
}
function saveRbac() {
  // Work Management / Supabase is authoritative for account and module roles.
  // TimeTracker never persists a second independent authorization directory.
  return true;
}
function currentUser() {
  return rbac.users.find((u) => u.id === rbac.currentUserId) || rbac.users[0];
}
function roleDefinition(role = currentUser()?.role) { return ROLE_DEFINITIONS[role] || ROLE_DEFINITIONS[DEFAULT_ROLE]; }

function isSystemAdmin() { return currentUser()?.role === 'System Admin'; }
function shouldShowWorkNote(location = state.selection.location) {
  return location === 'Offsite (Home)' && !isSystemAdmin();
}
function requiresWorkNote(location = state.selection.location) {
  return shouldShowWorkNote(location);
}
function currentWorkNoteRequirement() {
  return requiresWorkNote(state.selection.location);
}
function hasPermission(permission, user = currentUser()) { return Boolean(user?.active !== false && roleDefinition(user?.role).permissions.includes(permission)); }
function requirePermission(permission, message = 'You do not have permission to perform this action.') {
  if (hasPermission(permission)) return true;
  notify(message, 'error');
  return false;
}
function userById(id) { return rbac.users.find((u) => u.id === id) || null; }
function recordOwner(record) { return userById(record.ownerId) || currentUser(); }
function canAccessRecord(record) {
  const me = currentUser();
  if (!me || me.active === false) return false;
  if (hasPermission(PERMISSIONS.LOG_VIEW_ALL, me)) return true;
  if (hasPermission(PERMISSIONS.LOG_VIEW_TEAM, me)) return record.ownerId === me.id || (recordOwner(record)?.department && recordOwner(record).department === me.department);
  return record.ownerId === me.id;
}
function accessibleRecords() { return state.records.filter(canAccessRecord); }
function ownRecords() { const id = currentUser()?.id; return state.records.filter((r) => r.ownerId === id); }
function roleCanAssign(targetRole) {
  if (!ROLES.includes(targetRole)) return false;
  if (ADMIN_ROLES.has(targetRole)) return hasPermission(PERMISSIONS.ROLE_ASSIGN_ADMIN);
  return hasPermission(PERMISSIONS.ROLE_ASSIGN_STANDARD) || hasPermission(PERMISSIONS.ROLE_ASSIGN_ADMIN);
}

const fmtTime = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fmtTimeShort = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const fmtDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtFullDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const fmtMonthYear = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

// Shared presentation-system class adapters. TimeTracker remains business-logic
// compatible while its rendered screens converge on the Work Management UI system.

let state = loadState();
let ui = loadUi();
state.selection = { ...state.selection, ...(ui.clock?.selection || {}) };
let rbac = loadRbac();
ui.log.expanded = (Array.isArray(ui.log.expanded) ? ui.log.expanded : []).filter((id) => state.records.some((record) => record.id === id));
let view = 'clock';
let now = Date.now();
let note = '';
let toastTimer = null;
let tickTimer = null;
let pageAnimationClass = 'page-enter';
let editingRecordId = null;
let audit = loadAudit();
let ot = loadOt();
let otActivity = loadOtActivity();
let editingOtRequestId = null;
let modalReturnFocus = null;
let modalKeyHandler = null;
let gpsDraft = null;
let gpsBusy = false;
let attendanceActionBusy = false;
let leafletMap = null;
let leafletLayer = null;
let leafletRecordId = null;

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `tt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function localDateKey(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(value, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseState(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.records) || !value.selection) return null;
    return value;
  } catch {
    return null;
  }
}

function loadState() {
  // The authenticated cloud primary is the only runtime authority. Recovery copies
  // are deliberately NOT auto-promoted: the previous local-era fallback could
  // resurrect a pre-clock-out backup and make a completed shift appear active again.
  const primary = parseState(globalThis.WMModuleStore.getItem(STORAGE_KEY));
  if (primary) return primary;
  return emptyState();
}


function loadUi() {
  try {
    const raw = JSON.parse(globalThis.WMModuleStore.getItem(UI_KEY) || 'null');
    const base = emptyUi();
    return {
      clock: { ...base.clock, ...(raw?.clock || {}), selection: { ...base.clock.selection, ...(raw?.clock?.selection || {}) } },
      overview: { ...base.overview, ...(raw?.overview || {}) },
      log: { ...base.log, ...(raw?.log || {}) },
      audit: { ...base.audit, ...(raw?.audit || {}) },
      map: { ...base.map, ...(raw?.map || {}) },
      gps: { ...base.gps },
      reports: { ...base.reports, ...(raw?.reports || {}) },
      calendar: { ...base.calendar, ...(raw?.calendar || {}), customEvents: Array.isArray(raw?.calendar?.customEvents) ? raw.calendar.customEvents : [] },
      ot: { ...base.ot, ...(raw?.ot || {}) },
    };
  } catch {
    return emptyUi();
  }
}

function saveState() {
  // Attendance records are shared workspace data. Clock form selection is a per-account UI preference
  // and must never be allowed to overwrite another employee's active form state.
  if (typeof ui !== 'undefined') {
    ui.clock = ui.clock || { selection: { location: '', department: '' } };
    ui.clock.selection = { ...state.selection };
    saveUi();
  }
  const current = globalThis.WMModuleStore.getItem(STORAGE_KEY);
  if (current) globalThis.WMModuleStore.setItem(BACKUP_KEY, current);
  const shared = { ...state, selection: { location: '', department: '' } };
  globalThis.WMModuleStore.setItem(STORAGE_KEY, JSON.stringify(shared));
}

async function saveStateConfirmed() {
  // Critical attendance actions do not report success until Supabase confirms the
  // authoritative shared state write. This prevents a transient in-memory clock
  // state from being mistaken for a durable attendance record.
  if (typeof ui !== 'undefined') {
    ui.clock = ui.clock || { selection: { location: '', department: '' } };
    ui.clock.selection = { ...state.selection };
    try {
      if (globalThis.WMModuleStore.setItemAsync) await globalThis.WMModuleStore.setItemAsync(UI_KEY, JSON.stringify(ui));
      else globalThis.WMModuleStore.setItem(UI_KEY, JSON.stringify(ui));
    } catch (error) {
      console.warn('Clock UI preference could not be synchronized; attendance persistence will continue.', error);
    }
  }
  const current = globalThis.WMModuleStore.getItem(STORAGE_KEY);
  if (current) {
    try {
      if (globalThis.WMModuleStore.setItemAsync) await globalThis.WMModuleStore.setItemAsync(BACKUP_KEY, current);
      else globalThis.WMModuleStore.setItem(BACKUP_KEY, current);
    } catch (error) {
      console.warn('Attendance recovery-copy update failed; primary commit will still be attempted.', error);
    }
  }
  const shared = { ...state, selection: { location: '', department: '' } };
  if (globalThis.WMModuleStore.setItemAsync) await globalThis.WMModuleStore.setItemAsync(STORAGE_KEY, JSON.stringify(shared));
  else {
    globalThis.WMModuleStore.setItem(STORAGE_KEY, JSON.stringify(shared));
    await globalThis.WMModuleStore.flush?.();
  }
}

function saveUi() {
  globalThis.WMModuleStore.setItem(UI_KEY, JSON.stringify(ui));
}


function parseAudit(raw) {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function loadAudit() {
  // Cloud backup keys are recovery material only. Never silently hydrate runtime
  // state from them because they intentionally lag the primary by one write.
  return parseAudit(globalThis.WMModuleStore.getItem(AUDIT_KEY));
}


function saveAudit() {
  const current = globalThis.WMModuleStore.getItem(AUDIT_KEY);
  if (current) globalThis.WMModuleStore.setItem(AUDIT_BACKUP_KEY, current);
  globalThis.WMModuleStore.setItem(AUDIT_KEY, JSON.stringify(audit));
}


function parseOt(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.requests)) return null;
    return value;
  } catch { return null; }
}
function loadOt() {
  // The primary cloud record is authoritative. Recovery copies are intentionally
  // never auto-promoted because a lagging backup can resurrect withdrawn, approved,
  // or otherwise superseded OT state after refresh or authentication changes.
  const primary = parseOt(globalThis.WMModuleStore.getItem(OT_KEY));
  return primary || { version: 1, requests: [] };
}
function saveOt() {
  const current = globalThis.WMModuleStore.getItem(OT_KEY);
  if (current) globalThis.WMModuleStore.setItem(OT_BACKUP_KEY, current);
  globalThis.WMModuleStore.setItem(OT_KEY, JSON.stringify(ot));
}
function parseOtActivity(raw) {
  if (!raw) return [];
  try { const value = JSON.parse(raw); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function loadOtActivity() {
  return parseOtActivity(globalThis.WMModuleStore.getItem(OT_ACTIVITY_KEY));
}

function saveOtActivity() {
  const current = globalThis.WMModuleStore.getItem(OT_ACTIVITY_KEY);
  if (current) globalThis.WMModuleStore.setItem(OT_ACTIVITY_BACKUP_KEY, current);
  globalThis.WMModuleStore.setItem(OT_ACTIVITY_KEY, JSON.stringify(otActivity));
}
function otActivityEvent(action, request, details = {}) {
  const actor = currentUser();
  otActivity.unshift({
    id: uid(), timestamp: new Date().toISOString(), action,
    requestId: request?.id || details.requestId || null,
    actorId: actor?.id || null, actorName: actor?.name || 'Unknown', actorRole: actor?.role || DEFAULT_ROLE,
    ownerId: request?.ownerId || details.ownerId || null,
    status: request?.status || details.status || null,
    message: details.message || '', changes: details.changes || null,
    metadata: deviceMetadata(),
  });
  otActivity = otActivity.slice(0, 5000);
  saveOtActivity();
}
function otRequestOwner(request) { return userById(request?.ownerId) || null; }
function accessibleOtActivity() { return hasPermission(PERMISSIONS.OT_ACTIVITY_VIEW) ? otActivity : []; }
function isOtApprover(user = currentUser()) { return hasPermission(PERMISSIONS.OT_APPROVE, user); }
function canAccessOtRequest(request, user = currentUser()) {
  if (!request || !user || user.active === false) return false;
  if (ADMIN_ROLES.has(user.role)) return true;
  if (user.role === 'Supervisor') return request.ownerId === user.id || (otRequestOwner(request)?.department && otRequestOwner(request).department === user.department);
  return request.ownerId === user.id;
}
function canApproveOtRequest(request, user = currentUser()) {
  if (!request || !user || !isOtApprover(user) || request.status !== 'Submitted') return false;
  if (request.ownerId === user.id) return false;
  if (ADMIN_ROLES.has(user.role)) return true;
  return user.role === 'Supervisor' && otRequestOwner(request)?.department === user.department;
}
function canEditOtRequest(request, user = currentUser()) {
  return Boolean(request && user && request.ownerId === user.id && ['Draft','Rejected'].includes(request.status));
}
function canSubmitOtRequest(request, user = currentUser()) { return canEditOtRequest(request, user); }
function canWithdrawOtRequest(request, user = currentUser()) { return Boolean(request && user && request.ownerId === user.id && request.status === 'Submitted'); }
function otDurationMinutes(date, start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date||'') || !/^\d{2}:\d{2}$/.test(start||'') || !/^\d{2}:\d{2}$/.test(end||'')) return null;
  const startAt = new Date(`${date}T${start}:00`); let endAt = new Date(`${date}T${end}:00`);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return null;
  if (endAt <= startAt) endAt = new Date(endAt.getTime() + 24*60*60*1000);
  const minutes = Math.round((endAt-startAt)/60000);
  return minutes > 0 ? minutes : null;
}
function otDurationText(minutes) {
  const m=Math.max(0,Number(minutes)||0), h=Math.floor(m/60), rem=m%60;
  return h ? `${h}h${rem?` ${rem}m`:''}` : `${rem}m`;
}
function validateOtPayload(data) {
  const date=String(data.date||''), start=String(data.start||''), end=String(data.end||''), reason=String(data.reason||'').trim(), task=String(data.task||'').trim();
  const location=String(data.location||'');
  const durationMinutes=otDurationMinutes(date,start,end);
  if (!parseLocalDate(date)) return { error:'Select a valid overtime date.' };
  if (!durationMinutes) return { error:'Enter a valid OT start and end time.' };
  if (durationMinutes < 15) return { error:'OT duration must be at least 15 minutes.' };
  if (durationMinutes > 16*60) return { error:'OT duration cannot exceed 16 hours in one request.' };
  if (!reason || reason.length < 5) return { error:'Provide a meaningful OT justification of at least 5 characters.' };
  if (!task || task.length < 2) return { error:'Provide the project, task, or work item for this OT request.' };
  if (location && !LOCATIONS.includes(location)) return { error:'Select a valid OT work location.' };
  return { value:{date,start,end,durationMinutes,reason,task,location:location||null} };
}
function otAccessibleRequests() { return ot.requests.filter((r)=>canAccessOtRequest(r)); }
function otFilteredRequests() {
  const q=(ui.ot.query||'').trim().toLowerCase();
  let rows=otAccessibleRequests().filter((r)=>{
    if (ui.ot.status!=='all' && r.status!==ui.ot.status) return false;
    if (ui.ot.from && r.date<ui.ot.from) return false;
    if (ui.ot.to && r.date>ui.ot.to) return false;
    if (ui.ot.scope==='mine' && r.ownerId!==currentUser()?.id) return false;
    if (q) {
      const owner=otRequestOwner(r); const hay=[r.id,owner?.name,r.status,r.task,r.reason,r.location,owner?.department].filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  rows.sort((a,b)=>{
    if(ui.ot.sort==='oldest') return new Date(a.createdAt)-new Date(b.createdAt);
    if(ui.ot.sort==='date') return a.date.localeCompare(b.date)||a.start.localeCompare(b.start);
    if(ui.ot.sort==='duration') return b.durationMinutes-a.durationMinutes;
    return new Date(b.updatedAt)-new Date(a.updatedAt);
  });
  return rows;
}
function otStatusClass(status='Draft') { return status.toLowerCase().replace(/\s+/g,'-'); }
function createOtRequest(payload, submitNow=false) {
  if (!requirePermission(PERMISSIONS.OT_CREATE,'Your role cannot create OT requests.')) return;
  const user=currentUser(); const nowIso=new Date().toISOString();
  const request={id:`OT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,ownerId:user.id,ownerName:user.name,ownerDepartment:user.department,...payload,status:submitNow?'Submitted':'Draft',createdAt:nowIso,updatedAt:nowIso,submittedAt:submitNow?nowIso:null,decision:null};
  ot.requests.unshift(request); saveOt();
  otActivityEvent('OT_CREATED',request,{message:'OT request created.'});
  if(submitNow) otActivityEvent('OT_SUBMITTED',request,{message:'OT request submitted for approval.'});
  closeModal(); render({animate:false}); notify(submitNow?'OT request created and submitted.':'OT draft created.','success');
}
function updateOtRequest(id,payload,submitNow=false) {
  const r=ot.requests.find((x)=>x.id===id); if(!r||!canEditOtRequest(r)) return notify('This OT request cannot be modified.','error');
  const before=JSON.parse(JSON.stringify(r)); Object.assign(r,payload,{updatedAt:new Date().toISOString()});
  if(r.status==='Rejected'){ r.status='Draft'; r.decision=null; }
  saveOt(); otActivityEvent('OT_MODIFIED',r,{message:'OT request modified.',changes:{before,after:JSON.parse(JSON.stringify(r))}});
  if(submitNow) submitOtRequest(id,true); else { closeModal(); render({animate:false}); notify('OT request updated.','success'); }
}
function submitOtRequest(id,fromEdit=false) {
  const r=ot.requests.find((x)=>x.id===id); if(!r||!canSubmitOtRequest(r)) return notify('Only your Draft or Rejected OT request can be submitted.','error');
  r.status='Submitted'; r.submittedAt=new Date().toISOString(); r.updatedAt=r.submittedAt; r.decision=null; saveOt(); otActivityEvent('OT_SUBMITTED',r,{message:'OT request submitted for approval.'});
  if(fromEdit) closeModal(); render({animate:false}); notify('OT request submitted for approval.','success');
}
function withdrawOtRequest(id) {
  const r=ot.requests.find((x)=>x.id===id); if(!r||!canWithdrawOtRequest(r)) return notify('This OT request cannot be withdrawn.','error');
  if(!confirm('Withdraw this submitted OT request back to Draft?')) return;
  const before=r.status; r.status='Draft'; r.submittedAt=null; r.updatedAt=new Date().toISOString(); saveOt(); otActivityEvent('OT_WITHDRAWN',r,{message:'Submitted OT request withdrawn to Draft.',changes:{before,after:'Draft'}}); render({animate:false}); notify('OT request returned to Draft.','success');
}
function decideOtRequest(id,decision,reason='') {
  const r=ot.requests.find((x)=>x.id===id); if(!r||!canApproveOtRequest(r)) return notify('You are not authorized to decide this OT request.','error');
  if(!['Approved','Rejected'].includes(decision)) return;
  reason=String(reason||'').trim(); if(decision==='Rejected' && reason.length<3) return notify('A rejection reason is required.','error');
  const actor=currentUser(); const at=new Date().toISOString(); r.status=decision; r.updatedAt=at; r.decision={status:decision,byUserId:actor.id,byName:actor.name,byRole:actor.role,at,reason:reason||null}; saveOt();
  otActivityEvent(decision==='Approved'?'OT_APPROVED':'OT_REJECTED',r,{message:decision==='Approved'?'OT request approved.':`OT request rejected: ${reason}`}); closeModal(); render({animate:false}); notify(`OT request ${decision.toLowerCase()}.`,decision==='Approved'?'success':'info');
}
function otRequestsCsv(rows) {
  const header=['Request ID','Employee','Department','OT Date','Start','End','Duration Minutes','Duration','Location','Task','Reason','Status','Submitted At','Decision By','Decision At','Decision Reason'];
  return [header,...rows.map(r=>{const o=otRequestOwner(r);return[r.id,o?.name||r.ownerName||'',o?.department||r.ownerDepartment||'',r.date,r.start,r.end,r.durationMinutes,otDurationText(r.durationMinutes),r.location||'',r.task,r.reason,r.status,r.submittedAt||'',r.decision?.byName||'',r.decision?.at||'',r.decision?.reason||'']})].map(row=>row.map(escapeCsv).join(',')).join('\n');
}
function otActivityCsv(rows) {
  const header=['Activity ID','Timestamp','Action','Request ID','Actor','Role','Owner ID','Status','Message'];
  return [header,...rows.map(e=>[e.id,e.timestamp,e.action,e.requestId||'',e.actorName||'',e.actorRole||'',e.ownerId||'',e.status||'',e.message||''])].map(row=>row.map(escapeCsv).join(',')).join('\n');
}

function deviceMetadata() {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    language: navigator.language || 'unknown',
    platform: navigator.userAgentData?.platform || navigator.platform || 'unknown',
    online: navigator.onLine,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}

function auditEvent(action, record, details = {}) {
  const timestamp = new Date().toISOString();
  audit.unshift({
    id: uid(),
    eventRef: details.eventRef || null,
    timestamp,
    action,
    recordId: record?.id || details.recordId || null,
    location: details.location ?? record?.clockOut?.location ?? record?.clockIn?.location ?? null,
    department: details.department ?? record?.clockOut?.department ?? record?.clockIn?.department ?? null,
    geo: details.geo ?? null,
    source: details.source || 'application',
    message: details.message || '',
    metadata: details.metadata || deviceMetadata(),
    changes: details.changes || null,
  });
  audit = audit.slice(0, 5000);
  saveAudit();
}

function bootstrapAudit() {
  let changed = false;
  for (const r of state.records) {
    const inRef = `${r.id}:clockIn`;
    if (!audit.some((e) => e.eventRef === inRef)) {
      audit.push({ id: uid(), eventRef: inRef, timestamp: r.clockIn.timestamp, action: 'CLOCK_IN', recordId: r.id, location: r.clockIn.location, department: r.clockIn.department, geo: r.clockIn.geo || null, source: 'legacy-reconstruction', message: 'Clock-in reconstructed from existing attendance record.', metadata: { reconstructed: true }, changes: null });
      changed = true;
    }
    if (r.clockOut) {
      const outRef = `${r.id}:clockOut`;
      if (!audit.some((e) => e.eventRef === outRef)) {
        audit.push({ id: uid(), eventRef: outRef, timestamp: r.clockOut.timestamp, action: 'CLOCK_OUT', recordId: r.id, location: r.clockOut.location, department: r.clockOut.department, geo: r.clockOut.geo || null, source: 'legacy-reconstruction', message: 'Clock-out reconstructed from existing attendance record.', metadata: { reconstructed: true }, changes: null });
        changed = true;
      }
    }
  }
  if (changed) {
    audit.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
    saveAudit();
  }
}

function geoSummary(geo) {
  if (!geo || geo.status !== 'captured') return geo?.status === 'pending' ? 'GPS pending' : geo?.pendingRecovery ? `GPS recovery pending (${geo.status || 'unavailable'})` : geo?.status === 'denied' ? 'Permission denied' : geo?.status === 'unavailable' ? 'Unavailable' : geo?.status === 'timeout' ? 'Timed out' : geo?.status === 'unsupported' ? 'Unsupported' : geo?.status === 'not-requested' ? 'Not requested' : 'No GPS';
  return `${Number(geo.latitude).toFixed(5)}, ${Number(geo.longitude).toFixed(5)} · ±${Math.round(geo.accuracy || 0)} m`;
}

function geoCoordinates(geo) {
  return geo?.status === 'captured' && Number.isFinite(geo.latitude) && Number.isFinite(geo.longitude);
}

function validGeoFix(geo) {
  return Boolean(geoCoordinates(geo) && Number.isFinite(geo.accuracy) && geo.accuracy >= 0 && geo.latitude >= -90 && geo.latitude <= 90 && geo.longitude >= -180 && geo.longitude <= 180);
}

function cacheGeoFix(geo, source = 'attendance-geolocation') {
  if (!validGeoFix(geo)) return;
  try {
    globalThis.WMModuleStore.setItem(AUTO_GPS_CACHE_KEY, JSON.stringify({ ...geo, cachedAt: new Date().toISOString(), cacheSource: source }));
  } catch { /* cache failure must never block attendance */ }
}

function readCachedGeoFix(referenceMs = Date.now(), maxAgeMs = AUTO_GPS_FALLBACK_MAX_AGE_MS) {
  try {
    const geo = JSON.parse(globalThis.WMModuleStore.getItem(AUTO_GPS_CACHE_KEY) || 'null');
    if (!validGeoFix(geo)) return null;
    const capturedMs = new Date(geo.capturedAt || geo.cachedAt).getTime();
    if (!Number.isFinite(capturedMs)) return null;
    const ageMs = Math.abs(referenceMs - capturedMs);
    if (ageMs > maxAgeMs) return null;
    return { ...geo, ageAtReferenceMs: ageMs };
  } catch { return null; }
}

async function queryGeoPermission() {
  if (!navigator.permissions?.query) return 'unknown';
  try { return (await navigator.permissions.query({ name: 'geolocation' })).state; } catch { return 'unknown'; }
}

async function getGeoPosition(options) {
  return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || accuracy < 0) {
        resolve({ status: 'unavailable', error: 'The browser returned an invalid location fix.', capturedAt: new Date().toISOString(), source: 'device-geolocation' });
        return;
      }
      resolve({
        status: 'captured',
        latitude,
        longitude,
        accuracy,
        altitude: Number.isFinite(position.coords.altitude) ? position.coords.altitude : null,
        altitudeAccuracy: Number.isFinite(position.coords.altitudeAccuracy) ? position.coords.altitudeAccuracy : null,
        heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
        speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
        capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
        source: 'device-geolocation',
      });
    },
    (error) => resolve({
      status: error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable',
      error: error.message || 'Unable to retrieve location.',
      capturedAt: new Date().toISOString(),
      source: 'device-geolocation',
    }),
    options
  ));
}

function auditGpsResult(result, reason) {
  auditEvent('GPS_CAPTURE', null, {
    location: state.selection.location || null,
    department: state.selection.department || null,
    geo: result,
    source: reason === 'prefetch' ? 'automatic-prefetch' : 'automatic-clock-capture',
    message: result.status === 'captured'
      ? `Automatic GPS fix captured (${result.attempt || 'device'}).`
      : `Automatic GPS capture ${result.status}.`,
    metadata: { ...deviceMetadata(), reason, attempt: result.attempt || null },
  });
}

async function captureGps({ silent = true, reason = 'clock-event' } = {}) {
  if (gpsBusy) {
    while (gpsBusy) await new Promise((resolve) => setTimeout(resolve, 80));
    return gpsDraft;
  }
  if (!navigator.geolocation) {
    gpsDraft = { status: 'unsupported', capturedAt: new Date().toISOString(), permission: 'unsupported', error: 'Geolocation is not supported by this browser.', source: 'device-geolocation' };
    if (!silent) notify(gpsDraft.error, 'error');
    auditGpsResult(gpsDraft, reason);
    updateGpsPanel();
    return gpsDraft;
  }
  if (!window.isSecureContext) {
    gpsDraft = { status: 'unavailable', capturedAt: new Date().toISOString(), permission: 'secure-context-required', error: 'HTTPS is required for browser geolocation.', source: 'device-geolocation' };
    if (!silent) notify('GPS requires HTTPS.', 'error');
    auditGpsResult(gpsDraft, reason);
    updateGpsPanel();
    return gpsDraft;
  }

  const permission = await queryGeoPermission();
  if (permission === 'denied') {
    gpsDraft = { status: 'denied', capturedAt: new Date().toISOString(), permission, error: 'Location permission is blocked. Allow location access in the browser/site settings, then retry Clock In or Clock Out.', source: 'device-geolocation' };
    auditGpsResult(gpsDraft, reason);
    updateGpsPanel();
    if (!silent) notify(gpsDraft.error, 'error');
    return gpsDraft;
  }

  gpsBusy = true;
  updateGpsPanel();
  let result = await getGeoPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  result.permission = permission;
  result.attempt = 'high-accuracy';

  // Automatic fallback: if the high-accuracy request times out or is unavailable,
  // retry using a balanced request that can use a recent OS/browser location fix.
  if (result.status === 'timeout' || result.status === 'unavailable') {
    const fallback = await getGeoPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    fallback.permission = permission;
    fallback.attempt = 'balanced-fallback';
    if (fallback.status === 'captured' || result.status !== 'captured') result = fallback;
  }

  result.permission = await queryGeoPermission();
  if (result.status === 'captured') cacheGeoFix(result, reason);
  gpsDraft = result;
  gpsBusy = false;
  auditGpsResult(result, reason);
  updateGpsPanel();
  if (!silent) notify(result.status === 'captured' ? `GPS captured with ±${Math.round(result.accuracy)} m accuracy.` : `GPS ${result.status}: ${result.error || 'location not captured'}.`, result.status === 'captured' ? 'success' : 'error');
  return result;
}

function updateGpsPanel() {
  const panel = document.getElementById('gpsStatus');
  if (!panel) return;
  if (gpsBusy) {
    panel.className = 'gps-status acquiring';
    panel.innerHTML = '<strong>Acquiring location automatically…</strong><span>Requesting a high-accuracy device fix. A balanced fallback will be attempted automatically if needed.</span>';
    return;
  }
  const g = gpsDraft;
  if (!g) {
    panel.className = 'gps-status';
    panel.innerHTML = '<strong>Automatic GPS ready</strong><span>Your location will be obtained automatically when Clock In or Clock Out requires it. If permission is already granted, TimeTracker may pre-acquire a short-lived fix to reduce clocking delay.</span>';
    return;
  }
  const ok = g.status === 'captured';
  const detail = ok
    ? `${geoSummary(g)}${g.capturedAt ? ` · ${fmtTimeShort.format(new Date(g.capturedAt))}` : ''}${g.attempt === 'balanced-fallback' ? ' · fallback fix' : ''}`
    : `${geoSummary(g)}${g.error ? ` · ${g.error}` : ''}`;
  panel.className = `gps-status ${ok ? 'ok' : 'warn'}`;
  panel.innerHTML = `<strong>${ok ? 'Location acquired' : g.status === 'denied' ? 'Location permission required' : 'Location acquisition failed'}</strong><span>${esc(detail)}</span>`;
}

async function maybePrefetchGps() {
  if (view !== 'clock' || gpsBusy || !state.selection.location || !state.selection.department) return;
  const permission = await queryGeoPermission();
  if (permission !== 'granted') return;
  const fresh = gpsDraft?.status === 'captured' && Date.now() - new Date(gpsDraft.capturedAt).getTime() < 30000;
  if (!fresh) await captureGps({ silent: true, reason: 'prefetch' });
}

async function geoForClockEvent() {
  const fresh = gpsDraft?.status === 'captured' && Date.now() - new Date(gpsDraft.capturedAt).getTime() < 30000;
  const geo = fresh ? gpsDraft : await captureGps({ silent: true, reason: 'clock-event' });
  if (geo?.status !== 'captured') return null;
  return geo;
}

function activeRecord() {
  const me = currentUser();
  return state.records.find((record) => record.ownerId === me?.id && !record.clockOut) ?? null;
}

function elapsedDurationMs(record, at = now) {
  const start = new Date(record.clockIn.timestamp).getTime();
  const end = record.clockOut ? new Date(record.clockOut.timestamp).getTime() : at;
  return Math.max(0, end - start);
}

function localBreakWindowFor(dateLike) {
  const date = new Date(dateLike);
  const start = new Date(date);
  start.setHours(12, 0, 0, 0);
  const end = new Date(date);
  end.setHours(13, 0, 0, 0);
  return [start.getTime(), end.getTime()];
}

function unpaidBreakOverlapMs(startMs, endMs) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  let total = 0;
  const cursor = new Date(startMs);
  cursor.setHours(0, 0, 0, 0);
  const finalDay = new Date(endMs);
  finalDay.setHours(0, 0, 0, 0);
  let guard = 0;
  while (cursor.getTime() <= finalDay.getTime() && guard++ < 370) {
    const [breakStart, breakEnd] = localBreakWindowFor(cursor);
    total += Math.max(0, Math.min(endMs, breakEnd) - Math.max(startMs, breakStart));
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

function creditedWorkingMs(startLike, endLike) {
  const startMs = new Date(startLike).getTime();
  const endMs = new Date(endLike).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.max(0, endMs - startMs - unpaidBreakOverlapMs(startMs, endMs));
}

function durationMs(record, at = now) {
  const end = record.clockOut ? record.clockOut.timestamp : new Date(at).toISOString();
  return creditedWorkingMs(record.clockIn.timestamp, end);
}

function approvedOtForAttendance(record) {
  if (!record?.ownerId || !record?.clockIn?.timestamp) return { requests: [], durationMinutes: 0, durationMs: 0, date: null };
  const attendanceDate = localDateKey(record.clockIn.timestamp);
  if (!attendanceDate) return { requests: [], durationMinutes: 0, durationMs: 0, date: null };
  const intervals = [];
  const requests = [];
  for (const request of ot.requests || []) {
    if (!request || request.ownerId !== record.ownerId || request.status !== 'Approved' || request.date !== attendanceDate) continue;
    const validatedMinutes = otDurationMinutes(request.date, request.start, request.end);
    if (!validatedMinutes || validatedMinutes < 15 || validatedMinutes > 16 * 60) continue;
    if (!request.decision || request.decision.status !== 'Approved' || !request.decision.at || !request.decision.byUserId) continue;
    const start = new Date(`${request.date}T${request.start}:00`).getTime();
    let end = new Date(`${request.date}T${request.end}:00`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (end <= start) end += 24 * 60 * 60 * 1000;
    if (Math.round((end - start) / 60000) !== validatedMinutes) continue;
    intervals.push([start, end]);
    requests.push(request);
  }
  intervals.sort((a,b)=>a[0]-b[0]);
  const merged = [];
  for (const interval of intervals) {
    const last = merged[merged.length-1];
    if (!last || interval[0] > last[1]) merged.push([...interval]);
    else last[1] = Math.max(last[1], interval[1]);
  }
  const durationMs = merged.reduce((sum,[start,end])=>sum + Math.max(0,end-start),0);
  return { requests, durationMinutes: Math.round(durationMs/60000), durationMs, date: attendanceDate };
}

function effectiveRequiredWorkMs(record) {
  return ATTENDANCE_POLICY.requiredWorkMs + approvedOtForAttendance(record).durationMs;
}

function autoClockOutTime(clockInTimestamp, requiredWorkMs = ATTENDANCE_POLICY.requiredWorkMs) {
  const startMs = new Date(clockInTimestamp).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(requiredWorkMs) || requiredWorkMs < 0) return null;
  let candidate = startMs + requiredWorkMs;
  for (let i = 0; i < 8; i += 1) {
    const credited = creditedWorkingMs(startMs, candidate);
    const missing = requiredWorkMs - credited;
    if (missing <= 0) return new Date(candidate);
    candidate += missing;
  }
  return new Date(candidate);
}

function autoClockOutTimeForRecord(record) {
  if (!record?.clockIn?.timestamp) return null;
  return autoClockOutTime(record.clockIn.timestamp, effectiveRequiredWorkMs(record));
}

function clockInMinutes(timestamp) {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / 60000;
}

function isLateClockIn(timestamp) {
  return clockInMinutes(timestamp) > ATTENDANCE_POLICY.standardClockInMinutes;
}

function attendanceClassification(record) {
  return isLateClockIn(record.clockIn.timestamp) ? 'Late' : 'On Time';
}

function attendancePolicySnapshot(record) {
  const approvedOt = approvedOtForAttendance(record);
  const requiredWorkMs = ATTENDANCE_POLICY.requiredWorkMs + approvedOt.durationMs;
  const automaticAt = autoClockOutTime(record.clockIn.timestamp, requiredWorkMs);
  return {
    version: ATTENDANCE_POLICY.version,
    standardClockIn: '08:00',
    unpaidBreak: '12:00-13:00',
    baseRequiredWorkingHours: 9,
    approvedOtMinutes: approvedOt.durationMinutes,
    approvedOtRequestIds: approvedOt.requests.map((request)=>request.id),
    requiredWorkingHours: requiredWorkMs / (60*60*1000),
    requiredWorkingMs: requiredWorkMs,
    classification: attendanceClassification(record),
    autoClockOutAt: automaticAt?.toISOString() || null,
  };
}

async function acquireAutoClockLock(recordId) {
  try {
    return await globalThis.WMModuleLocks?.acquire?.(`auto-clockout:${recordId}`, 30000) || null;
  } catch (error) {
    console.error('Unable to acquire distributed automatic clock-out lock.', error);
    return null;
  }
}

async function releaseAutoClockLock(lock) {
  if (!lock) return;
  await globalThis.WMModuleLocks?.release?.(lock);
}

async function acquireAutoGpsLock(recordId) {
  try {
    return await globalThis.WMModuleLocks?.acquire?.(`auto-gps:${recordId}`, 45000) || null;
  } catch (error) {
    console.error('Unable to acquire distributed automatic GPS lock.', error);
    return null;
  }
}

async function releaseAutoGpsLock(lock) {
  if (!lock) return;
  await globalThis.WMModuleLocks?.release?.(lock);
}

async function commitAuthoritativeAttendance(operation, payload = {}) {
  if (!globalThis.WMModuleAttendance?.commit) {
    throw new Error('The active cloud attendance transaction service is unavailable. Refresh Work Management and verify the latest Supabase migration.');
  }
  const result = await globalThis.WMModuleAttendance.commit(operation, payload);
  const next = parseState(result?.value ?? globalThis.WMModuleStore?.getItem?.(STORAGE_KEY));
  if (!next) throw new Error('Supabase committed the attendance action but returned an invalid attendance state.');
  next.selection = { ...state.selection };
  state = next;
  return result;
}

async function refreshAuthoritativeAttendance({ renderUi = true } = {}) {
  try {
    await globalThis.WMModuleStore?.refresh?.();
    const next = parseState(globalThis.WMModuleStore?.getItem?.(STORAGE_KEY));
    if (next) {
      next.selection = { ...state.selection };
      state = next;
    }
    if (renderUi) render({ animate: false });
    return true;
  } catch (error) {
    console.warn('Authoritative attendance refresh failed.', error);
    return false;
  }
}

function autoGpsFailure(status, error, permission, effectiveTimestamp, extra = {}) {
  return {
    status: status || 'unavailable',
    error: error || 'Automatic GPS evidence could not be captured.',
    permission: permission || 'unknown',
    source: 'automatic-clockout-geolocation',
    evidenceQuality: null,
    evidenceForTimestamp: effectiveTimestamp || null,
    pendingRecovery: true,
    capturedAt: new Date().toISOString(),
    ...extra,
  };
}

async function obtainAutoClockOutGeo(record, effectiveTimestamp) {
  const effectiveMs = new Date(effectiveTimestamp).getTime();
  const cached = readCachedGeoFix(effectiveMs);
  if (!navigator.geolocation) {
    return cached ? { ...cached, status: 'captured', source: 'automatic-clockout-cached-fallback', evidenceQuality: 'cached-fallback', evidenceForTimestamp: effectiveTimestamp, temporalOffsetMs: new Date(cached.capturedAt).getTime() - effectiveMs, pendingRecovery: false }
      : autoGpsFailure('unsupported', 'Geolocation is not supported by this browser or device.', 'unsupported', effectiveTimestamp);
  }
  if (!window.isSecureContext) {
    return cached ? { ...cached, status: 'captured', source: 'automatic-clockout-cached-fallback', evidenceQuality: 'cached-fallback', evidenceForTimestamp: effectiveTimestamp, temporalOffsetMs: new Date(cached.capturedAt).getTime() - effectiveMs, pendingRecovery: false }
      : autoGpsFailure('unavailable', 'Secure HTTPS is required for browser geolocation.', 'secure-context-required', effectiveTimestamp);
  }

  const permission = await queryGeoPermission();
  if (permission === 'denied') {
    return cached ? { ...cached, status: 'captured', permission, source: 'automatic-clockout-cached-fallback', evidenceQuality: 'cached-fallback', evidenceForTimestamp: effectiveTimestamp, temporalOffsetMs: new Date(cached.capturedAt).getTime() - effectiveMs, pendingRecovery: false }
      : autoGpsFailure('denied', 'Location permission is denied. GPS evidence will be retried after permission is restored.', permission, effectiveTimestamp);
  }

  let result = await getGeoPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
  result.permission = permission;
  result.attempt = 'auto-high-accuracy';
  if (result.status !== 'captured') {
    const fallback = await getGeoPosition({ enableHighAccuracy: false, timeout: 6000, maximumAge: 120000 });
    fallback.permission = permission;
    fallback.attempt = 'auto-balanced-fallback';
    if (fallback.status === 'captured') result = fallback;
  }

  if (validGeoFix(result)) {
    result.permission = await queryGeoPermission();
    result.source = 'automatic-clockout-geolocation';
    result.evidenceQuality = 'fresh-device-fix';
    result.evidenceForTimestamp = effectiveTimestamp;
    result.temporalOffsetMs = new Date(result.capturedAt).getTime() - effectiveMs;
    result.pendingRecovery = false;
    cacheGeoFix(result, 'automatic-clockout');
    return result;
  }

  if (cached) {
    return { ...cached, status: 'captured', permission, source: 'automatic-clockout-cached-fallback', evidenceQuality: 'cached-fallback', evidenceForTimestamp: effectiveTimestamp, temporalOffsetMs: new Date(cached.capturedAt).getTime() - effectiveMs, pendingRecovery: false, acquisitionFailure: { status: result.status, error: result.error || null } };
  }
  return autoGpsFailure(result.status || 'unavailable', result.error || 'Unable to obtain a valid GPS fix during automatic clock-out.', permission, effectiveTimestamp, { attempt: result.attempt || null });
}

async function attemptAutoClockOutGps(recordId, { recovery = false } = {}) {
  const record = state.records.find((item) => item.id === recordId);
  if (!record?.clockOut?.automatic || !record.clockOut.timestamp) return false;
  if (validGeoFix(record.clockOut.geo) && !record.clockOut.geo.pendingRecovery) return true;
  const lock = await acquireAutoGpsLock(recordId);
  if (!lock) return false;
  try {
    const current = state.records.find((item) => item.id === recordId);
    if (!current?.clockOut?.automatic || validGeoFix(current.clockOut.geo)) return Boolean(validGeoFix(current?.clockOut?.geo));
    const attemptAt = new Date().toISOString();
    const beforeAcquireState = JSON.stringify(state);
    current.autoClockOut = { ...(current.autoClockOut || {}), gpsState: 'acquiring', gpsLastAttemptAt: attemptAt, gpsAttemptCount: Number(current.autoClockOut?.gpsAttemptCount || 0) + 1 };
    try { await saveStateConfirmed(); } catch (error) { state = parseState(beforeAcquireState) || state; console.error('Automatic GPS state could not be committed.', error); return false; }

    const geo = await obtainAutoClockOutGeo(current, current.clockOut.timestamp);
    if (recovery && validGeoFix(geo) && geo.evidenceQuality === 'fresh-device-fix') geo.evidenceQuality = 'recovery-device-fix';
    const latest = state.records.find((item) => item.id === recordId);
    if (!latest?.clockOut?.automatic) return false;
    const beforeAssociationState = JSON.stringify(state);
    latest.clockOut.geo = geo;
    latest.autoClockOut = {
      ...(latest.autoClockOut || {}),
      gpsState: validGeoFix(geo) ? 'associated' : 'pending-recovery',
      gpsLastAttemptAt: attemptAt,
      gpsAssociatedAt: validGeoFix(geo) ? new Date().toISOString() : null,
      gpsEvidenceQuality: geo.evidenceQuality || null,
      gpsFailure: validGeoFix(geo) ? null : { status: geo.status, error: geo.error || null },
    };
    latest.updatedAt = new Date().toISOString();
    try { await saveStateConfirmed(); } catch (error) { state = parseState(beforeAssociationState) || state; console.error('Automatic GPS evidence could not be committed.', error); return false; }
    auditEvent(validGeoFix(geo) ? 'GPS_EVIDENCE' : 'GPS_CAPTURE', latest, {
      location: latest.clockOut.location,
      department: latest.clockOut.department,
      geo,
      eventRef: `${latest.id}:autoClockOutGps:${latest.autoClockOut.gpsAttemptCount}`,
      source: recovery ? 'automatic-clockout-gps-recovery' : 'automatic-clockout-geolocation',
      message: validGeoFix(geo)
        ? `GPS evidence associated with automatic clock-out (${geo.evidenceQuality || 'device fix'}).`
        : `Automatic clock-out GPS acquisition failed (${geo.status}); attendance remained finalized and GPS recovery is pending.`,
      metadata: { recovery, effectiveTimestamp: latest.clockOut.timestamp, attemptCount: latest.autoClockOut.gpsAttemptCount, ...deviceMetadata() },
    });
    if (view === 'log' && !document.hidden) refreshLogRows();
    return validGeoFix(geo);
  } finally {
    await releaseAutoGpsLock(lock);
  }
}

function pendingAutoGpsRecordsForCurrentUser() {
  const userId = currentUser()?.id;
  if (!userId) return [];
  return state.records.filter((record) => record?.ownerId === userId && record?.clockOut?.automatic && !validGeoFix(record.clockOut.geo));
}

async function recoverPendingAutoClockOutGpsAtLaunch() {
  if (document.hidden) return 0;
  const pending = pendingAutoGpsRecordsForCurrentUser();
  let recovered = 0;
  for (const record of pending) {
    const ok = await attemptAutoClockOutGps(record.id, { recovery: true });
    if (ok) recovered += 1;
  }
  return recovered;
}

async function enforceAutoClockOut(at = Date.now(), { announce = true } = {}) {
  const userId = currentUser()?.id;
  if (!userId) return 0;
  const due = state.records.filter((record) => {
    if (!record || record.ownerId !== userId || record.clockOut || !record.clockIn?.timestamp) return false;
    const effective = autoClockOutTimeForRecord(record);
    return effective && at >= effective.getTime();
  });
  if (!due.length) return 0;
  let enforced = 0;
  for (const record of due) {
    const effective = autoClockOutTimeForRecord(record);
    const lock = await acquireAutoClockLock(record.id);
    if (!effective || !lock) continue;
    const beforeEnforcementState = JSON.stringify(state);
    try {
      const current = state.records.find((item) => item.id === record.id);
      if (!current || current.clockOut) continue;
      const approvedOt = approvedOtForAttendance(current);
      const requiredWorkMs = ATTENDANCE_POLICY.requiredWorkMs + approvedOt.durationMs;
      const workMs = creditedWorkingMs(current.clockIn.timestamp, effective);
      current.clockOut = {
        timestamp: effective.toISOString(),
        location: current.clockIn.location,
        department: current.clockIn.department,
        geo: {
          status: 'pending',
          source: 'automatic-clockout-geolocation',
          permission: 'unknown',
          capturedAt: null,
          evidenceForTimestamp: effective.toISOString(),
          pendingRecovery: true,
          error: 'Automatic clock-out was finalized first; GPS acquisition is pending.',
        },
        automatic: true,
        reason: approvedOt.durationMs ? 'required-working-hours-plus-approved-ot-reached' : 'required-working-hours-reached',
      };
      current.attendancePolicy = attendancePolicySnapshot(current);
      current.autoClockOut = {
        automatic: true,
        effectiveTimestamp: effective.toISOString(),
        enforcedAt: new Date(at).toISOString(),
        creditedWorkingMs: workMs,
        requiredWorkingMs: requiredWorkMs,
        baseRequiredWorkingMs: ATTENDANCE_POLICY.requiredWorkMs,
        approvedOtMinutes: approvedOt.durationMinutes,
        approvedOtRequestIds: approvedOt.requests.map((request)=>request.id),
        unpaidBreakDeductedMs: unpaidBreakOverlapMs(new Date(current.clockIn.timestamp).getTime(), effective.getTime()),
        reason: approvedOt.durationMs ? 'base-hours-plus-approved-ot-completed' : '9-credit-hours-completed',
        gpsState: 'pending',
        gpsAttemptCount: 0,
      };
      current.updatedAt = new Date(at).toISOString();
      try {
        await saveStateConfirmed();
      } catch (error) {
        state = parseState(beforeEnforcementState) || state;
        console.error('Automatic clock-out was not committed; it will be retried later.', error);
        continue;
      }
      auditEvent('CLOCK_OUT', current, {
        location: current.clockOut.location,
        department: current.clockOut.department,
        geo: current.clockOut.geo,
        eventRef: `${current.id}:clockOut`,
        source: 'launch-time-auto-clockout',
        message: approvedOt.durationMs ? `Automatic clock-out enforced during TimeTracker launch after 9 base credited hours plus ${otDurationText(approvedOt.durationMinutes)} approved OT; current GPS acquisition follows in the active application session.` : 'Automatic clock-out enforced during TimeTracker launch at exactly 9 credited working hours; current GPS acquisition follows in the active application session.',
        metadata: { automatic: true, effectiveTimestamp: effective.toISOString(), creditedWorkingMs: workMs, requiredWorkingMs: requiredWorkMs, baseRequiredWorkingMs: ATTENDANCE_POLICY.requiredWorkMs, approvedOtMinutes: approvedOt.durationMinutes, approvedOtRequestIds: approvedOt.requests.map((request)=>request.id), breakExcluded: '12:00-13:00', gpsState: 'pending', ...deviceMetadata() },
      });
      auditEvent('AUTO_CLOCK_OUT', current, {
        eventRef: `${current.id}:autoClockOut`,
        source: 'launch-time-attendance-policy',
        message: approvedOt.durationMs ? `Launch-time attendance evaluation completed the overdue active session after 9 base working hours plus ${otDurationText(approvedOt.durationMinutes)} approved OT. GPS evidence is acquired while TimeTracker is active.` : 'Launch-time attendance evaluation completed the overdue active session after 9 accumulated working hours. GPS evidence is acquired while TimeTracker is active.',
        metadata: { ...current.autoClockOut, ...deviceMetadata() },
      });
      enforced += 1;
    } finally {
      await releaseAutoClockLock(lock);
    }
  }
  if (enforced) {
    if (announce) notify(`${enforced === 1 ? 'Shift' : `${enforced} shifts`} automatically clocked out after reaching the applicable credited-work threshold, including approved OT where applicable. GPS acquisition will run during this launch session.`, 'success');
  }
  return enforced;
}

function formatDuration(ms, seconds = true) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return seconds
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function humanHours(ms) {
  return `${(Math.max(0, ms) / 3600000).toFixed(1)} h`;
}

function sameLocalDay(iso, date = new Date()) {
  return localDateKey(iso) === localDateKey(date);
}

function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function escapeCsv(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function options(list, selected, label = 'All') {
  return `<option value="">${esc(label)}</option>` + list.map((v) => `<option value="${esc(v)}" ${v === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el && el.textContent !== value) el.textContent = value;
}

function metrics(at = now) {
  const date = new Date(at);
  const records = ownRecords();
  const today = records.filter((r) => sameLocalDay(r.clockIn.timestamp, date));
  const todayMs = today.reduce((sum, r) => sum + durationMs(r, at), 0);
  const start = new Date(date);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  const weekMs = records.filter((r) => new Date(r.clockIn.timestamp).getTime() >= start.getTime()).reduce((sum, r) => sum + durationMs(r, at), 0);
  return { today, todayMs, weekMs, completed: records.filter((r) => r.clockOut) };
}


const MOTION = Object.freeze({ fast: 150, base: 240, slow: 380 });
function motionReduced() { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true; }

function navigateToView(nextView) {
  if (!nextView || nextView === view) return;
  const commit = () => { view = nextView; render({ animate: true }); };
  // v1.30 deliberately avoids root/document View Transitions: the persistent
  // TimeTracker header stays mounted while only the current content view exits.
  if (!motionReduced() && globalThis.WorkManagementMotion?.exitThen) {
    globalThis.WorkManagementMotion.exitThen(commit, { selector: '.app-shell > main > :first-child', kind: 'route', duration: 95 });
  } else commit();
}

function animateRecordDisclosure(detail, expand) {
  if (!detail) return;
  detail._motion?.cancel?.();
  if (motionReduced() || typeof detail.animate !== 'function') {
    detail.hidden = !expand;
    detail.style.removeProperty('height');
    detail.style.removeProperty('overflow');
    return;
  }
  if (expand) detail.hidden = false;
  const start = expand ? 0 : detail.scrollHeight;
  const end = expand ? detail.scrollHeight : 0;
  detail.style.overflow = 'clip';
  const animation = detail.animate([
    { height: `${start}px`, opacity: expand ? 0 : 1, transform: expand ? 'translateY(-6px)' : 'translateY(0)' },
    { height: `${end}px`, opacity: expand ? 1 : 0, transform: expand ? 'translateY(0)' : 'translateY(-6px)' },
  ], { duration: MOTION.slow, easing: 'cubic-bezier(.2,.8,.2,1)' });
  detail._motion = animation;
  animation.onfinish = () => {
    detail._motion = null;
    detail.hidden = !expand;
    detail.style.removeProperty('height');
    detail.style.removeProperty('overflow');
    detail.style.removeProperty('opacity');
    detail.style.removeProperty('transform');
  };
}

function initInteractionMotion() {
  if (document.documentElement.dataset.motionReady) return;
  document.documentElement.dataset.motionReady = 'true';
  document.addEventListener('pointerdown', (event) => {
    if (motionReduced() || event.button !== 0) return;
    const button = event.target.closest('button');
    if (!button || button.disabled || button.closest('.leaflet-control-container')) return;
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.55;
    const ripple = document.createElement('span');
    ripple.className = 'interaction-ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
    button.append(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  }, { passive: true });
}


const modernSelectState = { open: null, initialized: false };

function modernSelectLabel(select) {
  const explicit = select.getAttribute('aria-label');
  if (explicit) return explicit;
  const label = select.closest('label');
  const caption = label?.querySelector(':scope > span');
  if (caption?.textContent?.trim()) return caption.textContent.trim();
  return select.name || select.id || 'Select option';
}

function selectedNativeOption(select) {
  return select.options[select.selectedIndex] || select.options[0] || null;
}

function modernSelectMenu(wrapper) {
  const menuId = wrapper?.dataset.menuId;
  return menuId ? document.getElementById(menuId) : null;
}

function syncModernSelect(select) {
  const wrapper = select.closest('.modern-select');
  if (!wrapper) return;
  const trigger = wrapper.querySelector('.modern-select-trigger');
  const value = wrapper.querySelector('.modern-select-value');
  const menu = modernSelectMenu(wrapper);
  const option = selectedNativeOption(select);
  const text = option?.textContent?.trim() || 'Choose an option';
  if (value) value.textContent = text;
  if (trigger) {
    trigger.setAttribute('aria-label', `${wrapper.dataset.fieldLabel || 'Select option'}: ${text}`);
    trigger.disabled = select.disabled;
    trigger.classList.toggle('placeholder', !select.value);
  }
  wrapper.classList.toggle('is-disabled', select.disabled);
  wrapper.classList.remove('is-invalid');
  trigger?.removeAttribute('aria-invalid');
  menu?.querySelectorAll('[role="option"]').forEach((item) => {
    const selected = item.dataset.value === select.value;
    item.setAttribute('aria-selected', String(selected));
    item.classList.toggle('selected', selected);
    item.tabIndex = selected ? 0 : -1;
  });
}

function restoreModernSelectMenu(wrapper, menu) {
  if (!wrapper || !menu) return;
  menu.hidden = true;
  menu.classList.remove('is-portaled', 'opens-up');
  menu.style.removeProperty('top');
  menu.style.removeProperty('left');
  menu.style.removeProperty('width');
  menu.style.removeProperty('min-width');
  menu.style.removeProperty('max-width');
  menu.style.removeProperty('max-height');
  menu.style.removeProperty('transform-origin');
  if (wrapper.isConnected) wrapper.append(menu);
  else menu.remove();
}

function closeModernSelect(wrapper, { focus = false } = {}) {
  if (!wrapper) return;
  const trigger = wrapper.querySelector('.modern-select-trigger');
  const menu = modernSelectMenu(wrapper);
  wrapper.classList.remove('open');
  trigger?.setAttribute('aria-expanded', 'false');
  restoreModernSelectMenu(wrapper, menu);
  if (modernSelectState.open === wrapper) modernSelectState.open = null;
  if (focus && wrapper.isConnected) trigger?.focus();
}

function closeAllModernSelects(except = null) {
  if (modernSelectState.open && modernSelectState.open !== except) closeModernSelect(modernSelectState.open);
}

function focusModernOption(wrapper, direction = 0) {
  const menu = modernSelectMenu(wrapper);
  const items = [...(menu?.querySelectorAll('[role="option"]:not([aria-disabled="true"])') || [])];
  if (!items.length) return;
  let index = items.findIndex((item) => item.getAttribute('aria-selected') === 'true');
  if (index < 0) index = 0;
  if (direction === 1) index = Math.min(items.length - 1, index + 1);
  else if (direction === -1) index = Math.max(0, index - 1);
  else if (direction === 2) index = 0;
  else if (direction === 3) index = items.length - 1;
  items.forEach((item) => { item.tabIndex = -1; });
  items[index].tabIndex = 0;
  items[index].focus({ preventScroll: true });
  items[index].scrollIntoView({ block: 'nearest' });
}

function positionModernSelectMenu(wrapper, menu) {
  const trigger = wrapper?.querySelector('.modern-select-trigger');
  if (!trigger || !menu) return;
  const rect = trigger.getBoundingClientRect();
  const gap = 7;
  const viewportPadding = 12;
  const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const maxWidth = Math.max(180, Math.min(360, viewportWidth - viewportPadding * 2));

  menu.classList.add('is-portaled');
  menu.hidden = false;
  menu.style.minWidth = `${Math.min(rect.width, maxWidth)}px`;
  menu.style.width = 'max-content';
  menu.style.maxWidth = `${maxWidth}px`;
  menu.style.maxHeight = '280px';

  // Measure after the menu is in the top-level overlay layer.
  const measured = menu.getBoundingClientRect();
  const menuWidth = Math.min(Math.max(rect.width, measured.width), maxWidth);
  menu.style.width = `${menuWidth}px`;
  menu.style.minWidth = `${menuWidth}px`;

  let left = rect.left;
  if (left + menuWidth > viewportWidth - viewportPadding) left = viewportWidth - viewportPadding - menuWidth;
  left = Math.max(viewportPadding, left);

  const below = viewportHeight - rect.bottom - gap - viewportPadding;
  const above = rect.top - gap - viewportPadding;
  const desiredHeight = Math.min(280, Math.max(160, measured.height));
  const openUp = below < Math.min(180, desiredHeight) && above > below;
  const available = Math.max(120, openUp ? above : below);
  menu.style.maxHeight = `${Math.min(280, available)}px`;
  menu.classList.toggle('opens-up', openUp);
  menu.style.transformOrigin = openUp ? 'bottom left' : 'top left';
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = openUp
    ? `${Math.max(viewportPadding, Math.round(rect.top - gap - Math.min(measured.height, available)))}px`
    : `${Math.round(rect.bottom + gap)}px`;
}

function openModernSelect(wrapper, focusDirection = 0) {
  if (!wrapper || wrapper.classList.contains('is-disabled')) return;
  closeAllModernSelects(wrapper);
  const trigger = wrapper.querySelector('.modern-select-trigger');
  const menu = modernSelectMenu(wrapper);
  if (!menu) return;

  // Portal the menu to <body>. This intentionally escapes transformed/animated
  // page sections and prevents z-index/stacking-context collisions with cards.
  document.body.append(menu);
  wrapper.classList.add('open');
  trigger?.setAttribute('aria-expanded', 'true');
  modernSelectState.open = wrapper;
  positionModernSelectMenu(wrapper, menu);

  if (!motionReduced() && menu.animate) {
    const direction = menu.classList.contains('opens-up') ? 6 : -6;
    menu.animate([
      { opacity: 0, transform: `translateY(${direction}px) scale(.985)` },
      { opacity: 1, transform: 'translateY(0) scale(1)' },
    ], { duration: MOTION.base, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  if (focusDirection !== null) requestAnimationFrame(() => focusModernOption(wrapper, focusDirection));
}

function chooseModernOption(wrapper, item) {
  const select = wrapper?.querySelector('select.modern-select-native');
  if (!select || !item || item.getAttribute('aria-disabled') === 'true') return;
  const nextValue = item.dataset.value ?? '';
  const changed = select.value !== nextValue;
  select.value = nextValue;
  syncModernSelect(select);
  closeModernSelect(wrapper, { focus: true });
  if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
}

function buildModernSelect(select) {
  if (!(select instanceof HTMLSelectElement) || select.dataset.modernized === 'true') return;
  select.dataset.modernized = 'true';
  const wrapper = document.createElement('div');
  wrapper.className = 'modern-select';
  wrapper.dataset.fieldLabel = modernSelectLabel(select);
  const menuId = `modern-select-${select.id || uid()}`;
  wrapper.dataset.menuId = menuId;
  select.parentNode.insertBefore(wrapper, select);
  wrapper.append(select);
  select.classList.add('modern-select-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'modern-select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', menuId);
  trigger.innerHTML = '<span class="modern-select-value"></span><span class="modern-select-chevron" aria-hidden="true">⌄</span>';

  const menu = document.createElement('div');
  menu.id = menuId;
  menu.className = 'modern-select-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', wrapper.dataset.fieldLabel);
  menu.hidden = true;

  [...select.options].forEach((option) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'modern-select-option';
    item.setAttribute('role', 'option');
    item.dataset.value = option.value;
    item.setAttribute('aria-selected', String(option.selected));
    item.setAttribute('aria-disabled', String(option.disabled));
    item.disabled = option.disabled;
    item.innerHTML = `<span>${esc(option.textContent || '')}</span><span class="modern-select-check" aria-hidden="true">✓</span>`;
    if (option.selected) item.classList.add('selected');
    item.tabIndex = option.selected ? 0 : -1;
    menu.append(item);
  });

  wrapper.append(trigger, menu);
  syncModernSelect(select);

  trigger.addEventListener('click', () => {
    if (wrapper.classList.contains('open')) closeModernSelect(wrapper);
    else openModernSelect(wrapper, 0);
  });
  trigger.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const map = { ArrowDown: 1, ArrowUp: -1, Home: 2, End: 3 };
      openModernSelect(wrapper, map[event.key]);
      return;
    }
    if (event.key === 'Escape') closeModernSelect(wrapper);
    if (event.key.length === 1 && /\S/.test(event.key)) {
      const query = event.key.toLocaleLowerCase();
      const candidate = [...menu.querySelectorAll('[role="option"]:not([aria-disabled="true"])')]
        .find((item) => item.textContent.trim().toLocaleLowerCase().startsWith(query));
      if (candidate) {
        event.preventDefault();
        openModernSelect(wrapper, null);
        candidate.tabIndex = 0;
        candidate.focus();
      }
    }
  });
  menu.addEventListener('click', (event) => chooseModernOption(wrapper, event.target.closest('[role="option"]')));
  menu.addEventListener('keydown', (event) => {
    const current = event.target.closest('[role="option"]');
    if (!current) return;
    const items = [...menu.querySelectorAll('[role="option"]:not([aria-disabled="true"])')];
    let index = items.indexOf(current);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      index = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((item) => { item.tabIndex = -1; });
      items[index].tabIndex = 0;
      items[index].focus();
      items[index].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const target = event.key === 'Home' ? items[0] : items[items.length - 1];
      items.forEach((item) => { item.tabIndex = -1; });
      if (target) { target.tabIndex = 0; target.focus(); }
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      chooseModernOption(wrapper, current);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closeModernSelect(wrapper, { focus: true });
    } else if (event.key === 'Tab') {
      closeModernSelect(wrapper);
    }
  });
  select.addEventListener('change', () => syncModernSelect(select));
  select.addEventListener('invalid', (event) => {
    event.preventDefault();
    wrapper.classList.add('is-invalid');
    trigger.setAttribute('aria-invalid', 'true');
    trigger.focus();
  });
}

function enhanceModernSelects(root = document) {
  root.querySelectorAll('select:not([data-modernized="true"])').forEach(buildModernSelect);
}

function initModernDropdownSystem() {
  if (modernSelectState.initialized) return;
  modernSelectState.initialized = true;
  document.addEventListener('pointerdown', (event) => {
    if (!modernSelectState.open) return;
    const inTrigger = event.target.closest?.('.modern-select');
    const inMenu = event.target.closest?.('.modern-select-menu');
    if (!inTrigger && !inMenu) closeModernSelect(modernSelectState.open);
  }, { capture: true });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modernSelectState.open) closeModernSelect(modernSelectState.open, { focus: true });
  });
  window.addEventListener('resize', () => closeAllModernSelects());
  window.addEventListener('scroll', (event) => {
    if (event.target?.closest?.('.modern-select-menu')) return;
    closeAllModernSelects();
  }, { capture: true, passive: true });
}

function render({ animate = true } = {}) {
  closeAllModernSelects();
  if (leafletMap) destroyLeafletMap();
  pageAnimationClass = animate ? 'page-enter' : '';
  const active = activeRecord();
  const nav = [
    ['overview', 'Overview', '◫'],
    hasPermission(PERMISSIONS.CLOCK_USE) && ['clock', 'Clock', '◷'],
    hasPermission(PERMISSIONS.LOG_VIEW_SELF) && ['log', 'Log', '≡'],
    hasPermission(PERMISSIONS.REPORTS_VIEW) && ['reports', 'Reports', '▤'],
    hasPermission(PERMISSIONS.CALENDAR_VIEW) && ['calendar', 'Calendar', '□'],
    hasPermission(PERMISSIONS.OT_VIEW) && ['ot', 'OT', '↟'],
    hasPermission(PERMISSIONS.ROLES_VIEW) && ['roles', 'Roles', '◇'],
  ].filter(Boolean);
  const navMarkup = nav.map(([key, label, glyph]) => `<button data-view="${key}" class="wm-tab ${view === key ? 'active is-active' : ''}" role="tab" aria-controls="timeMain" ${view===key?'aria-current="page" aria-selected="true"':'aria-selected="false"'}><span class="tt-v2-nav-glyph" aria-hidden="true">${glyph}</span><span class="tt-v2-nav-label">${label}</span></button>`).join('');
  const activeViewLabel = nav.find(([key]) => key === view)?.[1] || 'Overview';
  const appRoot = document.getElementById('app');
  let shellRoot = appRoot.querySelector('.app-shell');
  if (!shellRoot) {
    appRoot.innerHTML = `<div class="app-shell tt-v2-shell" data-tt-v2-shell>
      <div class="tt-v2-environment" aria-hidden="true"><span class="tt-v2-aurora tt-v2-aurora--one"></span><span class="tt-v2-aurora tt-v2-aurora--two"></span><span class="tt-v2-aurora tt-v2-aurora--three"></span></div>
      <aside class="tt-v2-rail" aria-label="TimeTracker v2 navigation"><div class="tt-v2-rail-mark" aria-hidden="true"></div><nav class="nav-tabs wm-tabs" aria-label="Primary navigation" role="tablist"></nav><div class="tt-v2-rail-meta">V2</div></aside>
      <header class="topbar"></header>
      <main id="timeMain" data-time-main role="tabpanel"></main>
      <footer><span>TimeTracker v2 · Authenticated cloud attendance</span><span>Presentation rebuilt; attendance policy and cloud records remain unchanged.</span></footer>
    </div>
    <div id="modalHost"></div>`;
    shellRoot = appRoot.querySelector('.app-shell');
  }
  const navRoot = shellRoot.querySelector('.nav-tabs');
  if (navRoot) navRoot.innerHTML = navMarkup;
  const header = shellRoot.querySelector('.topbar');
  header.innerHTML = `
    <div class="brand-mark" aria-hidden="true"><span></span></div>
    <div class="brand-copy"><strong>TimeTracker</strong><span>Workforce · v2</span></div>
    <div class="tt-v2-header-context"><span>Current space</span><strong>${esc(activeViewLabel)}</strong></div>
    <div class="principal-pill"><span>${esc(currentUser()?.name || 'User')}</span><strong>${esc(currentUser()?.role || DEFAULT_ROLE)}</strong></div>
    <div class="status-pill ${active ? 'online' : ''}"><span class="status-dot"></span>${active ? 'Shift active' : 'Ready'}</div>`;
  const main = shellRoot.querySelector('[data-time-main]');
  main.innerHTML = renderView();
  const modalHost = document.getElementById('modalHost');
  if (modalHost) modalHost.innerHTML = '';
  bindEvents();
  enhanceModernSelects(appRoot);
  enhanceScreenPresentation(appRoot);
  globalThis.WorkManagementMotion?.refreshIndicators?.(shellRoot);
  globalThis.TimeTrackerV2Motion?.enhance?.(shellRoot);
  updateDynamicValues();
  scheduleTick();
  if (view === 'clock') void maybePrefetchGps();
}

function enhanceScreenPresentation(root = document) {
  root.querySelectorAll('.filter-panel label,.selector-grid label,.note-field,.overview-control-dock label,.tt-v2-overlay-surface form label').forEach((label) => label.classList.add('wm-field'));
  root.querySelectorAll('.filter-panel input,.filter-panel select,.selector-grid input,.selector-grid select,.note-field input,.overview-control-dock input,.overview-control-dock select,.tt-v2-overlay-surface input,.tt-v2-overlay-surface select,.tt-v2-overlay-surface textarea').forEach((control) => control.classList.add('wm-field-control','wm-control--md'));
  root.querySelectorAll('.filter-panel label > span,.selector-grid label > span,.note-field > span,.tt-v2-overlay-surface label > span').forEach((label) => label.classList.add('wm-field-label'));
  root.querySelectorAll('.filter-footer-actions,.filter-actions,.export-actions,.section-actions,.calendar-nav,.modal-actions').forEach((row) => row.classList.add('wm-action-row'));
  root.querySelectorAll('.log-table,.attendance-table,.documents-table,.rbac-table').forEach((table) => table.classList.add('wm-table'));
  root.querySelectorAll('[data-tt-v2-screen] .wm-panel,[data-tt-v2-screen] .log-record,[data-tt-v2-screen] .ot-card,[data-tt-v2-screen] .role-card').forEach((surface) => surface.classList.add('tt-v2-surface'));
  globalThis.TimeTrackerV2Motion?.enhance?.(root);
}

function renderView() {
  if (view === 'clock') return renderClock();
  if (view === 'log') return renderLog();
  if (view === 'reports') return renderReports();
  if (view === 'calendar') return renderCalendar();
  if (view === 'ot') return renderOt();
  if (view === 'roles') return renderRoles();
  return renderOverview();
}

function renderClock() {
  const active = activeRecord();
  const m = metrics();
  const approvedOt = active ? approvedOtForAttendance(active) : { durationMinutes: 0 };
  const clockState = active ? (approvedOt.durationMinutes ? 'ot-extended' : 'shift-active') : 'ready';
  const stateLabel = active ? (approvedOt.durationMinutes ? `Shift active · ${otDurationText(approvedOt.durationMinutes)} OT` : 'Shift active · credited work running') : 'Ready for attendance capture';
  return `<section class="clock-view wm-screen ${pageAnimationClass}" data-ui-screen="clock" data-tt-v2-screen="clock">
    <div class="intro-grid wm-page-header tt-v2-reveal tt-v2-depth-structure">
      <div><p class="eyebrow">TIMETRACKER V2 · YOUR WORKDAY</p><h1>Own the rhythm<br><em>of your shift.</em></h1><p class="lede">A spatial attendance console for precise Clock In / Clock Out, workplace context, and event-based GPS evidence. The visual system is new; attendance policy and cloud persistence remain unchanged.</p><span class="tt-v2-state-chip ${active ? (approvedOt.durationMinutes ? 'is-ot' : 'is-active') : ''}"><i></i>${esc(stateLabel)}</span></div>
      <div class="date-stack tt-v2-depth-info"><span id="liveFullDate">${fmtFullDate.format(new Date(now))}</span><strong id="liveTopClock">${fmtTime.format(new Date(now))}</strong></div>
    </div>
    <div class="clock-layout">
      <section class="clock-card wm-panel tt-v2-reveal" data-clock-state="${clockState}">
        <div class="tt-v2-clock-state"><span><i></i>${active ? 'Live attendance session' : 'Attendance console'}</span><strong>${active ? esc(attendanceClassification(active)) : 'Event GPS · no continuous tracking'}</strong></div>
        <div class="card-kicker"><span>01</span> Attendance context</div>
        <div class="selector-grid wm-form-grid">
          <label class="wm-field"><span class="wm-field-label">Location</span><select id="locationSelect" class="wm-field-control">${options(LOCATIONS, state.selection.location, 'Choose work location')}</select></label>
          <label class="wm-field"><span class="wm-field-label">Department</span><select id="departmentSelect" class="wm-field-control">${options(DEPARTMENTS, state.selection.department, 'Choose department')}</select></label>
        </div>
        ${shouldShowWorkNote() ? (currentWorkNoteRequirement() ? `<label class="note-field work-note-required wm-field"><span>Work note <small>required for Offsite (Home)</small></span><input id="noteInput" class="wm-field-control" maxlength="180" value="${esc(note)}" placeholder="${active ? 'Describe the offsite work completed before clocking out…' : 'Describe the work you will perform offsite…'}" required aria-required="true" aria-describedby="workNoteHelp workNoteError"><small id="workNoteHelp" class="field-help">Required because Offsite (Home) is selected for a non-System Admin user.</small><small id="workNoteError" class="field-error" role="alert" aria-live="polite"></small></label>` : `<label class="note-field wm-field"><span>Work note <small>optional · System Admin</small></span><input id="noteInput" class="wm-field-control" maxlength="180" value="${esc(note)}" placeholder="${active ? 'Add an offsite closing note…' : 'Add an optional offsite work note…'}"></label>`) : ''}
        <section class="gps-panel" aria-label="Automatic GPS attendance evidence">
          <div class="gps-panel-head"><div><span class="mini-label">GPS / GEOLOCATION</span><strong>Automatic location evidence</strong></div><div class="gps-auto-badge"><span></span>Automatic</div></div>
          <div class="gps-policy" aria-label="GPS policy"><span>GPS capture enabled</span><span>Successful fix required</span><span>High accuracy preferred</span></div>
          <div id="gpsStatus" class="gps-status"><strong>Automatic GPS ready</strong><span>Your location will be obtained automatically when Clock In or Clock Out requires it.</span></div>
          <p class="privacy-note">No manual GPS action is required. Coordinates are requested only for attendance events (plus a short-lived prefetch when permission is already granted), are persisted with the attendance record in the authenticated cloud workspace and are never continuously tracked. Browser geolocation requires HTTPS.</p>
        </section>
        <div class="clock-face-wrap tt-v2-depth-info"><div class="clock-face ${active ? 'running' : ''}"><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><div class="clock-face-content"><span>${active ? 'CREDITED WORK' : 'LOCAL TIME'}</span><strong id="liveClockFace">${active ? formatDuration(durationMs(active)) : fmtTime.format(new Date(now))}</strong><small>${active ? `Started ${fmtTime.format(new Date(active.clockIn.timestamp))} · ${attendanceClassification(active)}` : 'Ready when you are'}</small></div></div></div>
        <div class="clock-actions wm-action-row">
          <button id="clockIn" class="clock-btn clock-in wm-button wm-button--primary wm-control--lg" ${active ? 'disabled' : ''}><span class="button-icon">↗</span><span><small>BEGIN SHIFT</small>Clock In</span></button>
          <button id="clockOut" class="clock-btn clock-out wm-button wm-button--secondary wm-control--lg" ${!active ? 'disabled' : ''}><span class="button-icon">↘</span><span><small>END SHIFT</small>Clock Out</span></button>
        </div>
        ${active ? (()=>{const activeOt=approvedOtForAttendance(active);const effectiveHours=(effectiveRequiredWorkMs(active)/(60*60*1000));return `<div class="active-context"><div><span>Started at</span><strong>${esc(active.clockIn.location)}</strong></div><div><span>Status</span><strong>${attendanceClassification(active)}</strong></div><div><span>Approved OT</span><strong>${activeOt.durationMinutes?otDurationText(activeOt.durationMinutes):'None'}</strong></div><div><span>Required credited work</span><strong>${Number.isInteger(effectiveHours)?effectiveHours:effectiveHours.toFixed(2)}h</strong></div><div><span>Auto clock-out</span><strong>${fmtTime.format(autoClockOutTimeForRecord(active))}</strong></div><div><span>Clock-in GPS</span><strong>${esc(geoSummary(active.clockIn.geo))}</strong></div></div>`})() : ''}
      </section>
      <aside class="side-panel wm-panel tt-v2-reveal tt-v2-depth-info"><div class="card-kicker"><span>02</span> Workday timeline</div>
        <div class="metric feature"><span>Credited work today</span><strong id="todayWorked">${formatDuration(m.todayMs)}</strong><small>12:00–1:00 PM unpaid break excluded</small></div>
        <div class="metric-row"><div class="metric"><span>This week</span><strong id="weekWorkedShort">${formatDuration(m.weekMs).slice(0,5)}</strong><small>Mon → today</small></div><div class="metric"><span>Completed</span><strong>${m.completed.length}</strong><small>All sessions</small></div></div>
        <div class="form-notice"><strong>Attendance schedule:</strong> 8:00 AM standard start · Late after 8:00 AM · 12:00–1:00 PM unpaid break · 9 base credited hours required · approved OT extends the threshold · auto clock-out at the exact applicable credited threshold.</div><div class="rule"></div><div class="recent-title"><span>Recent activity</span><button data-view="log">Open Log</button></div>
        <div class="recent-list">${ownRecords().slice(0, 3).map((r) => `<article><span class="activity-marker ${r.clockOut ? '' : 'live'}"></span><div><strong>${r.clockOut ? 'Completed shift' : 'Clocked in'}</strong><span>${fmtDate.format(new Date(r.clockIn.timestamp))} · ${esc(r.clockIn.department)}</span></div><time>${fmtTime.format(new Date(r.clockIn.timestamp))}</time></article>`).join('') || '<div class="empty-mini">Your first attendance event will appear here.</div>'}</div>
      </aside>
    </div>
  </section>`;
}

function recordMatches(record, filters) {
  const q = (filters.query || '').trim().toLowerCase();
  if (filters.status === 'active' && record.clockOut) return false;
  if (filters.status === 'complete' && !record.clockOut) return false;
  if (filters.department && record.clockIn.department !== filters.department && record.clockOut?.department !== filters.department) return false;
  if (filters.location && record.clockIn.location !== filters.location && record.clockOut?.location !== filters.location) return false;
  const start = new Date(record.clockIn.timestamp).getTime();
  const from = parseLocalDate(filters.from)?.getTime();
  const to = parseLocalDate(filters.to, true)?.getTime();
  if (from && start < from) return false;
  if (to && start > to) return false;
  if (q) {
    const haystack = [record.id, record.clockIn.location, record.clockIn.department, record.clockOut?.location ?? '', record.clockOut?.department ?? '', record.note ?? ''].join(' ').toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function logRecords() {
  const rows = accessibleRecords().filter((r) => recordMatches(r, ui.log));
  const sort = ui.log.sort;
  return rows.sort((a, b) => {
    if (sort === 'oldest') return new Date(a.clockIn.timestamp) - new Date(b.clockIn.timestamp);
    if (sort === 'duration-desc') return durationMs(b) - durationMs(a);
    if (sort === 'duration-asc') return durationMs(a) - durationMs(b);
    if (sort === 'department') return a.clockIn.department.localeCompare(b.clockIn.department);
    if (sort === 'location') return a.clockIn.location.localeCompare(b.clockIn.location);
    return new Date(b.clockIn.timestamp) - new Date(a.clockIn.timestamp);
  });
}


function filteredAudit() {
  const f = ui.audit;
  const from = parseLocalDate(f.from)?.getTime();
  const to = parseLocalDate(f.to, true)?.getTime();
  const q = (f.query || '').trim().toLowerCase();
  const rows = audit.filter((e) => {
    const ts = new Date(e.timestamp).getTime();
    if (from && ts < from) return false;
    if (to && ts > to) return false;
    if (f.action !== 'all' && e.action !== f.action) return false;
    if (q) {
      const hay = [e.id,e.recordId,e.action,e.location,e.department,e.message,geoSummary(e.geo)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return rows.sort((a,b) => f.sort === 'oldest' ? new Date(a.timestamp)-new Date(b.timestamp) : new Date(b.timestamp)-new Date(a.timestamp));
}

function auditActionLabel(action) {
  return ({CLOCK_IN:'Clock In',CLOCK_OUT:'Clock Out',GPS_EVIDENCE:'GPS evidence linked',RECORD_EDIT:'Record edited',RECORD_DELETE:'Record deleted',GPS_CAPTURE:'GPS capture',EXPORT:'Export',CUSTOM_EVENT_ADD:'Calendar event added',CUSTOM_EVENT_DELETE:'Calendar event deleted',RBAC_USER_CREATE:'RBAC user created',RBAC_ROLE_CHANGE:'Role changed',RBAC_USER_STATUS:'User status changed'})[action] || String(action || 'Activity').replaceAll('_',' ');
}

function recordAuditEvents(record) {
  return audit
    .filter((event) => event.recordId === record.id || String(event.eventRef || '').startsWith(`${record.id}:`))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function recordGpsPoints(record) {
  const points = [];
  if (geoCoordinates(record.clockIn?.geo)) points.push({ type: 'Clock In', kind: 'in', timestamp: record.clockIn.timestamp, location: record.clockIn.location, department: record.clockIn.department, geo: record.clockIn.geo });
  if (record.clockOut && geoCoordinates(record.clockOut.geo)) points.push({ type: 'Clock Out', kind: 'out', timestamp: record.clockOut.timestamp, location: record.clockOut.location, department: record.clockOut.department, geo: record.clockOut.geo });
  return points;
}

function recordIsExpanded(id) {
  return Array.isArray(ui.log.expanded) && ui.log.expanded.includes(id);
}

function safeDomId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}

function metadataRows(metadata) {
  if (!metadata || typeof metadata !== 'object') return '<span class="empty-inline">No additional metadata.</span>';
  const entries = Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null && typeof value !== 'object');
  return entries.length ? entries.map(([key,value]) => `<span><b>${esc(key)}</b>${esc(String(value))}</span>`).join('') : '<span class="empty-inline">No additional metadata.</span>';
}

function renderGeoEvidence(label, event) {
  const geo = event?.geo;
  const captured = geoCoordinates(geo);
  return `<article class="evidence-card">
    <div class="evidence-card-head"><span>${esc(label)}</span><strong>${captured ? 'GPS captured' : esc(geoSummary(geo))}</strong></div>
    <dl class="evidence-grid">
      <div><dt>Timestamp</dt><dd>${event?.timestamp ? esc(fmtFullDate.format(new Date(event.timestamp)) + ' · ' + fmtTime.format(new Date(event.timestamp))) : 'Not recorded'}</dd></div>
      <div><dt>Location</dt><dd>${esc(event?.location || 'Not recorded')}</dd></div>
      <div><dt>Department</dt><dd>${esc(event?.department || 'Not recorded')}</dd></div>
      <div><dt>Coordinates</dt><dd>${captured ? `${Number(geo.latitude).toFixed(6)}, ${Number(geo.longitude).toFixed(6)}` : 'No coordinates'}</dd></div>
      <div><dt>Accuracy</dt><dd>${captured ? `±${Math.round(geo.accuracy || 0)} m` : '—'}</dd></div>
      <div><dt>Captured at</dt><dd>${geo?.capturedAt ? esc(fmtFullDate.format(new Date(geo.capturedAt)) + ' · ' + fmtTime.format(new Date(geo.capturedAt))) : '—'}</dd></div>
      <div><dt>Source</dt><dd>${esc(geo?.source || '—')}</dd></div>
      <div><dt>Permission</dt><dd>${esc(geo?.permission || '—')}</dd></div>
      <div><dt>Altitude</dt><dd>${Number.isFinite(geo?.altitude) ? `${Number(geo.altitude).toFixed(1)} m` : '—'}</dd></div>
      <div><dt>Speed</dt><dd>${Number.isFinite(geo?.speed) ? `${Number(geo.speed).toFixed(2)} m/s` : '—'}</dd></div>
      <div><dt>Heading</dt><dd>${Number.isFinite(geo?.heading) ? `${Number(geo.heading).toFixed(0)}°` : '—'}</dd></div>
      <div><dt>Status</dt><dd>${esc(geo?.status || 'not-requested')}</dd></div>
    </dl>
  </article>`;
}

function renderRecordAudit(record) {
  const events = recordAuditEvents(record);
  if (!events.length) return '<div class="record-empty"><strong>No linked audit events.</strong><span>New attendance actions and record-management changes will appear here automatically.</span></div>';
  return `<div class="record-audit-timeline">${events.map((event) => `<article class="record-audit-event">
    <div class="timeline-dot" aria-hidden="true"></div>
    <div class="record-audit-content">
      <div class="record-audit-head"><div><span class="audit-badge">${esc(auditActionLabel(event.action))}</span>${event.source === 'legacy-reconstruction' ? '<span class="derived-badge">Derived</span>' : ''}</div><time>${esc(fmtFullDate.format(new Date(event.timestamp)))} · ${esc(fmtTime.format(new Date(event.timestamp)))}</time></div>
      <p>${esc(event.message || `${auditActionLabel(event.action)} activity recorded.`)}</p>
      <div class="audit-meta"><span>${esc(event.location || 'No location')}</span><span>${esc(event.department || 'No department')}</span><span>${esc(geoSummary(event.geo))}</span><span>${esc(event.source || 'application')}</span></div>
      ${event.changes ? `<details class="audit-change-detail"><summary>View change payload</summary><pre>${esc(JSON.stringify(event.changes, null, 2))}</pre></details>` : ''}
      <div class="activity-metadata">${metadataRows(event.metadata)}</div>
    </div>
  </article>`).join('')}</div>`;
}

function renderRecordMap(record) {
  const points = recordGpsPoints(record);
  const domId = safeDomId(record.id);
  if (!points.length) return '<div class="record-empty"><strong>No map-ready GPS coordinates.</strong><span>The attendance record remains valid, but neither clock event contains a captured coordinate pair.</span></div>';
  return `<div class="record-map-shell">
    <div id="recordMap-${domId}" class="record-map" data-record-map-host="${esc(record.id)}">
      <div class="map-placeholder compact-map-placeholder"><strong>${points.length} GPS ${points.length === 1 ? 'location' : 'locations'} available</strong><span>Map tiles remain off until you load this record’s interactive map. Loading uses OpenStreetMap and sends map-tile requests to that provider.</span><button class="primary-action" data-load-record-map="${esc(record.id)}">Load GPS map</button></div>
    </div>
    <div class="record-map-actions">${points.map((point) => `<button data-focus-record-map="${esc(record.id)}|${point.kind}"><span>${point.type}</span><strong>${esc(point.location)}</strong><small>${esc(geoSummary(point.geo))}</small></button>`).join('')}</div>
  </div>`;
}

function renderExpandedRecord(record) {
  const events = recordAuditEvents(record);
  return `<div class="record-detail tt-v2-record-detail" id="record-detail-${safeDomId(record.id)}" ${recordIsExpanded(record.id) ? '' : 'hidden'}>
    <div class="record-detail-toolbar tt-v2-record-detail-toolbar">
      <div><span class="mini-label">COMPLETE RECORD DATASET</span><strong>${events.length} linked audit ${events.length === 1 ? 'event' : 'events'} · ${recordGpsPoints(record).length} map-ready GPS ${recordGpsPoints(record).length === 1 ? 'point' : 'points'}</strong></div>
      ${hasPermission(PERMISSIONS.ATTENDANCE_EXPORT) ? `<button data-export-record="${esc(record.id)}" class="wm-button wm-button--secondary wm-control--md">Export record JSON</button>` : ''}
    </div>
    <section class="record-detail-section tt-v2-evidence-plane" aria-labelledby="attendance-${safeDomId(record.id)}">
      <div class="record-detail-heading"><div><span>01</span><h3 id="attendance-${safeDomId(record.id)}">Attendance evidence</h3></div><p>Clock-event facts are read directly from the persisted attendance record.</p></div>
      <div class="record-facts">
        <div><span>Record ID</span><strong>${esc(record.id)}</strong></div>
        <div><span>Status</span><strong>${record.clockOut ? 'Completed' : 'Active'}</strong></div>
        <div><span>Record owner</span><strong>${esc(recordOwner(record)?.name || record.ownerName || 'Unknown')}</strong></div>
        <div><span>Created</span><strong>${record.createdAt ? esc(fmtFullDate.format(new Date(record.createdAt)) + ' · ' + fmtTime.format(new Date(record.createdAt))) : 'Legacy record'}</strong></div>
        <div><span>Last updated</span><strong>${record.updatedAt ? esc(fmtFullDate.format(new Date(record.updatedAt)) + ' · ' + fmtTime.format(new Date(record.updatedAt))) : 'Not available'}</strong></div>
        <div><span>Attendance classification</span><strong>${attendanceClassification(record)}</strong></div>
        <div><span>Credited work</span><strong>${formatDuration(durationMs(record))}</strong></div>
        <div><span>Elapsed span</span><strong>${formatDuration(elapsedDurationMs(record))}</strong></div>
        <div><span>Unpaid break deducted</span><strong>${formatDuration(Math.max(0, elapsedDurationMs(record) - durationMs(record)))}</strong></div>
        <div><span>Auto clock-out</span><strong>${record.clockOut?.automatic ? 'Yes · policy enforced' : 'No'}</strong></div>
        <div><span>Note</span><strong>${esc(record.note || 'No note')}</strong></div>
      </div>
      <div class="evidence-columns">${hasPermission(PERMISSIONS.GPS_VIEW_EXACT) ? `${renderGeoEvidence('Clock In', record.clockIn)}${renderGeoEvidence('Clock Out', record.clockOut)}` : `<div class="access-redaction"><strong>Exact GPS evidence restricted</strong><span>Your role can review attendance context but not precise device coordinates or geolocation metadata.</span></div>`}</div>
    </section>
    <section class="record-detail-section tt-v2-evidence-plane" aria-labelledby="audit-${safeDomId(record.id)}">
      <div class="record-detail-heading"><div><span>02</span><h3 id="audit-${safeDomId(record.id)}">Audit trail</h3></div><p>Only audit activity explicitly linked to this attendance record is shown.</p></div>
      ${hasPermission(PERMISSIONS.AUDIT_VIEW) ? renderRecordAudit(record) : '<div class="access-redaction"><strong>Audit trail restricted</strong><span>This role does not have access to detailed audit payloads.</span></div>'}
    </section>
    <section class="record-detail-section tt-v2-evidence-plane" aria-labelledby="map-${safeDomId(record.id)}">
      <div class="record-detail-heading"><div><span>03</span><h3 id="map-${safeDomId(record.id)}">GPS map</h3></div><p>Inspect captured clock-in and clock-out positions without mixing data from other attendance records.</p></div>
      ${hasPermission(PERMISSIONS.GPS_VIEW_EXACT) ? renderRecordMap(record) : '<div class="access-redaction"><strong>GPS map restricted</strong><span>Precise location visualization is not available to this role.</span></div>'}
    </section>
  </div>`;
}

function destroyLeafletMap() {
  if (leafletMap) {
    try { leafletMap.remove(); } catch {}
  }
  leafletMap = null;
  leafletLayer = null;
  leafletRecordId = null;
}

function loadRecordLeafletMap(recordId) {
  if (!requirePermission(PERMISSIONS.GPS_VIEW_EXACT, 'Your role cannot view exact GPS coordinates.')) return;
  const record = state.records.find((item) => item.id === recordId);
  if (!record || !canAccessRecord(record)) return notify('The attendance record is unavailable or outside your authorization scope.', 'error');
  const host = document.getElementById(`recordMap-${safeDomId(recordId)}`);
  const points = recordGpsPoints(record);
  if (!host || !points.length) return notify('This record has no map-ready GPS coordinates.', 'error');
  const button = host.querySelector('[data-load-record-map]');
  if (button) { button.disabled = true; button.textContent = 'Loading map…'; button.setAttribute('aria-busy', 'true'); }
  host.classList.add('is-loading');
  const init = () => {
    if (!document.body.contains(host)) return;
    destroyLeafletMap();
    host.innerHTML = '';
    host.classList.remove('is-loading');
    try {
      leafletMap = L.map(host, { zoomControl: true });
      leafletRecordId = recordId;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(leafletMap);
      leafletLayer = L.featureGroup(points.map((point) => L.marker([point.geo.latitude, point.geo.longitude]).bindPopup(`<strong>${esc(point.type)}</strong><br>${esc(point.location)}<br>${esc(point.department)}<br>${esc(fmtFullDate.format(new Date(point.timestamp)))}<br>${esc(geoSummary(point.geo))}`))).addTo(leafletMap);
      const bounds = leafletLayer.getBounds();
      if (points.length === 1) leafletMap.setView([points[0].geo.latitude, points[0].geo.longitude], 16);
      else leafletMap.fitBounds(bounds.pad(.25), { maxZoom: 16 });
      window.setTimeout(() => leafletMap?.invalidateSize(), 80);
    } catch (error) {
      console.error(error);
      destroyLeafletMap();
      host.innerHTML = '<div class="map-placeholder compact-map-placeholder"><strong>Map initialization failed.</strong><span>The GPS coordinates remain available in this record and its exports.</span><button class="secondary-action" data-load-record-map="'+esc(recordId)+'">Retry map</button></div>';
    }
  };
  if (globalThis.L) return init();
  if (!document.querySelector('link[data-leaflet]')) {
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; link.dataset.leaflet = '1'; document.head.append(link);
  }
  const existing = document.querySelector('script[data-leaflet]');
  if (existing) {
    if (globalThis.L) return init();
    existing.addEventListener('load', init, { once: true });
    existing.addEventListener('error', () => {
      host.classList.remove('is-loading');
      host.innerHTML = `<div class="map-placeholder compact-map-placeholder"><strong>Map library could not load.</strong><span>Your stored GPS evidence is unaffected. Check the network connection and retry.</span><button class="secondary-action" data-load-record-map="${esc(recordId)}">Retry map</button></div>`;
    }, { once: true });
    return;
  }
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.dataset.leaflet = '1';
  script.onload = init;
  script.onerror = () => {
    script.remove();
    host.classList.remove('is-loading');
    host.innerHTML = `<div class="map-placeholder compact-map-placeholder"><strong>Map library could not load.</strong><span>Your stored GPS evidence is unaffected. Check the network connection and retry.</span><button class="secondary-action" data-load-record-map="${esc(recordId)}">Retry map</button></div>`;
  };
  document.head.append(script);
}

function focusRecordMap(token) {
  const [recordId, kind] = String(token || '').split('|');
  if (!leafletMap || leafletRecordId !== recordId) return notify('Load this record’s GPS map first.', 'info');
  const record = state.records.find((item) => item.id === recordId);
  const geo = kind === 'in' ? record?.clockIn?.geo : record?.clockOut?.geo;
  if (!geoCoordinates(geo)) return notify('That clock event has no captured coordinates.', 'error');
  leafletMap.setView([geo.latitude, geo.longitude], Math.max(leafletMap.getZoom(), 16), { animate: true });
}

function exportSingleRecord(recordId) {
  if (!requirePermission(PERMISSIONS.ATTENDANCE_EXPORT, 'Your role cannot export attendance data.')) return;
  const record = state.records.find((item) => item.id === recordId);
  if (!record || !canAccessRecord(record)) return notify('The attendance record is unavailable or outside your authorization scope.', 'error');
  const attendance = JSON.parse(JSON.stringify(record));
  if (!hasPermission(PERMISSIONS.GPS_VIEW_EXACT)) { if (attendance.clockIn) attendance.clockIn.geo = { status: attendance.clockIn.geo?.status || 'restricted', restricted: true }; if (attendance.clockOut) attendance.clockOut.geo = { status: attendance.clockOut.geo?.status || 'restricted', restricted: true }; }
  const payload = { exportedAt: new Date().toISOString(), attendance, auditTrail: hasPermission(PERMISSIONS.AUDIT_VIEW) ? recordAuditEvents(record) : [], authorization: { role: currentUser()?.role, gpsRedacted: !hasPermission(PERMISSIONS.GPS_VIEW_EXACT), auditRedacted: !hasPermission(PERMISSIONS.AUDIT_VIEW) } };
  download(`timetracker-record-${record.id}.json`, 'application/json;charset=utf-8', JSON.stringify(payload, null, 2));
  auditEvent('EXPORT', record, { message: 'Attendance record and linked audit trail exported as JSON.' });
  notify('Record JSON exported.', 'success');
}

function toggleRecordExpanded(recordId, trigger) {
  const record = state.records.find((item) => item.id === recordId);
  if (!record) return notify('The attendance record no longer exists.', 'error');
  const detail = document.getElementById(`record-detail-${safeDomId(recordId)}`);
  if (!detail) return;
  const expanded = !detail.hidden;
  if (expanded && leafletRecordId === recordId) destroyLeafletMap();
  const nextExpanded = !expanded;
  animateRecordDisclosure(detail, nextExpanded);
  trigger?.setAttribute('aria-expanded', String(nextExpanded));
  trigger?.closest('.log-record')?.classList.toggle('expanded', nextExpanded);
  const set = new Set(Array.isArray(ui.log.expanded) ? ui.log.expanded : []);
  if (expanded) set.delete(recordId); else set.add(recordId);
  ui.log.expanded = [...set].filter((id) => state.records.some((record) => record.id === id));
  saveUi();
}

function renderLogRows() {
  const rows = logRecords();
  return rows.map((record, index) => {
    const expanded = recordIsExpanded(record.id);
    const auditCount = recordAuditEvents(record).length;
    const gpsCount = recordGpsPoints(record).length;
    const dayKey = localDateKey(record.clockIn.timestamp);
    return `<article class="log-record tt-v2-log-record tt-v2-reveal ${expanded ? 'expanded' : ''}" data-tt-v2-record-date="${esc(dayKey || '')}" style="--delay:${Math.min(index * 25, 180)}ms;--tt-v2-record-index:${index}">
      <span class="tt-v2-log-node" aria-hidden="true"></span>
      <div class="log-record-summary">
        <button class="record-toggle" data-toggle-record="${esc(record.id)}" aria-expanded="${expanded}" aria-controls="record-detail-${safeDomId(record.id)}">
          <span class="record-chevron" aria-hidden="true">⌄</span>
          <span class="record-summary-primary"><span class="record-status ${record.clockOut ? 'complete' : 'active'}">${record.clockOut ? 'Completed' : 'Active'}</span><strong>${esc(fmtDate.format(new Date(record.clockIn.timestamp)))}</strong><small>${attendanceClassification(record)} · ${esc(record.id)}</small></span>
          <span class="record-summary-journey"><span><b>IN</b><strong>${esc(fmtTime.format(new Date(record.clockIn.timestamp)))}</strong><small>${esc(record.clockIn.location)} · ${esc(record.clockIn.department)}</small></span><i aria-hidden="true"></i><span><b>OUT</b><strong>${record.clockOut ? esc(fmtTime.format(new Date(record.clockOut.timestamp))) : 'In progress'}</strong><small>${record.clockOut ? `${esc(record.clockOut.location)} · ${esc(record.clockOut.department)}` : 'Awaiting clock out'}</small></span></span>
          <span class="record-summary-evidence">${hasPermission(PERMISSIONS.AUDIT_VIEW) ? `<span><b>${auditCount}</b> audit ${auditCount === 1 ? 'event' : 'events'}</span>` : '<span><b>—</b> audit restricted</span>'}${hasPermission(PERMISSIONS.GPS_VIEW_EXACT) ? `<span><b>${gpsCount}</b> GPS ${gpsCount === 1 ? 'point' : 'points'}</span>` : '<span><b>—</b> GPS restricted</span>'}</span>
          <span class="record-summary-duration"><small>Credited work</small><strong data-record-duration="${esc(record.id)}">${formatDuration(durationMs(record))}</strong><span>${humanHours(durationMs(record))}</span></span>
        </button>
        <div class="record-actions">${hasPermission(PERMISSIONS.ATTENDANCE_EDIT) ? `<button data-edit-record="${esc(record.id)}" class="wm-button wm-button--ghost wm-control--sm">Edit</button>` : ''}${hasPermission(PERMISSIONS.ATTENDANCE_DELETE) ? `<button class="danger-text wm-button wm-button--ghost wm-control--sm" data-delete-record="${esc(record.id)}" ${!record.clockOut ? 'disabled title="Active records cannot be deleted"' : ''}>Delete</button>` : ''}</div>
      </div>
      ${renderExpandedRecord(record)}
    </article>`;
  }).join('') || '<div class="empty-state tt-v2-empty"><strong>No matching attendance records.</strong><span>Adjust filters or clock in to create a record.</span></div>';
}

function renderLog() {
  const records = logRecords();
  const count = records.length;
  const expandedCount = records.filter((record) => recordIsExpanded(record.id)).length;
  const activeCount = records.filter((record) => !record.clockOut).length;
  return `<section class="${pageAnimationClass} content-view log-view wm-screen tt-v2-screen tt-v2-screen--log" data-ui-screen="log" data-tt-v2-screen="log">
    <div class="section-heading wm-page-header tt-v2-page-intro tt-v2-reveal tt-v2-depth-structure"><div><p class="eyebrow">ATTENDANCE TRACEABILITY · V2</p><h2>Chronological evidence,<br><em>without the visual noise.</em></h2><p>Each attendance record remains a self-contained evidence package. Expand only the record you need while the chronology stays spatially anchored.</p></div><div class="export-actions wm-action-row">${hasPermission(PERMISSIONS.ATTENDANCE_EXPORT) ? '<button id="logExportCsv" class="wm-button wm-button--secondary wm-control--md">Export attendance CSV</button>' : ''}${hasPermission(PERMISSIONS.AUDIT_EXPORT) ? '<button id="auditExportCsv" class="wm-button wm-button--secondary wm-control--md">Export audit CSV</button>' : ''}${hasPermission(PERMISSIONS.BACKUP_EXPORT) ? '<button id="exportJson" class="wm-button wm-button--secondary wm-control--md">Backup JSON</button>' : ''}</div></div>
    <div class="tt-v2-log-context tt-v2-reveal"><div><span>Visible chronology</span><strong>${count}</strong><small>RBAC-scoped ${count === 1 ? 'record' : 'records'}</small></div><div><span>Expanded</span><strong>${expandedCount}</strong><small>Progressive detail surfaces</small></div><div><span>Active</span><strong>${activeCount}</strong><small>${activeCount ? 'Live attendance in scope' : 'No active record in scope'}</small></div><div><span>Access</span><strong>${esc(overviewScopeLabel())}</strong><small>Permissions remain authoritative</small></div></div>
    <section class="filter-panel wm-panel tt-v2-filter-deck tt-v2-reveal"><div class="filter-grid log-filter-grid">
      <label class="grow"><span>Search</span><input id="logQuery" value="${esc(ui.log.query)}" placeholder="ID, location, department or note…"></label>
      <label><span>Status</span><select id="logStatus"><option value="all" ${ui.log.status === 'all' ? 'selected' : ''}>All records</option><option value="complete" ${ui.log.status === 'complete' ? 'selected' : ''}>Completed</option><option value="active" ${ui.log.status === 'active' ? 'selected' : ''}>Active</option></select></label>
      <label><span>Department</span><select id="logDepartment">${options(DEPARTMENTS, ui.log.department, 'All departments')}</select></label><label><span>Location</span><select id="logLocation">${options(LOCATIONS, ui.log.location, 'All locations')}</select></label><label><span>From</span><input id="logFrom" type="date" value="${esc(ui.log.from)}"></label><label><span>To</span><input id="logTo" type="date" value="${esc(ui.log.to)}"></label><label><span>Sort</span><select id="logSort"><option value="newest" ${ui.log.sort === 'newest' ? 'selected' : ''}>Newest first</option><option value="oldest" ${ui.log.sort === 'oldest' ? 'selected' : ''}>Oldest first</option><option value="duration-desc" ${ui.log.sort === 'duration-desc' ? 'selected' : ''}>Longest duration</option><option value="duration-asc" ${ui.log.sort === 'duration-asc' ? 'selected' : ''}>Shortest duration</option><option value="department" ${ui.log.sort === 'department' ? 'selected' : ''}>Department</option><option value="location" ${ui.log.sort === 'location' ? 'selected' : ''}>Location</option></select></label>
    </div><div class="filter-footer"><span id="logResultCount">${count} ${count === 1 ? 'record' : 'records'} shown · ${expandedCount} expanded</span><div class="filter-footer-actions"><button id="expandAllRecords" class="text-button wm-button wm-button--ghost wm-control--md">Expand all</button><button id="collapseAllRecords" class="text-button wm-button wm-button--ghost wm-control--md">Collapse all</button><button id="clearLogFilters" class="text-button wm-button wm-button--ghost wm-control--md">Reset filters</button></div></div></section>
    <div class="log-list tt-v2-log-timeline" id="logList" aria-label="Attendance chronology">${renderLogRows()}</div>
  </section>`;
}

function refreshLogRows() {
  destroyLeafletMap();
  const list = document.getElementById('logList');
  if (!list) return;
  list.innerHTML = renderLogRows();
  const records = logRecords();
  const expandedCount = records.filter((record) => recordIsExpanded(record.id)).length;
  setText('#logResultCount', `${records.length} ${records.length === 1 ? 'record' : 'records'} shown · ${expandedCount} expanded`);
  updateDynamicValues();
}

function reportDateRange() {
  const preset = ui.reports.preset;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  let from = null;
  let to = new Date(today);
  if (preset === 'today') {
    from = new Date(); from.setHours(0, 0, 0, 0);
  } else if (preset === '7d' || preset === '30d' || preset === '90d') {
    const days = Number.parseInt(preset, 10);
    from = new Date(); from.setDate(from.getDate() - (days - 1)); from.setHours(0, 0, 0, 0);
  } else if (preset === 'month') {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (preset === 'year') {
    from = new Date(today.getFullYear(), 0, 1);
  } else if (preset === 'all') {
    from = null; to = null;
  } else {
    from = parseLocalDate(ui.reports.from);
    to = parseLocalDate(ui.reports.to, true);
  }
  return { from, to };
}

function reportRecords() {
  const { from, to } = reportDateRange();
  return accessibleRecords().filter((r) => {
    const start = new Date(r.clockIn.timestamp).getTime();
    if (from && start < from.getTime()) return false;
    if (to && start > to.getTime()) return false;
    if (ui.reports.department && r.clockIn.department !== ui.reports.department && r.clockOut?.department !== ui.reports.department) return false;
    if (ui.reports.location && r.clockIn.location !== ui.reports.location && r.clockOut?.location !== ui.reports.location) return false;
    return true;
  });
}

function reportStats(records) {
  const totalMs = records.reduce((sum, r) => sum + durationMs(r), 0);
  const completed = records.filter((r) => r.clockOut);
  const completedMs = completed.reduce((sum, r) => sum + durationMs(r), 0);
  const days = new Set(records.map((r) => localDateKey(r.clockIn.timestamp)));
  const overtimeMs = records.reduce((sum, r) => sum + Math.max(0, durationMs(r) - ATTENDANCE_POLICY.requiredWorkMs), 0);
  return {
    totalMs,
    completed: completed.length,
    active: records.length - completed.length,
    days: days.size,
    averageMs: completed.length ? completedMs / completed.length : 0,
    overtimeMs,
  };
}

function aggregateBy(records, getter) {
  const map = new Map();
  for (const record of records) {
    const key = getter(record);
    map.set(key, (map.get(key) ?? 0) + durationMs(record));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function dailyAggregate(records) {
  const map = new Map();
  for (const r of records) {
    const key = localDateKey(r.clockIn.timestamp);
    const item = map.get(key) || { ms: 0, count: 0 };
    item.ms += durationMs(r);
    item.count += 1;
    map.set(key, item);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function renderDistribution(records, field) {
  const entries = aggregateBy(records, (r) => r.clockIn[field]);
  const max = entries[0]?.[1] || 1;
  if (!entries.length) return '<div class="empty-mini">No data for this range.</div>';
  return `<div class="report-bars">${entries.map(([label, ms]) => `<div class="report-bar-row"><div><strong>${esc(label)}</strong><span>${humanHours(ms)}</span></div><div class="report-track"><span style="width:${Math.max(3, (ms / max) * 100)}%"></span></div></div>`).join('')}</div>`;
}

function renderTrend(records) {
  const data = dailyAggregate(records);
  if (!data.length) return '<div class="empty-state compact-empty"><strong>No trend data.</strong><span>The chart appears once matching attendance exists.</span></div>';
  const max = Math.max(...data.map(([, value]) => value.ms), 1);
  const trimmed = data.slice(-31);
  return `<div class="trend-chart" aria-label="Daily recorded time chart">${trimmed.map(([key, value]) => {
    const d = parseLocalDate(key);
    return `<div class="trend-column" title="${esc(fmtFullDate.format(d))}: ${humanHours(value.ms)}"><div class="trend-value" style="height:${Math.max(4, (value.ms / max) * 100)}%"></div><span>${d.getDate()}</span></div>`;
  }).join('')}</div>`;
}

function renderReports() {
  const records = reportRecords();
  const stats = reportStats(records);
  const range = reportDateRange();
  const rangeText = range.from || range.to ? `${range.from ? fmtDate.format(range.from) : 'Beginning'} – ${range.to ? fmtDate.format(range.to) : 'Now'}` : 'All recorded dates';
  return `<section class="${pageAnimationClass} content-view report-view wm-screen tt-v2-screen tt-v2-screen--reports" data-ui-screen="reports" data-tt-v2-screen="reports">
    <div class="section-heading wm-page-header tt-v2-page-intro tt-v2-reveal tt-v2-depth-structure"><div><p class="eyebrow">ATTENDANCE REPORTS · V2</p><h2>Dense information,<br><em>quiet presentation.</em></h2><p>Filter and export attendance inside your authorized record scope. Reports intentionally use the least parallax of any v2 workspace.</p></div><div class="export-actions wm-action-row">${hasPermission(PERMISSIONS.REPORTS_EXPORT) ? '<button id="reportExportCsv" class="wm-button wm-button--secondary wm-control--md">Export report CSV</button><button id="printReport" class="wm-button wm-button--secondary wm-control--md">Print report</button>' : ''}</div></div>
    <section class="filter-panel wm-panel report-filter-panel tt-v2-filter-deck tt-v2-reveal">
      <div class="filter-grid report-filter-grid">
        <label><span>Period</span><select id="reportPreset"><option value="today" ${ui.reports.preset === 'today' ? 'selected' : ''}>Today</option><option value="7d" ${ui.reports.preset === '7d' ? 'selected' : ''}>Last 7 days</option><option value="30d" ${ui.reports.preset === '30d' ? 'selected' : ''}>Last 30 days</option><option value="90d" ${ui.reports.preset === '90d' ? 'selected' : ''}>Last 90 days</option><option value="month" ${ui.reports.preset === 'month' ? 'selected' : ''}>This month</option><option value="year" ${ui.reports.preset === 'year' ? 'selected' : ''}>This year</option><option value="all" ${ui.reports.preset === 'all' ? 'selected' : ''}>All time</option><option value="custom" ${ui.reports.preset === 'custom' ? 'selected' : ''}>Custom</option></select></label>
        <label><span>Department</span><select id="reportDepartment">${options(DEPARTMENTS, ui.reports.department, 'All departments')}</select></label>
        <label><span>Location</span><select id="reportLocation">${options(LOCATIONS, ui.reports.location, 'All locations')}</select></label>
        <label class="custom-range ${ui.reports.preset === 'custom' ? 'visible' : ''}"><span>From</span><input id="reportFrom" type="date" value="${esc(ui.reports.from)}"></label>
        <label class="custom-range ${ui.reports.preset === 'custom' ? 'visible' : ''}"><span>To</span><input id="reportTo" type="date" value="${esc(ui.reports.to)}"></label>
      </div>
      <div class="filter-footer"><span>${esc(rangeText)} · ${records.length} ${records.length === 1 ? 'record' : 'records'}</span><button id="resetReportFilters" class="text-button wm-button wm-button--ghost wm-control--md">Reset report</button></div>
    </section>
    <div class="report-kpis tt-v2-report-summary tt-v2-reveal" aria-label="Current report summary">
      <article class="report-kpi primary"><span>Recorded time</span><strong id="reportTotal">${humanHours(stats.totalMs)}</strong><small>Selected record set</small></article>
      <article class="report-kpi"><span>Completed sessions</span><strong>${stats.completed}</strong><small>${stats.active} active</small></article>
      <article class="report-kpi"><span>Average shift</span><strong>${humanHours(stats.averageMs)}</strong><small>Completed sessions only</small></article>
      <article class="report-kpi"><span>Active days</span><strong>${stats.days}</strong><small>Unique attendance dates</small></article>
      <article class="report-kpi"><span>Over required 9h</span><strong>${humanHours(stats.overtimeMs)}</strong><small>Existing report calculation</small></article>
    </div>
    <div class="reports-layout tt-v2-report-workspace">
      <section class="report-card wm-panel wide tt-v2-reveal"><div class="report-card-head"><div><p class="eyebrow">DAILY TREND</p><h3>Recorded time by day</h3></div><span>Up to 31 latest matching days</span></div>${renderTrend(records)}</section>
      <section class="report-card wm-panel tt-v2-reveal"><div class="report-card-head"><div><p class="eyebrow">DEPARTMENTS</p><h3>Time distribution</h3></div></div>${renderDistribution(records, 'department')}</section>
      <section class="report-card wm-panel tt-v2-reveal"><div class="report-card-head"><div><p class="eyebrow">LOCATIONS</p><h3>Workplace distribution</h3></div></div>${renderDistribution(records, 'location')}</section>
    </div>
  </section>`;
}


function calendarEventsForDay(key) {
  return [...PH_HOLIDAYS_2026, ...(ui.calendar.customEvents || [])].filter((e)=>e.date===key);
}

function eventTypeLabel(type) {
  return ({regular:'Regular holiday','special-nonworking':'Special non-working','special-working':'Special working day',custom:'Custom event'})[type] || type;
}

function addCalendarEvent(form) {
  if (!requirePermission(PERMISSIONS.CALENDAR_MANAGE, 'Your role cannot create calendar events.')) return;
  const data=new FormData(form); const date=String(data.get('date')||''); const name=String(data.get('name')||'').trim();
  if (!parseLocalDate(date) || !name) return notify('Enter a valid event date and name.', 'error');
  ui.calendar.customEvents.push({id:uid(),date,name,type:'custom',official:false});
  saveUi(); auditEvent('CUSTOM_EVENT_ADD',null,{message:`Calendar event added: ${name}.`,metadata:{date,...deviceMetadata()}}); closeModal(); render({animate:false}); notify('Calendar event added.','success');
}

function openAddCalendarEvent() {
  const date=ui.calendar.selected || localDateKey(new Date());
  document.getElementById('modalHost').innerHTML=`<div class="modal-backdrop tt-v2-overlay-backdrop" data-close-modal><section class="modal tt-v2-overlay-surface" role="dialog" aria-modal="true" aria-labelledby="calendarEventTitle" onclick="event.stopPropagation()"><div class="modal-head"><div><p class="eyebrow">CALENDAR EVENT</p><h3 id="calendarEventTitle">Add local event</h3></div><button class="modal-close" data-close-modal aria-label="Close">×</button></div><form id="calendarEventForm"><label><span>Date</span><input name="date" type="date" required value="${esc(date)}"></label><label><span>Event name</span><input name="name" maxlength="100" required placeholder="Company event, local holiday, deadline…"></label><div class="form-notice">Official nationwide Philippine holidays are maintained separately and cannot be deleted here.</div><div class="modal-actions"><button type="button" data-close-modal>Cancel</button><button type="submit" class="primary-action">Add event</button></div></form></section></div>`;
  bindModalEvents(); document.getElementById('calendarEventForm')?.addEventListener('submit',(e)=>{e.preventDefault();addCalendarEvent(e.currentTarget)});
}

function deleteCalendarEvent(id) {
  if (!requirePermission(PERMISSIONS.CALENDAR_MANAGE, 'Your role cannot delete calendar events.')) return;
  const event=(ui.calendar.customEvents||[]).find((e)=>e.id===id); if(!event)return;
  ui.calendar.customEvents=ui.calendar.customEvents.filter((e)=>e.id!==id); saveUi(); auditEvent('CUSTOM_EVENT_DELETE',null,{message:`Calendar event deleted: ${event.name}.`,metadata:{date:event.date,...deviceMetadata()}}); render({animate:false}); notify('Calendar event removed.','success');
}

function calendarMonthDate() {
  const [y, m] = (ui.calendar.cursor || monthKey(new Date())).split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1);
}

function calendarMonthRecords() {
  const cursor = calendarMonthDate();
  return accessibleRecords().filter((r) => {
    const d = new Date(r.clockIn.timestamp);
    return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth();
  });
}

function recordsForDay(key) {
  return accessibleRecords().filter((r) => localDateKey(r.clockIn.timestamp) === key);
}

function calendarCells() {
  const cursor = calendarMonthDate();
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startOffset = first.getDay();
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startOffset);
  const result = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    result.push(d);
  }
  return result;
}

function renderCalendarGrid() {
  const cursor = calendarMonthDate();
  return calendarCells().map((d) => {
    const key = localDateKey(d); const rows = recordsForDay(key); const events=calendarEventsForDay(key);
    const ms = rows.reduce((sum, r) => sum + durationMs(r), 0); const outside=d.getMonth()!==cursor.getMonth(); const selected=key===ui.calendar.selected; const today=key===localDateKey(new Date());
    const eventLabels = events.length
      ? `<div class="calendar-event-labels" aria-label="${esc(events.map(e=>e.name).join(', '))}">${events.map((e)=>`<span class="holiday-label holiday-${esc(e.type)}">${esc(e.name)}</span>`).join('')}</div>`
      : '';
    return `<button class="calendar-day ${outside?'outside':''} ${selected?'selected':''} ${today?'today':''} ${events.length?'has-event':''}" data-calendar-day="${key}" aria-label="${esc(fmtFullDate.format(d))}${events.length ? `, ${esc(events.map(e=>e.name).join(', '))}` : ''}"><span class="day-number">${d.getDate()}</span>${eventLabels}${rows.length?`<div class="day-summary"><strong>${humanHours(ms)}</strong><small>${rows.length} ${rows.length===1?'session':'sessions'}</small></div><span class="calendar-dot" aria-hidden="true"></span>`:'<span class="day-empty" aria-hidden="true">—</span>'}${events.length?'<span class="event-dot" aria-hidden="true"></span>':''}</button>`;
  }).join('');
}

function renderSelectedDay() {
  const key=ui.calendar.selected; const date=parseLocalDate(key)||new Date(); const rows=recordsForDay(key); const total=rows.reduce((sum,r)=>sum+durationMs(r),0); const events=calendarEventsForDay(key);
  return `<div class="day-detail-head"><div><span>${fmtFullDate.format(date)}</span><strong>${humanHours(total)}</strong></div><small>${rows.length} ${rows.length===1?'session':'sessions'}</small></div>
    <div class="day-events">${events.map((e)=>`<article class="calendar-event ${e.official?'official':''}"><div><span>${esc(eventTypeLabel(e.type))}</span><strong>${esc(e.name)}</strong></div>${!e.official && hasPermission(PERMISSIONS.CALENDAR_MANAGE)?`<button data-delete-calendar-event="${esc(e.id)}" aria-label="Delete event">×</button>`:''}</article>`).join('')||'<div class="empty-mini">No holiday or calendar event on this date.</div>'}</div>
    <div class="day-records">${rows.map((r)=>`<article><div><span class="activity-marker ${r.clockOut?'':'live'}"></span><div><strong>${fmtTimeShort.format(new Date(r.clockIn.timestamp))} → ${r.clockOut?fmtTimeShort.format(new Date(r.clockOut.timestamp)):'Active'}</strong><small>${esc(r.clockIn.location)} · ${esc(r.clockIn.department)}${hasPermission(PERMISSIONS.GPS_VIEW_EXACT) ? `<br>${esc(geoSummary(r.clockIn.geo))}` : ''}</small></div></div><div class="day-record-actions"><strong data-record-duration="${esc(r.id)}">${formatDuration(durationMs(r),false)}</strong>${hasPermission(PERMISSIONS.ATTENDANCE_EDIT) ? `<button data-calendar-edit="${esc(r.id)}">Open</button>` : ''}</div></article>`).join('')||'<div class="empty-mini">No attendance was recorded on this date.</div>'}</div>`;
}

function renderCalendar() {
  const cursor=calendarMonthDate(); const monthRows=calendarMonthRecords(); const monthMs=monthRows.reduce((sum,r)=>sum+durationMs(r),0); const activeDays=new Set(monthRows.map((r)=>localDateKey(r.clockIn.timestamp))).size; const monthEvents=[...PH_HOLIDAYS_2026,...(ui.calendar.customEvents||[])].filter(e=>{const d=parseLocalDate(e.date);return d&&d.getFullYear()===cursor.getFullYear()&&d.getMonth()===cursor.getMonth()});
  return `<section class="${pageAnimationClass} content-view calendar-view wm-screen tt-v2-screen tt-v2-screen--calendar" data-ui-screen="calendar" data-tt-v2-screen="calendar"><div class="section-heading wm-page-header tt-v2-page-intro tt-v2-reveal tt-v2-depth-structure"><div><p class="eyebrow">ATTENDANCE + PH CALENDAR · V2</p><h2>${fmtMonthYear.format(cursor)}</h2><p>Attendance context and official Philippine holidays share one readable month plane. Motion supports navigation, never date scanning.</p></div><div class="calendar-nav wm-action-row tt-v2-calendar-nav"><button id="calendarPrev" class="wm-button wm-button--ghost wm-control--md" aria-label="Previous month">←</button><button id="calendarToday" class="wm-button wm-button--secondary wm-control--md">Today</button>${hasPermission(PERMISSIONS.CALENDAR_MANAGE) ? '<button id="addCalendarEvent" class="wm-button wm-button--primary wm-control--md">+ Event</button>' : ''}<button id="calendarNext" class="wm-button wm-button--ghost wm-control--md" aria-label="Next month">→</button></div></div>
    <div class="calendar-summary tt-v2-calendar-summary tt-v2-reveal"><div><span>Viewing</span><strong>${fmtMonthYear.format(cursor)}</strong></div><div><span>Recorded</span><strong id="calendarMonthTotal">${humanHours(monthMs)}</strong></div><div><span>Active days</span><strong>${activeDays}</strong></div><div><span>Sessions</span><strong>${monthRows.length}</strong></div><div><span>Calendar events</span><strong>${monthEvents.length}</strong></div></div>
    <div class="holiday-legend tt-v2-calendar-legend"><span><i class="legend-regular"></i>Regular holiday</span><span><i class="legend-special"></i>Special non-working/working</span><span><i class="legend-custom"></i>Custom event</span></div>
    <div class="calendar-layout tt-v2-calendar-stage"><section class="calendar-card wm-panel tt-v2-reveal"><div class="calendar-weekdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-grid" id="calendarGrid">${renderCalendarGrid()}</div></section><aside class="day-detail wm-panel tt-v2-day-focus tt-v2-reveal"><div class="card-kicker"><span>DAY</span> Selected date</div><div id="selectedDayDetail">${renderSelectedDay()}</div></aside></div>
    <p class="calendar-source-note">2026 nationwide holidays are based on Philippine Proclamation No. 1006 and the subsequently proclaimed nationwide Eid’l Fitr and Eid’l Adha dates. Local/provincial holidays vary by locality and can be added as custom events.</p>
  </section>`;
}

function breakdownEntries(field, at = now) {
  const map = new Map();
  for (const r of ownRecords()) map.set(r.clockIn[field], (map.get(r.clockIn[field]) ?? 0) + durationMs(r, at));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function breakdown(field) {
  const entries = breakdownEntries(field);
  const max = entries[0]?.[1] ?? 1;
  if (!entries.length) return '<div class="empty-mini">No data yet.</div>';
  return `<div class="breakdown-list">${entries.map(([label, ms]) => `<div class="breakdown-row" data-breakdown-field="${field}" data-breakdown-key="${encodeURIComponent(label)}"><div><strong>${esc(label)}</strong><span class="breakdown-duration">${formatDuration(ms)}</span></div><div class="bar"><span style="width:${Math.max(4, (ms / max) * 100)}%"></span></div></div>`).join('')}</div>`;
}


function permissionLabel(permission) {
  return ({
    [PERMISSIONS.CLOCK_USE]:'Clock attendance',[PERMISSIONS.LOG_VIEW_SELF]:'View own Log',[PERMISSIONS.LOG_VIEW_TEAM]:'View department Log',[PERMISSIONS.LOG_VIEW_ALL]:'View organization Log',[PERMISSIONS.GPS_VIEW_EXACT]:'View exact GPS',[PERMISSIONS.AUDIT_VIEW]:'View audit details',[PERMISSIONS.ATTENDANCE_EDIT]:'Edit attendance',[PERMISSIONS.ATTENDANCE_DELETE]:'Delete attendance',[PERMISSIONS.REPORTS_VIEW]:'View Reports',[PERMISSIONS.REPORTS_EXPORT]:'Export Reports',[PERMISSIONS.CALENDAR_VIEW]:'View Calendar',[PERMISSIONS.CALENDAR_MANAGE]:'Manage Calendar',[PERMISSIONS.ROLES_VIEW]:'View Roles',[PERMISSIONS.USERS_MANAGE]:'Manage users',[PERMISSIONS.ROLE_ASSIGN_STANDARD]:'Assign standard roles',[PERMISSIONS.ROLE_ASSIGN_ADMIN]:'Assign admin roles',[PERMISSIONS.ATTENDANCE_EXPORT]:'Export attendance',[PERMISSIONS.AUDIT_EXPORT]:'Export audit',[PERMISSIONS.BACKUP_EXPORT]:'Export full backup'
  })[permission] || permission;
}

function renderOt() {
  const rows=otFilteredRequests(); const me=currentUser(); const pending=rows.filter(r=>r.status==='Submitted'); const mine=ot.requests.filter(r=>r.ownerId===me?.id);
  const approved=rows.filter(r=>r.status==='Approved').length; const rejected=rows.filter(r=>r.status==='Rejected').length; const drafts=rows.filter(r=>r.status==='Draft').length;
  const activityAllowed=hasPermission(PERMISSIONS.OT_ACTIVITY_VIEW);
  return `<section class="ot-view wm-screen tt-v2-screen tt-v2-screen--ot ${pageAnimationClass}" data-ui-screen="ot" data-tt-v2-screen="ot">
    <div class="section-heading wm-page-header tt-v2-page-intro tt-v2-reveal tt-v2-depth-structure"><div><p class="eyebrow">OVERTIME WORKFLOW · V2</p><h2>Requests move through<br><em>deliberate states.</em></h2><p>Create, submit, review, and trace overtime without changing authorization, approved-duration calculations, or attendance integration.</p></div><div class="section-actions wm-action-row">${hasPermission(PERMISSIONS.OT_CREATE)?'<button id="newOtRequest" class="primary-action wm-button wm-button--primary wm-control--md" type="button">+ New OT request</button>':''}</div></div>
    <div class="tt-v2-ot-stateflow tt-v2-reveal" aria-label="Overtime request states"><div data-state="draft"><span>01</span><strong>Draft</strong><small>${drafts} visible</small></div><i aria-hidden="true">→</i><div data-state="submitted"><span>02</span><strong>Pending</strong><small>${pending.length} awaiting decision</small></div><i aria-hidden="true">→</i><div data-state="approved"><span>03A</span><strong>Approved</strong><small>${approved} approved</small></div><div data-state="rejected"><span>03B</span><strong>Rejected</strong><small>${rejected} rejected</small></div><div class="tt-v2-ot-mine"><span>MY REQUESTS</span><strong>${mine.length}</strong></div></div>
    <section class="filter-panel wm-panel ot-filter-panel tt-v2-filter-deck tt-v2-reveal">
      <label class="search-wide"><span>Search</span><input id="otQuery" value="${esc(ui.ot.query)}" placeholder="Employee, request ID, task, reason…"></label>
      <label><span>Status</span><select id="otStatus">${[['all','All statuses'],['Draft','Draft'],['Submitted','Submitted'],['Approved','Approved'],['Rejected','Rejected']].map(([v,l])=>`<option value="${v}" ${ui.ot.status===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <label><span>Scope</span><select id="otScope"><option value="accessible" ${ui.ot.scope==='accessible'?'selected':''}>Accessible</option><option value="mine" ${ui.ot.scope==='mine'?'selected':''}>My requests</option></select></label>
      <label><span>From</span><input id="otFrom" type="date" value="${esc(ui.ot.from)}"></label><label><span>To</span><input id="otTo" type="date" value="${esc(ui.ot.to)}"></label>
      <label><span>Sort</span><select id="otSort">${[['newest','Recently updated'],['oldest','Oldest created'],['date','OT date'],['duration','Longest duration']].map(([v,l])=>`<option value="${v}" ${ui.ot.sort===v?'selected':''}>${l}</option>`).join('')}</select></label>
      <div class="filter-actions"><button id="resetOtFilters" class="wm-button wm-button--ghost wm-control--md" type="button">Reset</button><button id="exportOtCsv" class="wm-button wm-button--secondary wm-control--md" type="button">Export CSV</button>${activityAllowed?'<button id="toggleOtActivity" class="wm-button wm-button--secondary wm-control--md" type="button">Activity Log</button>':''}</div>
    </section>
    <div class="ot-list tt-v2-ot-workspace" id="otList">${renderOtRows(rows)}</div>
    ${activityAllowed && ui.ot.activityOpen ? renderOtActivityPanel() : ''}
  </section>`;
}
function renderOtRows(rows) {
  if(!rows.length) return `<div class="empty-state ot-empty tt-v2-empty"><strong>No OT requests found</strong><p>Create a new request or adjust the current filters.</p></div>`;
  return rows.map((r,index)=>{const owner=otRequestOwner(r);const mine=r.ownerId===currentUser()?.id;const canDecide=canApproveOtRequest(r);const decision=r.decision;
    return `<article class="ot-card tt-v2-ot-card tt-v2-reveal status-${otStatusClass(r.status)}" style="--tt-v2-record-index:${index}">
      <span class="tt-v2-ot-state-rail" aria-hidden="true"></span>
      <div class="ot-card-head"><div><span class="ot-status ${otStatusClass(r.status)}">${esc(r.status)}</span><strong>${esc(owner?.name||r.ownerName||'Unknown')}</strong><small>${esc(owner?.department||r.ownerDepartment||'—')} · ${esc(r.id)}</small></div><div class="ot-card-date"><strong>${fmtFullDate.format(parseLocalDate(r.date))}</strong><span>${esc(r.start)}–${esc(r.end)} · ${esc(otDurationText(r.durationMinutes))}</span></div></div>
      <div class="ot-card-grid"><div><span>Task / project</span><strong>${esc(r.task)}</strong></div><div><span>Location</span><strong>${esc(r.location||'Not specified')}</strong></div><div class="ot-reason"><span>Justification</span><p>${esc(r.reason)}</p></div></div>
      ${decision?`<div class="ot-decision ${decision.status.toLowerCase()}"><strong>${esc(decision.status)}</strong><span>${decision.byName?`by ${esc(decision.byName)} · `:''}${decision.at?fmtTimeShort.format(new Date(decision.at)):''}${decision.reason?` · ${esc(decision.reason)}`:''}</span></div>`:''}
      <div class="ot-card-foot"><div><small>Created ${fmtDate.format(new Date(r.createdAt))}${r.submittedAt?` · Submitted ${fmtDate.format(new Date(r.submittedAt))}`:''}</small></div><div class="ot-actions">
        ${canEditOtRequest(r)?`<button type="button" data-edit-ot="${esc(r.id)}">Edit</button><button type="button" class="primary-action" data-submit-ot="${esc(r.id)}">Submit</button>`:''}
        ${canWithdrawOtRequest(r)?`<button type="button" data-withdraw-ot="${esc(r.id)}">Withdraw</button>`:''}
        ${canDecide?`<button type="button" class="approve-action" data-approve-ot="${esc(r.id)}">Approve</button><button type="button" class="reject-action" data-reject-ot="${esc(r.id)}">Reject</button>`:''}
        ${isOtApprover() && r.status==='Submitted' && mine?'<span class="self-approval-note">Self-approval blocked</span>':''}
      </div></div>
    </article>`}).join('');
}
function renderOtActivityPanel() {
  if(!hasPermission(PERMISSIONS.OT_ACTIVITY_VIEW)) return '';
  const activityRows=accessibleOtActivity();
  const visible=activityRows.slice(0,250);
  return `<section class="ot-activity-panel tt-v2-activity-plane tt-v2-reveal"><div class="overview-panel-head"><div><p class="eyebrow">ADMINISTRATOR ONLY</p><h3>OT Activity Log</h3></div><div class="section-actions wm-action-row"><span>${activityRows.length} events</span><button id="exportOtActivity" type="button">Export activity</button></div></div><div class="ot-activity-list">${visible.length?visible.map(e=>`<div class="ot-activity-row"><span class="activity-icon">${e.action.includes('APPROVED')?'✓':e.action.includes('REJECTED')?'×':e.action.includes('SUBMITTED')?'↑':'•'}</span><div><strong>${esc(e.action.replace(/^OT_/,'').replaceAll('_',' '))}</strong><p>${esc(e.message||'OT activity recorded.')}</p><small>${esc(e.actorName||'Unknown')} · ${esc(e.actorRole||'')} · ${new Date(e.timestamp).toLocaleString()}${e.requestId?` · ${esc(e.requestId)}`:''}</small></div></div>`).join(''):'<div class="overview-empty-mini">No OT activity recorded yet.</div>'}</div></section>`;
}
function openOtRequestModal(id=null) {
  if(!requirePermission(PERMISSIONS.OT_CREATE,'Your role cannot create OT requests.')) return;
  const existing=id?ot.requests.find(r=>r.id===id):null;
  if(existing && !canEditOtRequest(existing)) return notify('This OT request is no longer editable.','error');
  editingOtRequestId=existing?.id||null; const today=localDateKey(new Date());
  const v=existing||{date:today,start:'18:00',end:'19:00',location:state.selection.location||'Office-Base Duty',task:'',reason:''};
  document.getElementById('modalHost').innerHTML=`<div class="modal-backdrop tt-v2-overlay-backdrop" data-close-modal><section class="modal ot-modal tt-v2-overlay-surface" role="dialog" aria-modal="true" aria-labelledby="otModalTitle" onclick="event.stopPropagation()"><div class="modal-head"><div><p class="eyebrow">OVERTIME REQUEST</p><h3 id="otModalTitle">${existing?'Edit OT request':'New OT request'}</h3></div><button class="modal-close" data-close-modal aria-label="Close">×</button></div><form id="otRequestForm"><div class="form-grid"><label><span>OT date</span><input name="date" type="date" required value="${esc(v.date)}"></label><label><span>Work location</span><select name="location">${options(LOCATIONS,v.location||'','Choose location')}</select></label></div><div class="form-grid"><label><span>Start time</span><input name="start" type="time" required value="${esc(v.start)}"></label><label><span>End time</span><input name="end" type="time" required value="${esc(v.end)}"></label></div><label><span>Project / task</span><input name="task" maxlength="120" required value="${esc(v.task)}" placeholder="Project, maintenance task, deployment, report…"></label><label><span>OT justification</span><textarea name="reason" maxlength="500" required placeholder="Explain why overtime is required…">${esc(v.reason)}</textarea></label><div class="form-notice">If the end time is earlier than the start time, TimeTracker treats it as an overnight OT period ending the following day. Minimum 15 minutes; maximum 16 hours.</div><div class="modal-actions"><button type="button" data-close-modal>Cancel</button><button type="submit" name="intent" value="draft">Save draft</button><button type="submit" name="intent" value="submit" class="primary-action">${existing?'Save & submit':'Create & submit'}</button></div></form></section></div>`;
  bindModalEvents();
}
function openOtDecisionModal(id,decision) {
  const r=ot.requests.find(x=>x.id===id); if(!r||!canApproveOtRequest(r)) return notify('You are not authorized to decide this OT request.','error');
  const rejecting=decision==='Rejected';
  document.getElementById('modalHost').innerHTML=`<div class="modal-backdrop tt-v2-overlay-backdrop" data-close-modal><section class="modal tt-v2-overlay-surface" role="dialog" aria-modal="true" aria-labelledby="otDecisionTitle" onclick="event.stopPropagation()"><div class="modal-head"><div><p class="eyebrow">OT APPROVAL</p><h3 id="otDecisionTitle">${decision} request</h3></div><button class="modal-close" data-close-modal aria-label="Close">×</button></div><form id="otDecisionForm" data-ot-id="${esc(id)}" data-decision="${decision}"><div class="form-notice">${esc(r.ownerName||otRequestOwner(r)?.name||'Employee')} · ${esc(r.date)} · ${esc(otDurationText(r.durationMinutes))}</div>${rejecting?'<label><span>Rejection reason</span><textarea name="reason" required minlength="3" maxlength="300" placeholder="Explain why the request is being rejected…"></textarea></label>':'<label><span>Approval note <small>optional</small></span><textarea name="reason" maxlength="300" placeholder="Optional approval note…"></textarea></label>'}<div class="modal-actions"><button type="button" data-close-modal>Cancel</button><button type="submit" class="${rejecting?'reject-action':'approve-action'}">Confirm ${decision.toLowerCase()}</button></div></form></section></div>`; bindModalEvents();
}

function renderRoles() {
  const me = currentUser();
  const canManage = false;
  const permissionOrder = Object.values(PERMISSIONS);
  const currentDef = roleDefinition(me?.role);
  return `<section class="${pageAnimationClass} content-view roles-view wm-screen tt-v2-screen tt-v2-screen--roles" data-ui-screen="roles" data-tt-v2-screen="roles">
    <div class="section-heading wm-page-header tt-v2-page-intro tt-v2-reveal tt-v2-depth-structure"><div><p class="eyebrow">AUTHORIZATION & ACCESS · V2</p><h2>Roles with<br><em>visible boundaries.</em></h2><p>Work Management cloud identity remains authoritative. TimeTracker presents role scope and permission boundaries without creating a competing authorization source.</p></div>${canManage ? '<div class="export-actions wm-action-row"><button id="addRbacUser" class="primary-action wm-button wm-button--primary wm-control--md" type="button"><span aria-hidden="true">+</span> Add user</button></div>' : ''}</div>
    <section class="rbac-current tt-v2-principal-plane tt-v2-reveal"><div class="tt-v2-principal-identity"><span class="avatar-dot">${esc((me?.name||'?').slice(0,1).toUpperCase())}</span><div><small>ACTIVE PRINCIPAL</small><strong>${esc(me?.name || 'Unknown user')}</strong><span>${esc(me?.email || '')}</span></div></div><div><span>Role</span><strong>${esc(me?.role || DEFAULT_ROLE)}</strong><small>${esc(currentDef.scope)} record scope</small></div><div><span>Privilege level</span><strong>${currentDef.level}</strong><small>${hasPermission(PERMISSIONS.ROLE_ASSIGN_ADMIN) ? 'Administrator authority' : 'Least-privilege boundary'}</small></div><div><span>Account state</span><strong>${me?.active===false?'Disabled':'Active'}</strong><small>Server-enforced identity</small></div></section>
    <section class="rbac-panel wm-panel tt-v2-role-plane tt-v2-reveal"><div class="report-card-head"><div><p class="eyebrow">ROLE CATALOG</p><h3>Authorization matrix</h3></div><span>Employee is the default role for newly created users.</span></div>
      <div class="role-cards tt-v2-role-cards">${ROLES.map((role)=>{const def=ROLE_DEFINITIONS[role];return `<article class="role-card ${role===me?.role?'current':''}"><div class="role-card-head"><div><strong>${esc(role)}</strong><span>Level ${def.level} · ${esc(def.scope)} scope</span></div>${ADMIN_ROLES.has(role)?'<span class="role-admin-badge">ADMIN</span>':''}</div><p>${esc(def.summary)}</p><div class="role-permissions">${permissionOrder.map((permission)=>`<span class="${def.permissions.includes(permission)?'allowed':'denied'}">${def.permissions.includes(permission)?'✓':'–'} ${esc(permissionLabel(permission))}</span>`).join('')}</div></article>`}).join('')}</div>
    </section>
    <section class="rbac-panel wm-panel tt-v2-directory-plane tt-v2-reveal"><div class="report-card-head"><div><p class="eyebrow">USER DIRECTORY</p><h3>Cloud role directory</h3></div><span>${rbac.users.length} authorized ${rbac.users.length===1?'account':'accounts'}</span></div>
      <div class="form-notice">Roles and account status are managed centrally in Work Management. This view is read-only so module-local state cannot diverge from server-enforced RBAC.</div>
      <div class="rbac-users">${rbac.users.map((user)=>`<article class="rbac-user"><div class="rbac-user-identity"><span class="avatar-dot">${esc((user.name||'?').slice(0,1).toUpperCase())}</span><div><strong>${esc(user.name)}</strong><span>${esc(user.email||'')} · ${user.active===false?'Disabled':'Active'}${user.id===me?.id?' · Current':''}</span></div></div><div class="rbac-user-role"><strong>${esc(user.role)}</strong><span>${esc(roleDefinition(user.role).scope)} scope</span></div></article>`).join('')}</div>
    </section>
  </section>`;
}
function openAddRbacUser() {
  if (!requirePermission(PERMISSIONS.USERS_MANAGE, 'Your role cannot create users.')) return;
  document.getElementById('modalHost').innerHTML = `<div class="modal-backdrop tt-v2-overlay-backdrop" data-close-modal><section class="modal tt-v2-overlay-surface" role="dialog" aria-modal="true" aria-labelledby="addUserTitle" onclick="event.stopPropagation()"><div class="modal-head"><div><p class="eyebrow">RBAC USER MANAGEMENT</p><h3 id="addUserTitle">Add user</h3></div><button class="modal-close" data-close-modal aria-label="Close">×</button></div><form id="addRbacUserForm"><label><span>Name</span><input name="name" maxlength="80" required placeholder="Full name"></label><div class="form-grid"><label><span>Department</span><select name="department" required>${options(DEPARTMENTS,'','Choose department')}</select></label><label><span>Role</span><select name="role" required>${ROLES.map((role)=>`<option value="${esc(role)}" ${role===DEFAULT_ROLE?'selected':''} ${!roleCanAssign(role)?'disabled':''}>${esc(role)}</option>`).join('')}</select></label></div><div class="form-notice">New users default to Employee. Administrator-equivalent roles can only be assigned by System Admin or IT Administrator.</div><div class="modal-actions"><button type="button" data-close-modal>Cancel</button><button type="submit" class="primary-action">Create user</button></div></form></section></div>`;
  bindModalEvents();
}
function createRbacUser(form) {
  if (!requirePermission(PERMISSIONS.USERS_MANAGE, 'Your role cannot create users.')) return;
  const data=new FormData(form); const name=String(data.get('name')||'').trim(); const department=String(data.get('department')||''); const role=String(data.get('role')||DEFAULT_ROLE);
  if (name.length<2) return notify('Enter a valid user name.', 'error');
  if (!DEPARTMENTS.includes(department)) return notify('Select a valid department.', 'error');
  if (!roleCanAssign(role)) return notify('You are not authorized to assign that role.', 'error');
  if (rbac.users.some((u)=>u.name.toLowerCase()===name.toLowerCase())) return notify('A local user with that name already exists.', 'error');
  const timestamp=new Date().toISOString(); const user={id:uid(),name,department,role,active:true,createdAt:timestamp,updatedAt:timestamp}; rbac.users.push(user); saveRbac(); auditEvent('RBAC_USER_CREATE',null,{message:`RBAC user created: ${name}.`,metadata:{userId:user.id,role,department,...deviceMetadata()}}); closeModal(); render({animate:false}); notify('User created.', 'success');
}
function saveRbacUserRole(userId) {
  if (!requirePermission(PERMISSIONS.USERS_MANAGE, 'Your role cannot change role assignments.')) return;
  const user=userById(userId); const select=document.querySelector(`[data-rbac-role="${CSS.escape(userId)}"]`); if(!user||!select) return notify('User assignment is unavailable.', 'error');
  if (user.id===currentUser()?.id) return notify('Changing your own role is blocked to prevent administrative lockout.', 'error');
  const nextRole=select.value; if(!roleCanAssign(nextRole)) return notify('You are not authorized to assign that role.', 'error');
  if (ADMIN_ROLES.has(user.role) && !hasPermission(PERMISSIONS.ROLE_ASSIGN_ADMIN)) return notify('Only System Admin or IT Administrator can modify administrator-equivalent accounts.', 'error');
  const previous=user.role; if(previous===nextRole) return notify('No role change is required.', 'info'); user.role=nextRole; user.updatedAt=new Date().toISOString(); saveRbac(); auditEvent('RBAC_ROLE_CHANGE',null,{message:`Role changed for ${user.name}: ${previous} → ${nextRole}.`,metadata:{userId:user.id,previousRole:previous,nextRole,changedBy:currentUser()?.id,...deviceMetadata()}}); render({animate:false}); notify('Role assignment updated.', 'success');
}

function toggleRbacUser(userId) {
  if (!requirePermission(PERMISSIONS.USERS_MANAGE, 'Your role cannot manage user status.')) return;
  const user=userById(userId); if(!user) return notify('User not found.', 'error');
  if(user.id===currentUser()?.id) return notify('You cannot disable your own active principal.', 'error');
  if(ADMIN_ROLES.has(user.role) && !hasPermission(PERMISSIONS.ROLE_ASSIGN_ADMIN)) return notify('Only System Admin or IT Administrator can change administrator-equivalent accounts.', 'error');
  user.active=user.active===false; user.updatedAt=new Date().toISOString(); saveRbac(); auditEvent('RBAC_USER_STATUS',null,{message:`${user.active?'Enabled':'Disabled'} RBAC user ${user.name}.`,metadata:{userId:user.id,role:user.role,active:user.active,changedBy:currentUser()?.id,...deviceMetadata()}}); render({animate:false}); notify(`User ${user.active?'enabled':'disabled'}.`,'success');
}


function overviewScopeLabel() {
  const def = roleDefinition();
  if (def.scope === 'all') return 'Organization scope';
  if (def.scope === 'team') return `${currentUser()?.department || 'Department'} scope`;
  return 'Personal scope';
}

function overviewAccessibleUsers() {
  const me = currentUser();
  if (!me) return [];
  if (hasPermission(PERMISSIONS.LOG_VIEW_ALL, me)) return rbac.users.filter((u) => u.active !== false);
  if (hasPermission(PERMISSIONS.LOG_VIEW_TEAM, me)) return rbac.users.filter((u) => u.active !== false && (u.id === me.id || u.department === me.department));
  return [me].filter((u) => u.active !== false);
}

function overviewTodayRecords(at = now) {
  const day = localDateKey(new Date(at));
  return accessibleRecords().filter((r) => localDateKey(r.clockIn.timestamp) === day);
}

function overviewFirstRecordByUser(records) {
  const map = new Map();
  [...records].sort((a,b)=>new Date(a.clockIn.timestamp)-new Date(b.clockIn.timestamp)).forEach((record)=>{
    if (!map.has(record.ownerId)) map.set(record.ownerId, record);
  });
  return map;
}

function overviewLatestRecordByUser(records) {
  const map = new Map();
  [...records].sort((a,b)=>new Date(b.clockIn.timestamp)-new Date(a.clockIn.timestamp)).forEach((record)=>{
    if (!map.has(record.ownerId)) map.set(record.ownerId, record);
  });
  return map;
}

function minutesOfDay(iso) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds()/60;
}

function overviewLateThresholdMinutes() { return ATTENDANCE_POLICY.standardClockInMinutes; }

function overviewLateMinutes(record) {
  return Math.max(0, Math.floor(minutesOfDay(record.clockIn.timestamp) - overviewLateThresholdMinutes()));
}

function overviewArrivalClass(record) {
  const delta = minutesOfDay(record.clockIn.timestamp) - overviewLateThresholdMinutes();
  if (delta > 0) return 'late';
  if (delta <= -30) return 'early';
  return 'ontime';
}

function overviewRecordMatchesFilters(record, at = now) {
  const q = (ui.overview.query || '').trim().toLowerCase();
  const owner = recordOwner(record);
  if (ui.overview.location && record.clockIn.location !== ui.overview.location && record.clockOut?.location !== ui.overview.location) return false;
  if (ui.overview.department && owner?.department !== ui.overview.department && record.clockIn.department !== ui.overview.department) return false;
  if (ui.overview.status === 'active' && record.clockOut) return false;
  if (ui.overview.status === 'completed' && !record.clockOut) return false;
  if (ui.overview.status === 'late' && overviewLateMinutes(record) <= 0) return false;
  if (ui.overview.status === 'stagnant' && (record.clockOut || durationMs(record, at) < 14*3600000)) return false;
  if (q) {
    const hay = [record.id, owner?.name, owner?.department, record.clockIn.location, record.clockIn.department, record.clockOut?.location, record.clockOut?.department, record.note].filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function overviewFilteredTodayRecords(at = now) {
  return overviewTodayRecords(at).filter((record) => overviewRecordMatchesFilters(record, at)).sort((a,b)=>{
    if (ui.overview.sort === 'oldest') return new Date(a.clockIn.timestamp)-new Date(b.clockIn.timestamp);
    if (ui.overview.sort === 'name') return (recordOwner(a)?.name||'').localeCompare(recordOwner(b)?.name||'');
    if (ui.overview.sort === 'duration') return durationMs(b, at)-durationMs(a, at);
    return new Date(b.clockIn.timestamp)-new Date(a.clockIn.timestamp);
  });
}

function overviewMetrics(at = now) {
  const allToday = overviewTodayRecords(at);
  const today = allToday.filter((record)=>overviewRecordMatchesFilters(record, at));
  const first = overviewFirstRecordByUser(today);
  const latest = overviewLatestRecordByUser(today);
  let users = overviewAccessibleUsers();
  if (ui.overview.department) users = users.filter((u)=>u.department===ui.overview.department);
  const q=(ui.overview.query||'').trim().toLowerCase();
  if (q) users = users.filter((u)=>[u.id,u.name,u.department,u.role].filter(Boolean).join(' ').toLowerCase().includes(q) || today.some((r)=>r.ownerId===u.id));
  if (ui.overview.location || ui.overview.status !== 'all') {
    const ids=new Set(today.map((r)=>r.ownerId)); users=users.filter((u)=>ids.has(u.id));
  }
  const active = [...latest.values()].filter((r)=>!r.clockOut);
  const completed = [...latest.values()].filter((r)=>!!r.clockOut);
  const onsite = active.filter((r)=>r.clockIn.location === 'Office-Base Duty').length;
  const arrivals = [...first.values()];
  const late = arrivals.filter((r)=>overviewLateMinutes(r)>0);
  const early = arrivals.filter((r)=>overviewArrivalClass(r)==='early');
  const ontime = arrivals.filter((r)=>overviewArrivalClass(r)==='ontime');
  const totalMs = today.reduce((sum,r)=>sum+durationMs(r,at),0);
  const avgMs = today.length ? totalMs/today.length : 0;
  const editedToday = audit.filter((e)=>e.action==='RECORD_EDIT' && localDateKey(e.timestamp)===localDateKey(new Date(at)) && (!e.recordId || today.some(r=>r.id===e.recordId))).length;
  const stagnant = active.filter((r)=>durationMs(r,at)>=14*3600000);
  return {today, first, latest, users, active, completed, onsite, arrivals, late, early, ontime, totalMs, avgMs, editedToday, stagnant};
}

function overviewPercent(value, total) { return total ? Math.round((value/total)*100) : 0; }
function overviewCompactDuration(ms) {
  const total = Math.max(0, Math.floor(ms/60000));
  const h = Math.floor(total/60), m = total%60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
function overviewInitials(name='') { return name.split(/\s+/).filter(Boolean).slice(0,2).map((p)=>p[0]?.toUpperCase()||'').join('') || '?'; }

function overviewLocationCards(metrics) {
  const active = metrics.active;
  const icons = ['⌂','⌂','⌖','✈','◎'];
  return `<div class="overview-location-grid">${LOCATIONS.map((location,index)=>{
    const count = active.filter((r)=>r.clockIn.location===location).length;
    const pct = overviewPercent(count, Math.max(1, active.length));
    const first = active.filter((r)=>r.clockIn.location===location).sort((a,b)=>new Date(a.clockIn.timestamp)-new Date(b.clockIn.timestamp))[0];
    return `<article class="overview-location-card ${count?'has-people':'empty'}"><div class="overview-location-top"><span class="overview-location-icon">${icons[index]}</span><span class="overview-location-count">${count}</span></div><div class="overview-location-name">${esc(location)}</div><div class="overview-location-track"><span style="width:${count?Math.max(8,pct):0}%"></span></div><div class="overview-location-meta"><span>${count ? `${pct}% of active` : 'No active employees'}</span><span>${first ? `from ${fmtTimeShort.format(new Date(first.clockIn.timestamp))}` : ''}</span></div></article>`;
  }).join('')}</div>`;
}

function overviewLocationDistribution(metrics) {
  const counts = LOCATIONS.map((loc)=>[loc,metrics.active.filter((r)=>r.clockIn.location===loc).length]).filter(([,c])=>c>0);
  const total = Math.max(1, counts.reduce((s,[,c])=>s+c,0));
  return `<section class="overview-panel overview-location-distribution"><div class="overview-panel-head"><div><p class="eyebrow">LOCATION DISTRIBUTION</p><h3>Active workforce</h3></div><strong>${metrics.active.length}</strong></div><div class="overview-stacked">${counts.length?counts.map(([label,count],i)=>`<span class="series-${(i%5)+1}" style="width:${(count/total)*100}%" title="${esc(label)}: ${count}">${count}</span>`).join(''):'<span class="empty-stack">No active attendance</span>'}</div><div class="overview-legend">${LOCATIONS.map((loc,i)=>`<span><i class="series-dot series-${(i%5)+1}"></i>${esc(loc)} · ${metrics.active.filter(r=>r.clockIn.location===loc).length}</span>`).join('')}</div></section>`;
}

function overviewClockInDistribution(metrics) {
  const rows = metrics.arrivals;
  const buckets = new Map();
  rows.forEach((r)=>{const d=new Date(r.clockIn.timestamp); const h=d.getHours(); buckets.set(h,(buckets.get(h)||0)+1)});
  const hours = [...buckets.keys()].sort((a,b)=>a-b);
  const max = Math.max(1,...buckets.values());
  const peakHour = hours.reduce((best,h)=>(buckets.get(h)||0)>(buckets.get(best)||0)?h:best,hours[0]??0);
  const label=(h)=>new Intl.DateTimeFormat(undefined,{hour:'numeric'}).format(new Date(2000,0,1,h));
  return `<section class="overview-panel overview-chart-panel"><div class="overview-panel-head"><div><p class="eyebrow">CLOCK-IN DISTRIBUTION</p><h3>Arrivals by hour</h3></div>${hours.length?`<span class="overview-badge">Peak: ${esc(label(peakHour))} (${buckets.get(peakHour)})</span>`:''}</div><div class="overview-bars" aria-label="Clock-in distribution">${hours.length?hours.map((h)=>`<div class="overview-bar-col"><span class="overview-bar-value" style="height:${Math.max(8,(buckets.get(h)/max)*100)}%"><b>${buckets.get(h)}</b></span><small>${esc(label(h))}</small></div>`).join(''):'<div class="overview-empty-mini">No arrivals in the selected scope today.</div>'}</div></section>`;
}

function overviewPulse(metrics) {
  const before = metrics.arrivals.filter((r)=>minutesOfDay(r.clockIn.timestamp)<overviewLateThresholdMinutes()).length;
  const cells = [
    ['✓',before,'Before threshold'],['◷',metrics.late.length,'Late today'],['⌁',metrics.active.length,'Still working'],['△',metrics.active.length,'No time-out'],['✎',metrics.editedToday,'Manual edits'],['△',metrics.stagnant.length,'Stagnant (14h+)']
  ];
  return `<section class="overview-panel overview-pulse"><div class="overview-panel-head"><div><p class="eyebrow">ATTENDANCE PULSE</p><h3>Operational signals</h3></div><span>${metrics.today.length} records</span></div><div class="overview-pulse-grid">${cells.map(([icon,value,label])=>`<div><span>${icon}</span><strong>${value}</strong><small>${label}</small></div>`).join('')}</div></section>`;
}

function overviewLateArrivals(metrics) {
  const rows=[...metrics.late].sort((a,b)=>overviewLateMinutes(b)-overviewLateMinutes(a));
  return `<section class="overview-panel overview-late"><div class="overview-panel-head"><div><p class="eyebrow">LATE ARRIVALS</p><h3>Past 08:00</h3></div><span class="overview-badge">${rows.length} late</span></div><div class="overview-late-list">${rows.length?rows.slice(0,12).map((record)=>{const owner=recordOwner(record);return `<button type="button" data-overview-open-log="${esc(record.id)}"><span><strong>${esc(owner?.name||record.ownerName||'Unknown user')}</strong><small>◷ ${fmtTimeShort.format(new Date(record.clockIn.timestamp))}</small></span><em>+${overviewLateMinutes(record)}m</em></button>`}).join(''):'<div class="overview-empty-mini">No late arrivals for the current threshold.</div>'}</div></section>`;
}

function overviewArrivalPattern(metrics) {
  const arrivals = metrics.arrivals;
  const min=5*60,max=12*60,range=max-min;
  const dots=arrivals.map((record)=>{const mins=Math.min(max,Math.max(min,minutesOfDay(record.clockIn.timestamp)));const left=((mins-min)/range)*100;const cls=overviewArrivalClass(record);return `<button type="button" class="arrival-dot ${cls}" style="left:${left}%" title="${esc(recordOwner(record)?.name||'Employee')} · ${fmtTimeShort.format(new Date(record.clockIn.timestamp))}" data-overview-open-log="${esc(record.id)}" aria-label="${esc(recordOwner(record)?.name||'Employee')} clocked in at ${esc(fmtTimeShort.format(new Date(record.clockIn.timestamp)))}"></button>`}).join('');
  const rate=overviewPercent(metrics.early.length+metrics.ontime.length,metrics.arrivals.length);
  return `<section class="overview-panel overview-arrival"><div class="overview-panel-head"><div><p class="eyebrow">ARRIVAL PATTERN</p><h3>First clock-in distribution</h3></div><span class="overview-badge">${rate}% on-time</span></div><div class="arrival-band"><div class="arrival-zones"><span>EARLY</span><span>ON-TIME</span><span>LATE</span></div><div class="arrival-line">${dots}</div></div><div class="arrival-scale">${[5,6,7,8,9,10,11,12].map(h=>`<span>${h>12?h-12:h}${h>=12?'PM':'AM'}</span>`).join('')}</div><div class="overview-legend"><span><i class="arrival-key early"></i>Early (${metrics.early.length})</span><span><i class="arrival-key ontime"></i>On-time (${metrics.ontime.length})</span><span><i class="arrival-key late"></i>Late (${metrics.late.length})</span></div></section>`;
}

function overviewDepartmentBreakdown(metrics) {
  const active=metrics.active; const counts=DEPARTMENTS.map((dep)=>[dep,active.filter((r)=>recordOwner(r)?.department===dep).length]).filter(([,c])=>c>0).sort((a,b)=>b[1]-a[1]); const max=Math.max(1,...counts.map(([,c])=>c));
  return `<section class="overview-panel overview-departments"><div class="overview-panel-head"><div><p class="eyebrow">DEPARTMENT BREAKDOWN</p><h3>Active employees</h3></div><span>${counts.length} depts · ${active.length} total</span></div><div class="overview-dept-list">${counts.length?counts.map(([dep,count],i)=>`<div class="overview-dept-row"><div><span><i class="series-dot series-${(i%5)+1}"></i>${esc(dep)}</span><strong>${count} <small>(${overviewPercent(count,active.length)}%)</small></strong></div><div class="overview-dept-track"><span class="series-${(i%5)+1}" style="width:${Math.max(5,(count/max)*100)}%"></span></div></div>`).join(''):'<div class="overview-empty-mini">No active departments.</div>'}</div></section>`;
}

function overviewWhereabouts(metrics) {
  const active=[...metrics.active].filter((record)=>{
    const q=(ui.overview.query||'').trim().toLowerCase(); const owner=recordOwner(record);
    if (ui.overview.location && record.clockIn.location!==ui.overview.location) return false;
    if (ui.overview.department && owner?.department!==ui.overview.department) return false;
    if(q && ![owner?.name,owner?.department,record.clockIn.location,record.id].filter(Boolean).join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
  const groups=LOCATIONS.map((location)=>[location,active.filter((r)=>r.clockIn.location===location)]).filter(([,rows])=>rows.length);
  return `<section class="overview-section"><div class="overview-section-title"><div><span>⌖</span><h3>Employee whereabouts</h3></div><strong>${active.length} active</strong></div><div class="overview-section-actions"><button type="button" id="toggleWhereabouts">${ui.overview.whereaboutsExpanded?'Collapse all':'Show all'}</button><span>${active.length} active / ${overviewTodayRecords().length} records</span></div>${ui.overview.whereaboutsExpanded?`<div class="whereabouts-groups">${groups.length?groups.map(([location,rows])=>`<div class="whereabouts-group"><div class="whereabouts-group-head"><strong>${esc(location)}</strong><span>${rows.length} active</span></div><div class="whereabouts-grid">${rows.map((record)=>{const owner=recordOwner(record);return `<article class="whereabouts-card"><div class="whereabouts-person"><span class="whereabouts-avatar">${esc(overviewInitials(owner?.name||record.ownerName))}</span><div><strong>${esc(owner?.name||record.ownerName||'Unknown')}</strong><small>ID: ${esc(String(owner?.id||record.ownerId||'N/A').slice(0,12))}</small></div></div><div class="whereabouts-meta"><span>▣ ${esc(owner?.department||record.clockIn.department||'—')}</span><span>◷ In: <strong>${fmtTimeShort.format(new Date(record.clockIn.timestamp))}</strong></span></div><button type="button" class="whereabouts-duration" data-overview-duration="${esc(record.id)}" data-overview-open-log="${esc(record.id)}">Active · ${overviewCompactDuration(durationMs(record))}</button></article>`}).join('')}</div></div>`).join(''):'<div class="overview-empty-mini">No active employees match the current filters.</div>'}</div>`:''}</section>`;
}

function overviewAttendanceTable(metrics) {
  let rows=overviewFilteredTodayRecords();
  const filter=ui.overview.attendanceFilter||'all';
  if(filter==='active') rows=rows.filter(r=>!r.clockOut);
  if(filter==='late') rows=rows.filter(r=>overviewLateMinutes(r)>0);
  if(filter==='stagnant') rows=rows.filter(r=>!r.clockOut && durationMs(r)>=14*3600000);
  const completed=rows.filter(r=>r.clockOut).length, late=rows.filter(r=>overviewLateMinutes(r)>0).length, active=rows.filter(r=>!r.clockOut).length, total=rows.reduce((s,r)=>s+durationMs(r),0);
  return `<section class="overview-section overview-records"><div class="overview-section-title"><div><span>▤</span><h3>Attendance records</h3><small>${rows.length} entries</small></div><div class="overview-record-tabs">${[['all','All'],['active','Active'],['late','Late'],['stagnant','Stagnant']].map(([value,label])=>`<button type="button" data-overview-record-filter="${value}" class="${filter===value?'active':''}">${label}</button>`).join('')}${hasPermission(PERMISSIONS.ATTENDANCE_EXPORT)?'<button type="button" id="overviewExport">⇩ Export</button>':''}</div></div><div class="overview-record-kpis"><div><strong>${active}</strong><span>Active</span></div><div><strong>${completed}</strong><span>Completed</span></div><div><strong>${late}</strong><span>Late arrivals</span></div><div><strong>${metrics.stagnant.length}</strong><span>Stagnant</span></div><div><strong data-overview-avg-hours>${humanHours(rows.length?total/rows.length:0)}</strong><span>Avg hours</span></div></div><div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Name</th><th>Dept</th><th>Location</th><th>In</th><th>Out</th><th>Late</th><th>Hours</th><th>Status</th></tr></thead><tbody>${rows.length?rows.slice(0,80).map((record)=>{const owner=recordOwner(record);const lateMin=overviewLateMinutes(record);return `<tr data-overview-row="${esc(record.id)}"><td><button type="button" class="overview-name-link" data-overview-open-log="${esc(record.id)}">${esc(owner?.name||record.ownerName||'Unknown')}</button></td><td>${esc(owner?.department||record.clockIn.department||'—')}</td><td>${esc(record.clockIn.location)}</td><td>${fmtTimeShort.format(new Date(record.clockIn.timestamp))}</td><td>${record.clockOut?fmtTimeShort.format(new Date(record.clockOut.timestamp)):'Active'}</td><td class="${lateMin?'late-text':''}">${lateMin?`${lateMin}m`:'—'}</td><td data-overview-duration-table="${esc(record.id)}">${overviewCompactDuration(durationMs(record))}</td><td><span class="overview-status ${record.clockOut?'complete':'active'}">${record.clockOut?'Completed':'Active'}</span></td></tr>`}).join(''):`<tr><td colspan="8"><div class="overview-empty-mini">No attendance records match the current filters.</div></td></tr>`}</tbody></table></div></section>`;
}


function overviewCommandSurface(metrics) {
  const onTimeRate = overviewPercent(metrics.early.length + metrics.ontime.length, metrics.arrivals.length);
  const lateRate = overviewPercent(metrics.late.length, metrics.arrivals.length);
  const activeRate = overviewPercent(metrics.active.length, Math.max(1, metrics.users.length));
  const status = metrics.stagnant.length ? 'attention' : metrics.late.length ? 'watch' : 'clear';
  const statusLabel = status === 'attention' ? 'Needs attention' : status === 'watch' ? 'Watch arrivals' : 'Flow is healthy';
  return `<section class="overview-command" aria-label="Live workforce command surface">
    <div class="overview-command-core">
      <div class="overview-command-heading"><div><p class="eyebrow">LIVE WORKFORCE</p><h3>${statusLabel}</h3></div><span class="overview-command-state ${status}"><i></i>${status === 'clear' ? 'Stable' : status === 'watch' ? 'Monitor' : 'Action'}</span></div>
      <div class="overview-orbit-wrap">
        <div class="overview-orbit" style="--on-time:${onTimeRate};--late:${lateRate};--active:${activeRate}">
          <div class="overview-orbit-inner"><strong>${metrics.active.length}</strong><span>active now</span><small>${metrics.users.length} visible people</small></div>
        </div>
        <div class="overview-orbit-stats">
          <div><span>On-time</span><strong>${onTimeRate}%</strong><i class="good"></i></div>
          <div><span>Late</span><strong>${metrics.late.length}</strong><i class="warn"></i></div>
          <div><span>On-site</span><strong>${metrics.onsite}</strong><i class="neutral"></i></div>
          <div><span>Avg today</span><strong id="overviewAvgHours">${humanHours(metrics.avgMs)}</strong><i class="ink"></i></div>
        </div>
      </div>
    </div>
    <div class="overview-command-feed">
      <div class="overview-feed-head"><div><p class="eyebrow">TODAY AT A GLANCE</p><h3>Shift telemetry</h3></div><span>${metrics.today.length} records</span></div>
      <div class="overview-feed-list">
        <div><span class="feed-icon">↗</span><p><strong>${metrics.arrivals.length} arrivals</strong><small>${metrics.early.length + metrics.ontime.length} met the 08:00 threshold</small></p><em>${onTimeRate}%</em></div>
        <div><span class="feed-icon">⌁</span><p><strong>${metrics.active.length} still working</strong><small>${metrics.stagnant.length ? `${metrics.stagnant.length} session${metrics.stagnant.length===1?'':'s'} over 14h` : 'No stagnant sessions'}</small></p><em>${activeRate}%</em></div>
        <div><span class="feed-icon">✓</span><p><strong>${metrics.completed.length} completed</strong><small>${metrics.editedToday} manual edit${metrics.editedToday===1?'':'s'} today</small></p><em>${humanHours(metrics.totalMs)}</em></div>
      </div>
    </div>
  </section>`;
}

function overviewLocationLanes(metrics) {
  const active = metrics.active;
  const icons = ['⌂','⌁','⌖','✈','◎'];
  return `<section class="overview-lanes"><div class="overview-lanes-head"><div><p class="eyebrow">WORK MODES</p><h3>Where the workforce is operating</h3></div><span>${active.length} active</span></div><div class="overview-lane-grid">${LOCATIONS.map((location,index)=>{
    const rows=active.filter((r)=>r.clockIn.location===location);
    const count=rows.length;
    const pct=overviewPercent(count,Math.max(1,active.length));
    const first=rows.sort((a,b)=>new Date(a.clockIn.timestamp)-new Date(b.clockIn.timestamp))[0];
    const selected=ui.overview.location===location;
    return `<button type="button" class="overview-lane ${count?'live':'quiet'} ${selected?'selected':''}" data-overview-location-quick="${esc(location)}" aria-pressed="${selected}"><span class="lane-icon">${icons[index]}</span><span class="lane-copy"><strong>${esc(location)}</strong><small>${count ? `${count} active · earliest ${fmtTimeShort.format(new Date(first.clockIn.timestamp))}` : 'No active attendance'}</small></span><span class="lane-meter"><i style="--lane:${pct}%"></i></span><b>${count}</b></button>`;
  }).join('')}</div></section>`;
}

function overviewArrivalRhythm(metrics) {
  const start=6*60, end=12*60, span=end-start;
  const marks=metrics.arrivals.map((record)=>{
    const minutes=Math.max(start,Math.min(end,minutesOfDay(record.clockIn.timestamp)));
    const x=((minutes-start)/span)*100;
    const cls=overviewArrivalClass(record);
    const owner=recordOwner(record);
    return `<button type="button" class="rhythm-mark ${cls}" style="--x:${x}%" data-overview-open-log="${esc(record.id)}" aria-label="${esc(owner?.name||record.ownerName||'Employee')} at ${esc(fmtTimeShort.format(new Date(record.clockIn.timestamp)))}"><i></i><span>${fmtTimeShort.format(new Date(record.clockIn.timestamp))}</span></button>`;
  }).join('');
  return `<section class="overview-rhythm"><div class="overview-panel-head"><div><p class="eyebrow">ARRIVAL RHYTHM</p><h3>Morning flow</h3></div><span>${metrics.arrivals.length} first arrivals</span></div><div class="rhythm-stage"><div class="rhythm-window early"><span>Early</span></div><div class="rhythm-window ontime"><span>On-time</span></div><div class="rhythm-window late"><span>Late</span></div><div class="rhythm-axis">${marks}<i class="rhythm-threshold" title="08:00 late threshold"></i></div></div><div class="rhythm-scale">${[6,7,8,9,10,11,12].map(h=>`<span>${h>12?h-12:h}${h===12?'PM':'AM'}</span>`).join('')}</div></section>`;
}

function overviewExceptionStream(metrics) {
  const late=[...metrics.late].sort((a,b)=>overviewLateMinutes(b)-overviewLateMinutes(a));
  const items=[];
  metrics.stagnant.slice(0,3).forEach((record)=>items.push({tone:'danger',label:'Stagnant session',detail:`${recordOwner(record)?.name||record.ownerName||'Unknown'} · ${overviewCompactDuration(durationMs(record))}`,id:record.id,badge:'14h+'}));
  late.slice(0,5).forEach((record)=>items.push({tone:'warn',label:'Late arrival',detail:`${recordOwner(record)?.name||record.ownerName||'Unknown'} · ${fmtTimeShort.format(new Date(record.clockIn.timestamp))}`,id:record.id,badge:`+${overviewLateMinutes(record)}m`}));
  if(metrics.editedToday) items.push({tone:'neutral',label:'Manual changes',detail:`${metrics.editedToday} attendance edit${metrics.editedToday===1?'':'s'} recorded today`,id:null,badge:String(metrics.editedToday)});
  return `<section class="overview-exceptions"><div class="overview-panel-head"><div><p class="eyebrow">EXCEPTION STREAM</p><h3>What needs attention</h3></div><span>${items.length} signals</span></div><div class="exception-list">${items.length?items.map((item)=>`${item.id?'<button type="button"':'<div'} class="exception-row ${item.tone}" ${item.id?`data-overview-open-log="${esc(item.id)}"`:''}><span class="exception-pulse"></span><p><strong>${esc(item.label)}</strong><small>${esc(item.detail)}</small></p><em>${esc(item.badge)}</em>${item.id?'</button>':'</div>'}`).join(''):'<div class="overview-clear-state"><span>✓</span><strong>No exceptions right now</strong><small>Attendance signals are within the current operating rules.</small></div>'}</div></section>`;
}

function overviewDepartmentMatrix(metrics) {
  const active=metrics.active;
  const rows=DEPARTMENTS.map((dep)=>[dep,active.filter((r)=>recordOwner(r)?.department===dep).length]).sort((a,b)=>b[1]-a[1]);
  const max=Math.max(1,...rows.map(([,count])=>count));
  return `<section class="overview-department-matrix"><div class="overview-panel-head"><div><p class="eyebrow">DEPARTMENT MATRIX</p><h3>Active density</h3></div><span>${active.length} total active</span></div><div class="department-matrix">${rows.map(([dep,count],index)=>`<button type="button" data-overview-department-quick="${esc(dep)}" class="department-cell ${ui.overview.department===dep?'selected':''}" aria-pressed="${ui.overview.department===dep}"><span><i class="series-${(index%5)+1}"></i>${esc(dep)}</span><strong>${count}</strong><div><i style="width:${count?Math.max(7,(count/max)*100):0}%"></i></div><small>${count?`${overviewPercent(count,Math.max(1,active.length))}% of active workforce`:'No active employees'}</small></button>`).join('')}</div></section>`;
}

function overviewControlDock() {
  return `<div class="overview-control-dock"><label class="overview-search"><span>⌕</span><input id="overviewQuery" value="${esc(ui.overview.query)}" placeholder="Search people, departments, locations…" aria-label="Search overview"></label><div class="overview-dock-filters"><select id="overviewLocation">${options(LOCATIONS,ui.overview.location,'All locations')}</select><select id="overviewDepartment">${options(DEPARTMENTS,ui.overview.department,'All departments')}</select><select id="overviewStatus"><option value="all" ${ui.overview.status==='all'?'selected':''}>All status</option><option value="active" ${ui.overview.status==='active'?'selected':''}>Active</option><option value="completed" ${ui.overview.status==='completed'?'selected':''}>Completed</option><option value="late" ${ui.overview.status==='late'?'selected':''}>Late</option><option value="stagnant" ${ui.overview.status==='stagnant'?'selected':''}>Stagnant 14h+</option></select><select id="overviewSort"><option value="newest" ${ui.overview.sort==='newest'?'selected':''}>Newest first</option><option value="oldest" ${ui.overview.sort==='oldest'?'selected':''}>Oldest first</option><option value="name" ${ui.overview.sort==='name'?'selected':''}>Name</option><option value="duration" ${ui.overview.sort==='duration'?'selected':''}>Longest duration</option></select></div><div class="overview-rule-chip"><span>Policy</span><strong>Late after 08:00</strong></div></div>`;
}

function renderOverview() {
  const overviewData = overviewMetrics();
  const me=currentUser();
  const active=activeRecord();
  const activeOt=active ? approvedOtForAttendance(active) : { durationMinutes: 0 };
  const todayOwn=ownRecords().filter((record)=>localDateKey(record.clockIn.timestamp)===localDateKey(new Date())).sort((a,b)=>new Date(b.clockIn.timestamp)-new Date(a.clockIn.timestamp));
  const latest=todayOwn[0] || null;
  const primaryTitle=active ? 'Your shift is in progress.' : latest?.clockOut ? 'Today is recorded.' : 'Your workday is ready.';
  const primaryDetail=active
    ? `Clocked in ${fmtTimeShort.format(new Date(active.clockIn.timestamp))} from ${active.clockIn.location}. ${attendanceClassification(active)}.`
    : latest?.clockOut
      ? `Last shift completed at ${fmtTimeShort.format(new Date(latest.clockOut.timestamp))}. Your next attendance event starts from the Clock space.`
      : 'Choose your work context in Clock when you are ready to begin. GPS evidence is captured only at attendance events.';
  return `<section class="${pageAnimationClass} content-view overview-view overview-redesign wm-screen" data-ui-screen="overview" data-tt-v2-screen="overview">
    <div class="overview-hero overview-hero-redesign tt-v2-reveal tt-v2-depth-structure"><div><p class="eyebrow">${esc(overviewScopeLabel().toUpperCase())} · TIMETRACKER V2</p><h2>Your day has depth.</h2><p>${fmtFullDate.format(new Date())} · ${esc(me?.role||DEFAULT_ROLE)} · ${esc((me?.name||'User').split(' ')[0])}</p></div><div class="overview-live"><span class="live-dot"></span><div><small>Live local time</small><span id="overviewClock">${fmtTime.format(new Date())}</span></div></div></div>
    <div class="tt-v2-overview-focus tt-v2-reveal">
      <article class="tt-v2-shift-focus"><div class="tt-v2-shift-focus-copy"><small>${active ? 'ACTIVE ATTENDANCE' : 'CURRENT ATTENDANCE STATE'}</small><strong>${esc(primaryTitle)}</strong><p>${esc(primaryDetail)}</p></div><button type="button" class="tt-v2-shift-focus-action" data-view="clock">${active ? 'Open live clock' : 'Open Clock'}</button></article>
      <aside class="tt-v2-context-stack" aria-label="Current attendance context">
        <div class="tt-v2-context-row"><span>Location</span><strong>${esc(active?.clockIn.location || state.selection.location || latest?.clockIn.location || 'Not selected')}</strong></div>
        <div class="tt-v2-context-row"><span>Department</span><strong>${esc(active?.clockIn.department || state.selection.department || latest?.clockIn.department || 'Not selected')}</strong></div>
        <div class="tt-v2-context-row"><span>Credited today</span><strong>${formatDuration(metrics().todayMs)}</strong></div>
        <div class="tt-v2-context-row"><span>Approved OT</span><strong>${activeOt.durationMinutes ? otDurationText(activeOt.durationMinutes) : 'None active'}</strong></div>
      </aside>
    </div>
    ${overviewControlDock()}
    <div class="tt-v2-overview-operations tt-v2-reveal">
      ${overviewExceptionStream(overviewData)}
      ${overviewWhereabouts(overviewData)}
      ${overviewAttendanceTable(overviewData)}
    </div>
    <div class="tt-v2-overview-context tt-v2-reveal">
      ${overviewLocationLanes(overviewData)}
      <div class="overview-intelligence-grid">${overviewArrivalRhythm(overviewData)}${overviewDepartmentMatrix(overviewData)}</div>
    </div>
  </section>`;
}

function updateOverviewLiveValues() {
  if (view !== 'overview') return;
  const metrics=overviewMetrics();
  setText('#overviewClock', fmtTime.format(new Date(now)));
  setText('#overviewAvgHours', humanHours(metrics.avgMs));
  document.querySelectorAll('[data-overview-duration]').forEach((el)=>{const record=state.records.find(r=>r.id===el.dataset.overviewDuration);if(record&&!record.clockOut)setText(`[data-overview-duration="${CSS.escape(record.id)}"]`,`Active · ${overviewCompactDuration(durationMs(record,now))}`)});
  document.querySelectorAll('[data-overview-duration-table]').forEach((el)=>{const record=state.records.find(r=>r.id===el.dataset.overviewDurationTable);if(record&&!record.clockOut){const text=overviewCompactDuration(durationMs(record,now));if(el.textContent!==text)el.textContent=text}});
}

function updateBreakdown(field) {
  const entries = breakdownEntries(field, now);
  const valueMap = new Map(entries);
  const max = entries[0]?.[1] ?? 1;
  document.querySelectorAll(`[data-breakdown-field="${field}"]`).forEach((row) => {
    const label = decodeURIComponent(row.dataset.breakdownKey ?? '');
    const ms = valueMap.get(label);
    if (ms == null) return;
    const duration = row.querySelector('.breakdown-duration');
    const bar = row.querySelector('.bar > span');
    const text = formatDuration(ms);
    if (duration && duration.textContent !== text) duration.textContent = text;
    if (bar) {
      const width = `${Math.max(4, (ms / max) * 100)}%`;
      if (bar.style.width !== width) bar.style.width = width;
    }
  });
}

function updateDynamicValues() {
  now = Date.now();
  const active = activeRecord();
  const date = new Date(now);
  if (view === 'clock') {
    setText('#liveFullDate', fmtFullDate.format(date));
    setText('#liveTopClock', fmtTime.format(date));
    setText('#liveClockFace', active ? formatDuration(durationMs(active, now)) : fmtTime.format(date));
    const m = metrics(now);
    setText('#todayWorked', formatDuration(m.todayMs));
    setText('#weekWorkedShort', formatDuration(m.weekMs).slice(0, 5));
  }
  if ((view === 'log' || view === 'calendar') && active) {
    setText(`[data-record-duration="${CSS.escape(active.id)}"]`, formatDuration(durationMs(active, now), view === 'log'));
  }
  if (view === 'overview') updateOverviewLiveValues();
  if (view === 'reports' && active) {
    const records = reportRecords();
    const stats = reportStats(records);
    setText('#reportTotal', humanHours(stats.totalMs));
  }
  if (view === 'calendar' && active) {
    const monthMs = calendarMonthRecords().reduce((sum, r) => sum + durationMs(r, now), 0);
    setText('#calendarMonthTotal', humanHours(monthMs));
  }
}

function scheduleTick() {
  if (tickTimer) clearTimeout(tickTimer);
  tickTimer = null;
  if (document.hidden) return;
  if (view !== 'clock' && view !== 'overview' && !activeRecord()) return;
  const delay = 1000 - (Date.now() % 1000) + 8;
  tickTimer = setTimeout(() => {
    updateDynamicValues();
    scheduleTick();
  }, delay);
}


function setAttendanceActionBusy(busy, action = '') {
  attendanceActionBusy = busy;
  const inButton = document.getElementById('clockIn');
  const outButton = document.getElementById('clockOut');
  if (inButton) {
    inButton.disabled = busy || !!activeRecord();
    inButton.setAttribute('aria-busy', busy && action === 'in' ? 'true' : 'false');
  }
  if (outButton) {
    outButton.disabled = busy || !activeRecord();
    outButton.setAttribute('aria-busy', busy && action === 'out' ? 'true' : 'false');
  }
}

function validateSelection() {
  if (!state.selection.location || !state.selection.department) {
    notify('Select both a location and department before clocking.', 'error');
    return false;
  }
  if (currentWorkNoteRequirement() && !note.trim()) {
    const error = document.getElementById('workNoteError');
    if (error) error.textContent = 'A Work Note is required when Offsite (Home) is selected.';
    document.getElementById('noteInput')?.focus();
    notify('Enter a Work Note before clocking with Offsite (Home).', 'error');
    return false;
  }
  const error = document.getElementById('workNoteError');
  if (error) error.textContent = '';
  return true;
}

async function clockIn() {
  if (!requirePermission(PERMISSIONS.CLOCK_USE, 'Your role is not permitted to clock attendance.')) return;
  if (attendanceActionBusy) return;
  if (!validateSelection()) return;

  // The database, not a browser lease or hydrated client snapshot, decides whether
  // this account may start a shift. A preflight refresh is still useful for UI
  // accuracy, but correctness is enforced by one transactional server operation.
  await refreshAuthoritativeAttendance({ renderUi: false });
  if (activeRecord()) return notify('A shift is already active for this account. Clock out before starting another.', 'error');

  setAttendanceActionBusy(true, 'in');
  try {
    const geo = await geoForClockEvent();
    if (!geo) {
      notify(gpsDraft?.status === 'denied'
        ? 'Clock in requires GPS. Allow location permission in your browser/site settings, then try again.'
        : 'Clock in requires a successful GPS fix. Location could not be acquired; verify device location services, browser permission, and network-assisted positioning, then try again.', 'error');
      return;
    }

    const timestamp = new Date().toISOString();
    const workNote = shouldShowWorkNote() ? note.trim() : '';
    const draft = {
      id: null,
      ownerId: currentUser()?.id,
      ownerName: currentUser()?.name,
      clockIn: { ...state.selection, timestamp, geo, ...(workNote ? { workNote } : {}) },
      clockOut: null,
      note: workNote || undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const result = await commitAuthoritativeAttendance('clock-in', {
      location: state.selection.location,
      department: state.selection.department,
      geo,
      workNote,
      attendancePolicy: attendancePolicySnapshot(draft),
    });
    const record = result?.record || activeRecord();
    if (!record) throw new Error('The cloud attendance transaction completed without returning the active shift.');

    note = '';
    auditEvent('CLOCK_IN', record, { location: record.clockIn.location, department: record.clockIn.department, geo: record.clockIn.geo, eventRef: `${record.id}:clockIn`, message: `Clock-in recorded with required automatic GPS evidence. Attendance classification: ${attendanceClassification(record)}.` });
    auditEvent('GPS_EVIDENCE', record, { location: record.clockIn.location, department: record.clockIn.department, geo: record.clockIn.geo, eventRef: `${record.id}:clockIn:gps`, source: 'attendance-association', message: 'Captured GPS evidence associated with this record’s Clock In event.', metadata: { ...deviceMetadata(), clockEvent: 'clock-in', acquisitionAttempt: record.clockIn.geo?.attempt || null } });
    gpsDraft = null;
    render({ animate: false });
    notify('Clock in recorded with GPS evidence.', 'success');
  } catch (error) {
    await refreshAuthoritativeAttendance({ renderUi: false });
    render({ animate: false });
    notify(error?.message || 'Clock in could not be committed to the cloud.', /already active|latest cloud/i.test(error?.message || '') ? 'info' : 'error');
  } finally {
    setAttendanceActionBusy(false);
  }
}

async function clockOut() {
  if (!requirePermission(PERMISSIONS.CLOCK_USE, 'Your role is not permitted to clock attendance.')) return;
  if (attendanceActionBusy) return;
  if (!validateSelection()) return;

  await refreshAuthoritativeAttendance({ renderUi: false });
  const active = activeRecord();
  if (!active) return notify('There is no active shift to clock out.', 'error');
  const expectedId = active.id;

  setAttendanceActionBusy(true, 'out');
  try {
    const geo = await geoForClockEvent();
    if (!geo) {
      notify(gpsDraft?.status === 'denied'
        ? 'Clock out requires GPS. Allow location permission in your browser/site settings, then try again.'
        : 'Clock out requires a successful GPS fix. Location could not be acquired; verify device location services, browser permission, and network-assisted positioning, then try again.', 'error');
      return;
    }

    const timestamp = new Date().toISOString();
    const workNote = shouldShowWorkNote() ? note.trim() : '';
    const draft = typeof structuredClone === 'function' ? structuredClone(active) : JSON.parse(JSON.stringify(active));
    draft.clockOut = { ...state.selection, timestamp, geo, ...(workNote ? { workNote } : {}) };
    if (workNote) draft.note = [draft.note, workNote].filter(Boolean).join(' • ');
    draft.attendancePolicy = attendancePolicySnapshot(draft);
    draft.updatedAt = timestamp;

    const result = await commitAuthoritativeAttendance('clock-out', {
      recordId: expectedId,
      location: state.selection.location,
      department: state.selection.department,
      geo,
      workNote,
      attendancePolicy: draft.attendancePolicy,
    });
    const current = result?.record || state.records.find((item) => item.id === expectedId);
    if (!current?.clockOut) throw new Error('The cloud attendance transaction completed without returning the completed shift.');

    note = '';
    auditEvent('CLOCK_OUT', current, { location: current.clockOut.location, department: current.clockOut.department, geo: current.clockOut.geo, eventRef: `${current.id}:clockOut`, message: 'Clock-out recorded with required automatic GPS evidence.' });
    auditEvent('GPS_EVIDENCE', current, { location: current.clockOut.location, department: current.clockOut.department, geo: current.clockOut.geo, eventRef: `${current.id}:clockOut:gps`, source: 'attendance-association', message: 'Captured GPS evidence associated with this record’s Clock Out event.', metadata: { ...deviceMetadata(), clockEvent: 'clock-out', acquisitionAttempt: current.clockOut.geo?.attempt || null } });
    gpsDraft = null;
    render({ animate: false });
    notify('Clock out recorded with GPS evidence.', 'success');
  } catch (error) {
    await refreshAuthoritativeAttendance({ renderUi: false });
    render({ animate: false });
    notify(error?.message || 'Clock out could not be committed to the cloud.', /no active|changed in another/i.test(error?.message || '') ? 'info' : 'error');
  } finally {
    setAttendanceActionBusy(false);
  }
}

function openEditRecord(id) {
  if (!requirePermission(PERMISSIONS.ATTENDANCE_EDIT, 'Your role cannot modify attendance records.')) return;
  const r = state.records.find((item) => item.id === id);
  if (!r || !canAccessRecord(r)) return notify('You do not have access to this attendance record.', 'error');
  editingRecordId = id;
  const toInput = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  document.getElementById('modalHost').innerHTML = `<div class="modal-backdrop tt-v2-overlay-backdrop" data-close-modal><section class="modal tt-v2-overlay-surface" role="dialog" aria-modal="true" aria-labelledby="editRecordTitle" onclick="event.stopPropagation()">
    <div class="modal-head"><div><p class="eyebrow">RECORD MANAGEMENT</p><h3 id="editRecordTitle">Edit attendance</h3></div><button class="modal-close" data-close-modal aria-label="Close">×</button></div>
    <form id="editRecordForm">
      <div class="form-grid"><label><span>Clock in</span><input name="clockInTime" type="datetime-local" required value="${toInput(r.clockIn.timestamp)}"></label><label><span>Clock-out</span><input name="clockOutTime" type="datetime-local" ${r.clockOut ? 'required' : 'disabled'} value="${toInput(r.clockOut?.timestamp)}"></label></div>
      <div class="form-grid"><label><span>In location</span><select name="inLocation" required>${options(LOCATIONS, r.clockIn.location, 'Choose location')}</select></label><label><span>In department</span><select name="inDepartment" required>${options(DEPARTMENTS, r.clockIn.department, 'Choose department')}</select></label></div>
      ${r.clockOut ? `<div class="form-grid"><label><span>Out location</span><select name="outLocation" required>${options(LOCATIONS, r.clockOut.location, 'Choose location')}</select></label><label><span>Out department</span><select name="outDepartment" required>${options(DEPARTMENTS, r.clockOut.department, 'Choose department')}</select></label></div>` : '<div class="form-notice">This record is active. Clock-out details remain controlled by the live attendance workflow.</div>'}
      <label><span>Note</span><textarea name="note" maxlength="500" placeholder="Optional attendance note">${esc(r.note || '')}</textarea></label>
      <div class="modal-actions"><button type="button" data-close-modal>Cancel</button><button type="submit" class="primary-action">Save changes</button></div>
    </form>
  </section></div>`;
  bindModalEvents();
}

function closeModal() {
  editingRecordId = null;
  editingOtRequestId = null;
  const host = document.getElementById('modalHost');
  if (!host) return;
  if (modalKeyHandler) {
    document.removeEventListener('keydown', modalKeyHandler, true);
    modalKeyHandler = null;
  }
  const returnTarget = modalReturnFocus;
  modalReturnFocus = null;
  const finish = () => {
    host.innerHTML = '';
    if (returnTarget instanceof HTMLElement && returnTarget.isConnected) returnTarget.focus({ preventScroll: true });
  };
  const backdrop = host.querySelector('.modal-backdrop');
  if (!backdrop || motionReduced() || typeof backdrop.animate !== 'function') { finish(); return; }
  const modal = backdrop.querySelector('.modal');
  modal?.animate([{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(8px) scale(.985)' }], { duration: MOTION.fast, easing: 'ease-in', fill: 'forwards' });
  const fade = backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MOTION.base, easing: 'ease-in', fill: 'forwards' });
  fade.onfinish = () => { if (host.contains(backdrop)) finish(); };
}

function recordOverlaps(id, startMs, endMs) {
  return state.records.some((other) => {
    if (other.id === id) return false;
    const otherStart = new Date(other.clockIn.timestamp).getTime();
    const otherEnd = other.clockOut ? new Date(other.clockOut.timestamp).getTime() : Date.now();
    return startMs < otherEnd && endMs > otherStart;
  });
}

function saveEditedRecord(form) {
  if (!requirePermission(PERMISSIONS.ATTENDANCE_EDIT, 'Your role cannot modify attendance records.')) return;
  const r = state.records.find((item) => item.id === editingRecordId);
  if (!r) return closeModal();
  const data = new FormData(form);
  const inTime = new Date(data.get('clockInTime'));
  if (Number.isNaN(inTime.getTime())) return notify('Enter a valid clock-in time.', 'error');
  let outTime = null;
  if (r.clockOut) {
    outTime = new Date(data.get('clockOutTime'));
    if (Number.isNaN(outTime.getTime())) return notify('Enter a valid clock-out time.', 'error');
    if (outTime <= inTime) return notify('Clock-out must be later than clock-in.', 'error');
  }
  const proposedEnd = outTime ? outTime.getTime() : Date.now();
  if (recordOverlaps(r.id, inTime.getTime(), proposedEnd)) return notify('This edit would overlap another attendance session.', 'error');
  const inLocation = data.get('inLocation');
  const inDepartment = data.get('inDepartment');
  if (!LOCATIONS.includes(inLocation) || !DEPARTMENTS.includes(inDepartment)) return notify('Select valid clock-in context values.', 'error');
  const beforeEdit = JSON.parse(JSON.stringify(r));
  r.clockIn = { ...r.clockIn, timestamp: inTime.toISOString(), location: inLocation, department: inDepartment, geo: r.clockIn.geo || null };
  if (r.clockOut) {
    const outLocation = data.get('outLocation');
    const outDepartment = data.get('outDepartment');
    if (!LOCATIONS.includes(outLocation) || !DEPARTMENTS.includes(outDepartment)) return notify('Select valid clock-out context values.', 'error');
    r.clockOut = { ...r.clockOut, timestamp: outTime.toISOString(), location: outLocation, department: outDepartment, geo: r.clockOut.geo || null };
  }
  r.note = String(data.get('note') || '').trim() || undefined;
  r.attendancePolicy = attendancePolicySnapshot(r);
  r.updatedAt = new Date().toISOString();
  state.records.sort((a, b) => new Date(b.clockIn.timestamp) - new Date(a.clockIn.timestamp));
  saveState();
  auditEvent('RECORD_EDIT', r, { message: 'Attendance record edited.', changes: { before: beforeEdit, after: JSON.parse(JSON.stringify(r)) } });
  closeModal();
  if (view === 'log') render({ animate: false });
  notify('Attendance record updated.', 'success');
}

function deleteRecord(id) {
  if (!requirePermission(PERMISSIONS.ATTENDANCE_DELETE, 'Only System Admin and IT Administrator can delete attendance records.')) return;
  const r = state.records.find((item) => item.id === id);
  if (!r || !canAccessRecord(r)) return notify('You do not have access to this attendance record.', 'error');
  if (!r.clockOut) return notify('An active attendance record cannot be deleted. Clock out first.', 'error');
  if (!window.confirm(`Delete the attendance record from ${fmtFullDate.format(new Date(r.clockIn.timestamp))}? This cannot be undone from the UI.`)) return;
  auditEvent('RECORD_DELETE', r, { message: 'Completed attendance record deleted from the attendance ledger.', changes: { deletedRecord: JSON.parse(JSON.stringify(r)) } });
  state.records = state.records.filter((item) => item.id !== id);
  ui.log.expanded = (ui.log.expanded || []).filter((recordId) => recordId !== id);
  saveState();
  saveUi();
  refreshLogRows();
  notify('Attendance record deleted.', 'success');
}

function notify(message, tone = 'info') {
  document.querySelector('.toast')?.remove();
  if (toastTimer) clearTimeout(toastTimer);
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${tone === 'success' ? '✓' : tone === 'error' ? '!' : 'i'}</span>${esc(message)}`;
  document.body.append(el);
  toastTimer = setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), motionReduced() ? 0 : MOTION.base); }, 3200);
}

function download(name, type, text) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function recordsToCsv(records) {
  const header = ['ID','Status','Attendance Classification','Clock In','In Location','In Department','In Latitude','In Longitude','In Accuracy m','Clock Out','Out Location','Out Department','Out Latitude','Out Longitude','Out Accuracy m','Credited Work Duration','Credited Work Hours','Elapsed Duration','Unpaid Break Deducted','Auto Clock-Out','Note'];
  const gpsAllowed = hasPermission(PERMISSIONS.GPS_VIEW_EXACT);
  const rows = records.map((r) => { const elapsed = elapsedDurationMs(r); const credited = durationMs(r); const deducted = Math.max(0, elapsed - credited); return [r.id,r.clockOut?'Completed':'Active',attendanceClassification(r),r.clockIn.timestamp,r.clockIn.location,r.clockIn.department,gpsAllowed?(r.clockIn.geo?.latitude??''):'',gpsAllowed?(r.clockIn.geo?.longitude??''):'',gpsAllowed?(r.clockIn.geo?.accuracy??''):'',r.clockOut?.timestamp??'',r.clockOut?.location??'',r.clockOut?.department??'',gpsAllowed?(r.clockOut?.geo?.latitude??''):'',gpsAllowed?(r.clockOut?.geo?.longitude??''):'',gpsAllowed?(r.clockOut?.geo?.accuracy??''):'',formatDuration(credited),(credited/3600000).toFixed(4),formatDuration(elapsed),formatDuration(deducted),r.clockOut?.automatic?'Yes':'No',r.note??'']; });
  return [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
}

function exportJson() {
  if (!requirePermission(PERMISSIONS.BACKUP_EXPORT, 'Only System Admin and IT Administrator can export a full TimeTracker backup.')) return;
  const payload={ exportedAt:new Date().toISOString(), attendance:state, audit, overtime:ot, otActivity, uiPreferences:ui, rbac };
  download(`timetracker-backup-${new Date().toISOString().slice(0,10)}.json`,'application/json',JSON.stringify(payload,null,2));
  auditEvent('EXPORT',null,{message:'Full TimeTracker backup exported.'}); notify('TimeTracker backup with audit trail exported.','success');
}

function validateDateRange(from, to) {
  if (from && to && from > to) {
    notify('The start date cannot be later than the end date.', 'error');
    return false;
  }
  return true;
}

function refreshReports() {
  saveUi();
  render({ animate: false });
}

function shiftCalendarMonth(delta) {
  const d = calendarMonthDate();
  d.setMonth(d.getMonth() + delta);
  ui.calendar.cursor = monthKey(d);
  const selected = parseLocalDate(ui.calendar.selected) || d;
  if (selected.getFullYear() !== d.getFullYear() || selected.getMonth() !== d.getMonth()) ui.calendar.selected = localDateKey(d);
  saveUi();
  render({ animate: false });
}

function selectCalendarDay(key) {
  const d = parseLocalDate(key);
  if (!d) return;
  ui.calendar.selected = key;
  if (monthKey(d) !== ui.calendar.cursor) ui.calendar.cursor = monthKey(d);
  saveUi();
  const grid = document.getElementById('calendarGrid');
  const detail = document.getElementById('selectedDayDetail');
  if (grid) grid.innerHTML = renderCalendarGrid();
  if (detail) detail.innerHTML = renderSelectedDay();
  bindCalendarDayEvents();
  updateDynamicValues();
}

function bindCalendarDayEvents() {
  document.querySelectorAll('[data-calendar-day]').forEach((button) => button.addEventListener('click', () => selectCalendarDay(button.dataset.calendarDay)));
  document.querySelectorAll('[data-calendar-edit]').forEach((button) => button.addEventListener('click', () => openEditRecord(button.dataset.calendarEdit)));
  document.querySelectorAll('[data-delete-calendar-event]').forEach((button) => button.addEventListener('click', () => deleteCalendarEvent(button.dataset.deleteCalendarEvent)));
}

function bindModalEvents() {
  const host = document.getElementById('modalHost');
  enhanceModernSelects(host);
  enhanceScreenPresentation(host || document);
  const modal = host?.querySelector('.modal');
  if (modal) {
    modalReturnFocus = document.activeElement instanceof HTMLElement && !host.contains(document.activeElement) ? document.activeElement : modalReturnFocus;
    const focusableSelector = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusables = () => [...modal.querySelectorAll(focusableSelector)].filter((node) => node instanceof HTMLElement && !node.hidden && node.getClientRects().length > 0);
    const initial = focusables()[0];
    requestAnimationFrame(() => initial?.focus({ preventScroll: true }));
    if (modalKeyHandler) document.removeEventListener('keydown', modalKeyHandler, true);
    modalKeyHandler = (event) => {
      if (!host?.querySelector('.modal')) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (modernSelectState.open) { closeModernSelect(modernSelectState.open, { focus: true }); return; }
        closeModal(); return;
      }
      if (event.key !== 'Tab') return;
      const nodes = focusables(); if (!nodes.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', modalKeyHandler, true);
  }
  document.querySelectorAll('[data-close-modal]').forEach((el) => el.addEventListener('click', closeModal));
  document.getElementById('addRbacUserForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    createRbacUser(event.currentTarget);
  });
  document.getElementById('editRecordForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    saveEditedRecord(event.currentTarget);
  });
  document.getElementById('otRequestForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form=event.currentTarget, data=Object.fromEntries(new FormData(form).entries());
    const checked=validateOtPayload(data); if(checked.error) return notify(checked.error,'error');
    const intent=event.submitter?.value||'draft';
    if(editingOtRequestId) updateOtRequest(editingOtRequestId,checked.value,intent==='submit'); else createOtRequest(checked.value,intent==='submit');
  });
  document.getElementById('otDecisionForm')?.addEventListener('submit', (event) => {
    event.preventDefault(); const form=event.currentTarget; const data=new FormData(form);
    decideOtRequest(form.dataset.otId,form.dataset.decision,String(data.get('reason')||''));
  });
}

function bindEvents() {
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => navigateToView(button.dataset.view)));

  const overviewBindings = [
    ['overviewQuery','query','change'], ['overviewLocation','location','change'], ['overviewDepartment','department','change'], ['overviewStatus','status','change'], ['overviewSort','sort','change'],
  ];
  overviewBindings.forEach(([id,key,evt])=>document.getElementById(id)?.addEventListener(evt,(event)=>{
    ui.overview[key]=event.target.value; saveUi(); render({animate:false});
  }));
  document.getElementById('overviewQuery')?.addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();ui.overview.query=event.currentTarget.value;saveUi();render({animate:false});}});
  document.getElementById('toggleWhereabouts')?.addEventListener('click',()=>{ui.overview.whereaboutsExpanded=!ui.overview.whereaboutsExpanded;saveUi();render({animate:false});});
  document.querySelectorAll('[data-overview-location-quick]').forEach((button)=>button.addEventListener('click',()=>{
    const value=button.dataset.overviewLocationQuick;
    ui.overview.location=ui.overview.location===value?'':value;
    saveUi(); render({animate:false});
  }));
  document.querySelectorAll('[data-overview-department-quick]').forEach((button)=>button.addEventListener('click',()=>{
    const value=button.dataset.overviewDepartmentQuick;
    ui.overview.department=ui.overview.department===value?'':value;
    saveUi(); render({animate:false});
  }));
  document.querySelectorAll('[data-overview-record-filter]').forEach((button)=>button.addEventListener('click',()=>{ui.overview.attendanceFilter=button.dataset.overviewRecordFilter;saveUi();render({animate:false});}));
  document.querySelectorAll('[data-overview-open-log]').forEach((button)=>button.addEventListener('click',()=>{
    const id=button.dataset.overviewOpenLog;
    ui.log.query=id; ui.log.expanded=[id]; saveUi(); view='log'; render({animate:false});
  }));
  document.getElementById('overviewExport')?.addEventListener('click',()=>{
    if(!requirePermission(PERMISSIONS.ATTENDANCE_EXPORT,'Your role cannot export attendance data.'))return;
    const rows=overviewFilteredTodayRecords(); download(`timetracker-overview-${localDateKey(new Date())}.csv`,'text/csv;charset=utf-8',recordsToCsv(rows)); auditEvent('EXPORT',null,{message:`${rows.length} attendance records exported from Overview.`}); notify(`${rows.length} overview records exported.`,'success');
  });

  document.getElementById('locationSelect')?.addEventListener('change', (event) => {
    state.selection.location = event.target.value;
    if (!shouldShowWorkNote()) note = '';
    saveState();
    render({ animate: false });
    void maybePrefetchGps();
  });
  document.getElementById('departmentSelect')?.addEventListener('change', (event) => { state.selection.department = event.target.value; saveState(); void maybePrefetchGps(); });
  document.getElementById('noteInput')?.addEventListener('input', (event) => {
    note = event.target.value;
    const error = document.getElementById('workNoteError');
    if (error && note.trim()) error.textContent = '';
  });
  document.getElementById('clockIn')?.addEventListener('click', clockIn);
  document.getElementById('clockOut')?.addEventListener('click', clockOut);

  const logBindings = [
    ['logQuery', 'query', 'input'], ['logStatus', 'status', 'change'], ['logDepartment', 'department', 'change'], ['logLocation', 'location', 'change'], ['logSort', 'sort', 'change'], ['logFrom', 'from', 'change'], ['logTo', 'to', 'change'],
  ];
  logBindings.forEach(([id, key, evt]) => document.getElementById(id)?.addEventListener(evt, (event) => {
    ui.log[key] = event.target.value;
    if ((key === 'from' || key === 'to') && !validateDateRange(ui.log.from, ui.log.to)) return;
    saveUi();
    refreshLogRows();
  }));
  document.getElementById('clearLogFilters')?.addEventListener('click', () => {
    const expanded = Array.isArray(ui.log.expanded) ? ui.log.expanded : [];
    ui.log = { ...emptyUi().log, expanded };
    saveUi();
    render({ animate: false });
  });
  document.getElementById('expandAllRecords')?.addEventListener('click', () => {
    ui.log.expanded = logRecords().map((record) => record.id);
    saveUi();
    refreshLogRows();
  });
  document.getElementById('collapseAllRecords')?.addEventListener('click', () => {
    destroyLeafletMap();
    ui.log.expanded = [];
    saveUi();
    refreshLogRows();
  });
  document.getElementById('logExportCsv')?.addEventListener('click', () => {
    if (!requirePermission(PERMISSIONS.ATTENDANCE_EXPORT, 'Your role cannot export attendance data.')) return;
    const records = logRecords();
    download(`timetracker-log-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8', recordsToCsv(records));
    auditEvent('EXPORT',null,{message:`${records.length} attendance records exported from Log.`});
    notify(`${records.length} log records exported.`, 'success');
  });
  document.getElementById('auditExportCsv')?.addEventListener('click',()=>{
    if (!requirePermission(PERMISSIONS.AUDIT_EXPORT, 'Your role cannot export audit data.')) return;
    const visibleIds = new Set(logRecords().map((record) => record.id));
    const rows = audit.filter((event) => event.recordId && visibleIds.has(event.recordId));
    const header=['Audit ID','Timestamp','Action','Record ID','Location','Department','Latitude','Longitude','Accuracy m','Source','Message'];
    const csv=[header,...rows.map(event=>[event.id,event.timestamp,event.action,event.recordId||'',event.location||'',event.department||'',event.geo?.latitude??'',event.geo?.longitude??'',event.geo?.accuracy??'',event.source||'',event.message||''])].map(row=>row.map(escapeCsv).join(',')).join('\n');
    download(`timetracker-log-audit-${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8',csv);
    auditEvent('EXPORT',null,{message:`${rows.length} linked audit events exported for the current Log result set.`});
    notify(`${rows.length} linked audit events exported.`,'success');
  });
  document.getElementById('logList')?.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.toggleRecord) return toggleRecordExpanded(target.dataset.toggleRecord, target);
    if (target.dataset.editRecord) return openEditRecord(target.dataset.editRecord);
    if (target.dataset.deleteRecord) return deleteRecord(target.dataset.deleteRecord);
    if (target.dataset.loadRecordMap) return loadRecordLeafletMap(target.dataset.loadRecordMap);
    if (target.dataset.focusRecordMap) return focusRecordMap(target.dataset.focusRecordMap);
    if (target.dataset.exportRecord) return exportSingleRecord(target.dataset.exportRecord);
  });

  document.getElementById('reportPreset')?.addEventListener('change', (event) => { ui.reports.preset = event.target.value; refreshReports(); });
  document.getElementById('reportDepartment')?.addEventListener('change', (event) => { ui.reports.department = event.target.value; refreshReports(); });
  document.getElementById('reportLocation')?.addEventListener('change', (event) => { ui.reports.location = event.target.value; refreshReports(); });
  document.getElementById('reportFrom')?.addEventListener('change', (event) => { ui.reports.from = event.target.value; if (validateDateRange(ui.reports.from, ui.reports.to)) refreshReports(); });
  document.getElementById('reportTo')?.addEventListener('change', (event) => { ui.reports.to = event.target.value; if (validateDateRange(ui.reports.from, ui.reports.to)) refreshReports(); });
  document.getElementById('resetReportFilters')?.addEventListener('click', () => { ui.reports = { ...emptyUi().reports }; saveUi(); render({ animate: false }); });
  document.getElementById('reportExportCsv')?.addEventListener('click', () => {
    if (!requirePermission(PERMISSIONS.REPORTS_EXPORT, 'Your role cannot export reports.')) return;
    const records = reportRecords();
    download(`timetracker-report-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8', recordsToCsv(records));
    auditEvent('EXPORT',null,{message:`${records.length} attendance records exported from Reports.`});
    notify(`${records.length} report records exported.`, 'success');
  });
  document.getElementById('printReport')?.addEventListener('click', () => { if (requirePermission(PERMISSIONS.REPORTS_EXPORT, 'Your role cannot print/export reports.')) window.print(); });

  document.getElementById('calendarPrev')?.addEventListener('click', () => shiftCalendarMonth(-1));
  document.getElementById('calendarNext')?.addEventListener('click', () => shiftCalendarMonth(1));
  document.getElementById('calendarToday')?.addEventListener('click', () => { const d = new Date(); ui.calendar.cursor = monthKey(d); ui.calendar.selected = localDateKey(d); saveUi(); render({ animate: false }); });
  document.getElementById('addCalendarEvent')?.addEventListener('click', openAddCalendarEvent);
  bindCalendarDayEvents();

  document.getElementById('addRbacUser')?.addEventListener('click', openAddRbacUser);
  document.querySelectorAll('[data-save-rbac-role]').forEach((button)=>button.addEventListener('click',()=>saveRbacUserRole(button.dataset.saveRbacRole)));
  document.querySelectorAll('[data-toggle-rbac-user]').forEach((button)=>button.addEventListener('click',()=>toggleRbacUser(button.dataset.toggleRbacUser)));

  document.getElementById('newOtRequest')?.addEventListener('click',()=>openOtRequestModal());
  [['otQuery','query','input'],['otStatus','status','change'],['otScope','scope','change'],['otSort','sort','change'],['otFrom','from','change'],['otTo','to','change']].forEach(([id,key,evt])=>document.getElementById(id)?.addEventListener(evt,(event)=>{ui.ot[key]=event.target.value;if((key==='from'||key==='to')&&!validateDateRange(ui.ot.from,ui.ot.to))return;saveUi();if(view==='ot')render({animate:false});}));
  document.getElementById('resetOtFilters')?.addEventListener('click',()=>{ui.ot={...emptyUi().ot,activityOpen:ui.ot.activityOpen};saveUi();render({animate:false});});
  document.getElementById('toggleOtActivity')?.addEventListener('click',()=>{if(!requirePermission(PERMISSIONS.OT_ACTIVITY_VIEW,'Only System Admin and IT Administrator can view the OT Activity Log.'))return;ui.ot.activityOpen=!ui.ot.activityOpen;saveUi();render({animate:false});});
  document.getElementById('exportOtCsv')?.addEventListener('click',()=>{if(!requirePermission(PERMISSIONS.OT_VIEW,'Your role cannot access OT requests.'))return;const rows=otFilteredRequests();download(`timetracker-ot-${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8',otRequestsCsv(rows));otActivityEvent('OT_EXPORTED',null,{message:`${rows.length} OT requests exported.`,status:null});notify(`${rows.length} OT requests exported.`,'success');});
  document.getElementById('exportOtActivity')?.addEventListener('click',()=>{if(!requirePermission(PERMISSIONS.OT_ACTIVITY_EXPORT,'Only System Admin and IT Administrator can export OT activity.'))return;const rows=accessibleOtActivity();download(`timetracker-ot-activity-${new Date().toISOString().slice(0,10)}.csv`,'text/csv;charset=utf-8',otActivityCsv(rows));notify(`${rows.length} OT activity events exported.`,'success');});
  document.getElementById('otList')?.addEventListener('click',(event)=>{const b=event.target.closest('button');if(!b)return;if(b.dataset.editOt)return openOtRequestModal(b.dataset.editOt);if(b.dataset.submitOt)return submitOtRequest(b.dataset.submitOt);if(b.dataset.withdrawOt)return withdrawOtRequest(b.dataset.withdrawOt);if(b.dataset.approveOt)return openOtDecisionModal(b.dataset.approveOt,'Approved');if(b.dataset.rejectOt)return openOtDecisionModal(b.dataset.rejectOt,'Rejected');});

  document.getElementById('exportJson')?.addEventListener('click', exportJson);
}

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY || event.newValue === event.oldValue) return;
  const nextState = parseState(event.newValue) ?? loadState();
  nextState.selection = { ...state.selection };
  const structuralChange = JSON.stringify(nextState.records) !== JSON.stringify(state.records);
  const workNoteVisibilityChanged = view === 'clock' && shouldShowWorkNote(nextState.selection?.location) !== shouldShowWorkNote(state.selection?.location);
  state = nextState;
  if (structuralChange || workNoteVisibilityChanged) render({ animate: false });
  else {
    const location = document.getElementById('locationSelect');
    const department = document.getElementById('departmentSelect');
    if (location && location.value !== state.selection.location) location.value = state.selection.location;
    if (department && department.value !== state.selection.department) department.value = state.selection.department;
    if (location) syncModernSelect(location);
    if (department) syncModernSelect(department);
    updateDynamicValues();
  }
  notify('Attendance state synchronized from another tab.', 'info');
});

window.addEventListener('storage',(event)=>{if(event.key===AUDIT_KEY&&event.newValue!==event.oldValue){audit=parseAudit(event.newValue);if(view==='log')refreshLogRows();}});

window.addEventListener('storage',(event)=>{if(event.key===RBAC_KEY&&event.newValue!==event.oldValue){const next=parseRbac(event.newValue);if(next){rbac=next;if(!hasPermission(PERMISSIONS.ROLES_VIEW)&&view==='roles')view='overview';render({animate:false});notify('Access-control state synchronized from another tab.','info');}}});

window.addEventListener('storage',(event)=>{if(event.key===OT_KEY&&event.newValue!==event.oldValue){const next=parseOt(event.newValue);if(next){ot=next;if(view==='ot'||view==='clock')render({animate:false});notify('OT requests synchronized from another tab.','info');}}});
window.addEventListener('storage',(event)=>{if(event.key===OT_ACTIVITY_KEY&&event.newValue!==event.oldValue){otActivity=parseOtActivity(event.newValue);if(view==='ot'&&hasPermission(PERMISSIONS.OT_ACTIVITY_VIEW)&&ui.ot.activityOpen)render({animate:false});}});


window.addEventListener('wm:module-directory-change', () => {
  rbac = loadRbac();
  if (!document.hidden) render({ animate: false });
});
window.addEventListener('focus', () => { updateDynamicValues(); scheduleTick(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (tickTimer) clearTimeout(tickTimer);
    tickTimer = null;
    return;
  }
  updateDynamicValues();
  scheduleTick();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && editingRecordId) closeModal();
});

async function initializeLaunchAttendanceEnforcement() {
  const launchAt = Date.now();
  let enforced = 0;
  let enforcementError = null;

  // Attendance enforcement is important, but it must never prevent the application UI from mounting.
  // A launch-time policy exception is isolated, surfaced, and retried on a later launch instead of
  // leaving the module on an empty boot screen.
  try {
    enforced = await enforceAutoClockOut(launchAt, { announce: false });
  } catch (error) {
    enforcementError = error;
    console.error('TimeTracker launch-time attendance enforcement failed.', error);
  }

  render();
  globalThis.__TIMETRACKER_BOOTED__ = true;

  if (enforcementError) {
    notify('TimeTracker started, but launch-time attendance enforcement encountered an error. Existing attendance data was preserved; reload after reviewing the browser console.', 'error');
  }

  // Geolocation is intentionally attempted only while TimeTracker is actively open.
  // Attendance is already finalized at the exact policy timestamp before this asynchronous evidence phase.
  const pending = pendingAutoGpsRecordsForCurrentUser();
  if (pending.length) {
    notify(enforced
      ? 'Auto Clock-Out applied from launch-time attendance evaluation. Obtaining current GPS evidence…'
      : 'An earlier automatic Clock-Out is missing GPS evidence. Obtaining current location while TimeTracker is open…', 'info');
    await recoverPendingAutoClockOutGpsAtLaunch();
    if (!document.hidden) render({ animate: false });
  }

  if (enforced) {
    const unresolved = pendingAutoGpsRecordsForCurrentUser().length;
    notify(unresolved
      ? 'Auto Clock-Out completed at the exact applicable credited-work threshold. Current GPS could not be associated; the failure is recorded and will be retried on the next TimeTracker launch.'
      : 'Auto Clock-Out completed at the exact applicable credited-work threshold with launch-time GPS evidence.', unresolved ? 'error' : 'success');
  }
}

try { initInteractionMotion(); } catch (error) { console.error('TimeTracker interaction motion initialization failed.', error); }
try { initModernDropdownSystem(); } catch (error) { console.error('TimeTracker dropdown-system initialization failed.', error); }
try { bootstrapAudit(); } catch (error) { console.error('TimeTracker audit bootstrap failed.', error); }
void initializeLaunchAttendanceEnforcement().catch((error) => {
  console.error('TimeTracker startup failed.', error);
  globalThis.__TIMETRACKER_BOOT_ERROR__ = error instanceof Error ? error.message : String(error);
  const mount = document.getElementById('app');
  if (mount && !mount.childElementCount) {
    mount.innerHTML = `<main style="max-width:760px;margin:64px auto;padding:28px;border:1px solid #dbe2ec;border-radius:18px;background:#f4f6fb;color:#111827;font:15px/1.5 system-ui,sans-serif"><strong style="display:block;font-size:20px;margin-bottom:8px">TimeTracker could not start</strong><span>Startup error: ${esc(globalThis.__TIMETRACKER_BOOT_ERROR__)}</span><p style="margin:12px 0 0;color:#667085">Your stored attendance data has not been deleted. Reload the module after reviewing the first browser-console error.</p></main>`;
  }
});
