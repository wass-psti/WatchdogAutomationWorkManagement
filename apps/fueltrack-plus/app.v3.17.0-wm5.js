(() => {
  "use strict";

  const VERSION = "3.17.0";
  const KEYS = {
    requests: "fueltrackplus.requests.v3",
    activity: "fueltrackplus.activity.v3",
    prefs: "fueltrackplus.preferences.v3",
    inventory: "fueltrackplus.inventory.v3",
    userRoles: "fueltrackplus.userroles.v3",
  };


  const VEHICLE_DIRECTORY = Object.freeze([
    { plateNumber: "0701-1070041", vehicleOwner: "Alex P. Señagan" },
    { plateNumber: "0701-1113214", vehicleOwner: "Alvin L. Damulo" },
    { plateNumber: "0701-1226810", vehicleOwner: "Amalia P. Señagan" },
    { plateNumber: "130HAD", vehicleOwner: "Angelica Anne Camille Señagan" },
    { plateNumber: "1796", vehicleOwner: "Angelo A. Malait" },
    { plateNumber: "412 GBE", vehicleOwner: "Archie P. Abucay" },
    { plateNumber: "4GD D49", vehicleOwner: "Benjie R. Go" },
    { plateNumber: "543 211", vehicleOwner: "Brendaline Señagan" },
    { plateNumber: "546 HZL", vehicleOwner: "Chris Emmanuel O. Rama" },
    { plateNumber: "646 GWW", vehicleOwner: "Crizza Mae G. Luang" },
    { plateNumber: "662 GAR", vehicleOwner: "Dale M. Rusiana" },
    { plateNumber: "671 GHE", vehicleOwner: "Daniela C. Cabanas" },
    { plateNumber: "893 GBJ", vehicleOwner: "Darril P. Humopong" },
    { plateNumber: "935 HCD", vehicleOwner: "Dionny P. Señagan" },
    { plateNumber: "AFA 2382", vehicleOwner: "Edmundo C. Rosal Jr." },
    { plateNumber: "APS 99", vehicleOwner: "Fabian D. Cataytay" },
    { plateNumber: "G21 5IW", vehicleOwner: "Felicome R. Lisondra" },
    { plateNumber: "G41 000", vehicleOwner: "Ianikol N. Dela Victoria" },
    { plateNumber: "G42 80H", vehicleOwner: "Jelou Enson" },
    { plateNumber: "G77 9RF", vehicleOwner: "Jeremias C. Enopia" },
    { plateNumber: "G82 27E", vehicleOwner: "Jerome L. Nuñez" },
    { plateNumber: "G84 3JW", vehicleOwner: "Joe Rhoss C. Bilocura" },
    { plateNumber: "G87 98A", vehicleOwner: "Joelito Catipay" },
    { plateNumber: "G99 3PW", vehicleOwner: "John Lloyd N. Alalde" },
    { plateNumber: "GAD 3982", vehicleOwner: "Jonerey Torino" },
    { plateNumber: "GAN 8289", vehicleOwner: "Lex Mariun B. Señagan" },
    { plateNumber: "GAO 6685", vehicleOwner: "Lexter Jay B. Señagan" },
    { plateNumber: "GBC 5620", vehicleOwner: "Ma. Elizabeth L. Cataytay" },
    { plateNumber: "GBG 3857", vehicleOwner: "Marvin F. Otto" },
    { plateNumber: "GPP 945", vehicleOwner: "Melanie Señagan" },
    { plateNumber: "HCD 935", vehicleOwner: "Melchor R. Vasquez" },
    { plateNumber: "MO H539", vehicleOwner: "Prospero C. Pajulas" },
    { plateNumber: "NBD 4744", vehicleOwner: "Raymund Roy M. Perez" },
    { plateNumber: "YHZ 963", vehicleOwner: "Rodrigo Anonat" },
    { plateNumber: "YKE 394", vehicleOwner: "Rodolfo Ogana Jr." }
  ]);

  const CONTAINER_DIRECTORY = Object.freeze([
    "1 Container",
    "2 Container",
    "3 Container",
    "4 Container",
    "5 Container",
    "6 Container",
    "7 Container",
    "8 Container",
    "9 Container",
    "10 Container"
  ]);

  const PRIORITIES = ["Low", "Medium", "High"];
  const ROLES = Object.freeze({
    ADMIN: "Admin",
    PUMP_ATTENDANT: "Pump Attendant",
    USER: "User"
  });
  const DEFAULT_ROLE = ROLES.USER;
  const CLOUD_IDENTITY = globalThis.WM_IDENTITY_CONTEXT || null;
  const AUTHENTICATED_ROLE = normalizeRole(CLOUD_IDENTITY?.module?.role || DEFAULT_ROLE);
  const AUTHENTICATED_NAME = String(CLOUD_IDENTITY?.user?.displayName || CLOUD_IDENTITY?.user?.email || 'Authenticated User').trim();
  const PERMISSIONS = Object.freeze({
    [ROLES.ADMIN]: new Set([
      "route.dashboard","route.analytics","route.requests","route.new","route.approvals","route.lightfuels","route.activity","route.roles",
      "request.create","request.view.any","request.delete","request.export",
      "analytics.view","analytics.export",
      "approval.view","approval.start","approval.decide","approval.export",
      "lightfuels.view","lightfuels.complete","lightfuels.export",
      "activity.view.any","activity.export","roles.view","roles.manage"
    ]),
    [ROLES.PUMP_ATTENDANT]: new Set([
      "route.dashboard","route.requests","route.lightfuels",
      "request.view.any",
      "lightfuels.view","lightfuels.complete"
    ]),
    [ROLES.USER]: new Set([
      "route.dashboard","route.requests","route.new",
      "request.create","request.view.own"
    ])
  });
  const STATUSES = ["Draft", "Submitted", "Under Review", "Approved", "Rejected", "Issued", "Completed", "Cancelled"];
  const VALID_TRANSITIONS = {
    "Draft": ["Submitted", "Cancelled"],
    "Submitted": ["Under Review", "Cancelled"],
    "Under Review": ["Approved", "Rejected", "Cancelled"],
    "Approved": ["Cancelled"],
    "Rejected": [],
    "Issued": [],
    "Completed": [],
    "Cancelled": []
  };

  const ROUTES = {
    dashboard: { title: "Dashboard", eyebrow: "OPERATIONS OVERVIEW" },
    analytics: { title: "Analytics", eyebrow: "CONSUMPTION INTELLIGENCE" },
    requests: { title: "All Requests", eyebrow: "REQUEST REGISTRY" },
    new: { title: "New Fuel Request", eyebrow: "REQUEST CREATION" },
    approvals: { title: "Approvals", eyebrow: "REVIEW QUEUE" },
    lightfuels: { title: "LightFuels", eyebrow: "INVENTORY OPERATIONS" },
    activity: { title: "Activity", eyebrow: "AUDIT TRAIL" },
    roles: { title: "Role Management", eyebrow: "ACCESS CONTROL" }
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    content: $("content"),
    nav: $("nav"),
    sidebar: $("sidebar"),
    sidebarBackdrop: $("sidebarBackdrop"),
    mobileMenuBtn: $("mobileMenuBtn"),
    mobileCloseBtn: $("mobileCloseBtn"),
    pageTitle: $("pageTitle"),
    pageEyebrow: $("pageEyebrow"),
    globalSearch: $("globalSearch"),
    approvalNavBadge: $("approvalNavBadge"),
    themeToggle: $("themeToggle"),
    notificationBtn: $("notificationBtn"),
    autoRefreshStatus: $("autoRefreshStatus"),
    autoRefreshStatusText: $("autoRefreshStatusText"),
    roleBadge: $("roleBadge"),
    roleBadgeText: $("roleBadgeText"),
    notificationDot: $("notificationDot"),
    notificationDialog: $("notificationDialog"),
    notificationList: $("notificationList"),
    detailDialog: $("detailDialog"),
    detailDialogBody: $("detailDialogBody"),
    confirmDialog: $("confirmDialog"),
    confirmTitle: $("confirmTitle"),
    confirmMessage: $("confirmMessage"),
    confirmActionBtn: $("confirmActionBtn"),
    approvalDecisionDialog: $("approvalDecisionDialog"),
    approvalDecisionForm: $("approvalDecisionForm"),
    approvalDecisionTitle: $("approvalDecisionTitle"),
    approvalDecisionEyebrow: $("approvalDecisionEyebrow"),
    approvalDecisionSummary: $("approvalDecisionSummary"),
    approvalDecisionNote: $("approvalDecisionNote"),
    approvalDecisionNoteLabel: $("approvalDecisionNoteLabel"),
    approvalDecisionRequirement: $("approvalDecisionRequirement"),
    approvalDecisionCounter: $("approvalDecisionCounter"),
    approvalDecisionError: $("approvalDecisionError"),
    approvalDecisionSubmit: $("approvalDecisionSubmit"),
    refuelingCompletionDialog: $("refuelingCompletionDialog"),
    refuelingCompletionForm: $("refuelingCompletionForm"),
    refuelingCompletionTitle: $("refuelingCompletionTitle"),
    refuelingCompletionSubtitle: $("refuelingCompletionSubtitle"),
    refuelingCompletionSummary: $("refuelingCompletionSummary"),
    refuelingAmount: $("refuelingAmount"),
    refuelingInvoiceNumber: $("refuelingInvoiceNumber"),
    refuelingFuelQuantity: $("refuelingFuelQuantity"),
    refuelingReceiptPhoto: $("refuelingReceiptPhoto"),
    refuelingReceiptLabel: $("refuelingReceiptLabel"),
    refuelingReceiptPreview: $("refuelingReceiptPreview"),
    refuelingCompleteBtn: $("refuelingCompleteBtn"),
    activityDetailDialog: $("activityDetailDialog"),
    activityDetailTitle: $("activityDetailTitle"),
    activityDetailBody: $("activityDetailBody"),
    activityDetailFooter: $("activityDetailFooter"),
    toastRegion: $("toastRegion")
  };

  let state = {
    route: "dashboard",
    dataStatus: "loading",
    storageErrors: [],
    activityError: null,
    loadedAt: null,
    requests: [],
    activity: [],
    prefs: { theme: "dark", pageSize: 8, userName: AUTHENTICATED_NAME, role: AUTHENTICATED_ROLE },
    inventory: [],
    userRoles: [],
    roleFilters: { search: "", role: "all" },
    filters: {
      search: "", status: "", department: "", refuelType: "", priority: "", location: "", month: "", sort: "newest", page: 1
    },
    analyticsPeriod: "6m",
    analyticsFilters: { department: "", status: "", location: "" },
    approvalFilters: { search: "", stage: "", refuelType: "", priority: "", sort: "oldest" },
    lightFuelFilters: { search: "", fuelType: "", location: "", health: "", requestView: "all" },
    activityFilters: { search: "", type: "all", actor: "", period: "all", linkage: "all", sort: "newest" },
    activityVisibleCount: 30,
    activityFilter: "all",
    activitySyncStatus: "idle",
    activityLastRefreshAt: null,
    activityRefreshError: null
  };

  let pendingConfirmation = null;
  let pendingApprovalDecision = null;
  let pendingRefuelingCompletion = null;
  let refuelingReceiptData = null;
  const AUTO_REFRESH_INTERVAL_MS = 15000;
  const AUTO_REFRESH_MIN_GAP_MS = 2500;
  const autoRefresh = {
    timer: null,
    inFlight: false,
    pending: false,
    deferredReason: "",
    lastAttemptAt: 0,
    lastSuccessAt: 0,
    lastSignature: "",
    generation: 0
  };

  const ACTIVITY_REFRESH_INTERVAL_MS = 20000;
  let activityRefreshTimer = null;
  let activityFilterPersistTimer = null;
  let activityRefreshPromise = null;


  function normalizeUserKey(value){return String(value||"").trim().toLocaleLowerCase();}
  function cloudRoleDirectory(){
    const rows=Array.isArray(globalThis.WMModuleDirectory)?globalThis.WMModuleDirectory:[];
    return rows.map((x)=>({
      id:String(x.id||""), cloudUserId:x.id||null, userName:x.display_name||x.email||"User",
      userKey:normalizeUserKey(x.email||x.display_name), email:x.email||"",
      role:normalizeRole(x.module_role||DEFAULT_ROLE), source:"work-management-cloud-directory",
      status:x.status||"active", createdAt:null, updatedAt:null
    }));
  }
  function ensureAuthenticatedRoleRecord(){
    state.userRoles=cloudRoleDirectory();
    const id=CLOUD_IDENTITY?.user?.id;
    let rec=state.userRoles.find((x)=>x.cloudUserId===id);
    if(!rec){rec={id:String(id||"current"),cloudUserId:id||null,userName:AUTHENTICATED_NAME,userKey:normalizeUserKey(CLOUD_IDENTITY?.user?.email||AUTHENTICATED_NAME),email:CLOUD_IDENTITY?.user?.email||"",role:AUTHENTICATED_ROLE,source:"work-management-cloud",status:"active"};state.userRoles.push(rec);}
    return rec;
  }
  function userRoleRecord(userName=currentActor()){return state.userRoles.find(x=>x.userKey===normalizeUserKey(userName)||normalizeUserKey(x.userName)===normalizeUserKey(userName))||null;}
  function resolveRoleForUser(userName=currentActor()){return normalizeUserKey(userName)===normalizeUserKey(AUTHENTICATED_NAME)?AUTHENTICATED_ROLE:(userRoleRecord(userName)?.role||DEFAULT_ROLE);}
  function saveUserRoleDirectory(){toast("Managed centrally","FuelTrack+ roles are assigned from Work Management Users and enforced by Supabase.","info");return false;}
  function filteredManagedUsers(){const q=normalizeText(state.roleFilters.search);return[...state.userRoles].filter(x=>(!q||normalizeText(x.userName).includes(q)||normalizeText(x.email).includes(q)||normalizeText(x.role).includes(q))&&(state.roleFilters.role==="all"||x.role===state.roleFilters.role)).sort((a,b)=>xname(a).localeCompare(xname(b)));}
  function xname(x){return String(x?.userName||x?.email||"");}

  function normalizeRole(role) {
    return Object.values(ROLES).includes(role) ? role : DEFAULT_ROLE;
  }

  function normalizeActivityFilters(value){const f=value&&typeof value==="object"?value:{};return{search:String(f.search||""),type:["all","submit","review","issue","system"].includes(f.type)?f.type:"all",actor:String(f.actor||""),period:["all","today","7d","30d"].includes(f.period)?f.period:"all",linkage:["all","linked","unlinked"].includes(f.linkage)?f.linkage:"all",sort:f.sort==="oldest"?"oldest":"newest"};}
  function normalizeAccessProfile(value){const p=value&&typeof value==="object"?value:{};return{theme:p.theme==="light"?"light":"dark",pageSize:Number(p.pageSize)||8,userName:AUTHENTICATED_NAME,role:AUTHENTICATED_ROLE,activityFilters:normalizeActivityFilters(p.activityFilters)};}

  function currentRole(){return AUTHENTICATED_ROLE;}

  function hasPermission(permission) {
    return Boolean(PERMISSIONS[currentRole()]?.has(permission));
  }

  function requirePermission(permission, message="You do not have permission to perform this action.") {
    if (hasPermission(permission)) return true;
    toast("Access denied", message, "error");
    return false;
  }

  function canAccessRoute(route) {
    return hasPermission(`route.${route}`);
  }

  function isRequestOwnedByCurrentUser(request) {
    const userId = String(CLOUD_IDENTITY?.user?.id || '');
    if (userId && String(request?.createdByUserId || '') === userId) return true;
    const actor = normalizeText(currentActor());
    if (!actor) return false;
    const candidates = [
      request?.createdBy,
      request?.requester,
      request?.vehicleOwner,
      request?.containerOwner
    ].map(normalizeText).filter(Boolean);
    return candidates.includes(actor);
  }

  function canViewRequest(request) {
    if (hasPermission("request.view.any")) return true;
    return hasPermission("request.view.own") && isRequestOwnedByCurrentUser(request);
  }

  function authorizedRequests(rows=state.requests) {
    const source = Array.isArray(rows) ? rows : [];
    if (hasPermission("request.view.any")) return source;
    if (hasPermission("request.view.own")) return source.filter(isRequestOwnedByCurrentUser);
    return [];
  }

  function authorizedActivity(rows=state.activity) {
    const source = Array.isArray(rows) ? rows : [];
    return hasPermission("activity.view.any") ? source : [];
  }

  function firstAccessibleRoute() {
    return ["dashboard","requests","new","analytics","approvals","lightfuels","activity","roles"].find(canAccessRoute) || "dashboard";
  }

  function updateRbacUi() {
    const role = currentRole();
    if (els.roleBadge) els.roleBadge.dataset.role = role.toLowerCase().replace(/\s+/g,"-");
    if (els.roleBadgeText) els.roleBadgeText.textContent = role;

    els.nav?.querySelectorAll("[data-route]").forEach(button=>{
      const allowed = canAccessRoute(button.dataset.route);
      button.hidden = !allowed;
      button.setAttribute("aria-hidden", allowed ? "false" : "true");
      button.tabIndex = allowed ? 0 : -1;
    });

    if (els.globalSearch) {
      const canSearch = canAccessRoute("requests");
      els.globalSearch.disabled = !canSearch;
      els.globalSearch.closest(".global-search")?.classList.toggle("disabled", !canSearch);
    }
  }

  function readJsonResult(key, fallback) {
    try {
      const raw = globalThis.WMModuleStore.getItem(key);
      if (raw === null) return { value: fallback, error: null };
      const parsed = JSON.parse(raw);
      return { value: parsed, error: null };
    } catch (error) {
      console.error(error);
      return { value: fallback, error: `${key}: ${error?.message || "unavailable"}` };
    }
  }

  function saveJson(key, value) {
    try {
      globalThis.WMModuleStore.setItem(key, JSON.stringify(value));
      autoRefresh.lastSignature = storageRevisionSignature();
      autoRefresh.lastSuccessAt = Date.now();
      autoRefresh.lastAttemptAt = Date.now();
      updateAutoRefreshStatus("current");
      return true;
    } catch (error) {
      console.error(error);
      toast("Cloud persistence error", "FuelTrack+ could not persist workspace data to the active backend.", "error");
      return false;
    }
  }

  function uid(prefix = "req") {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function storageRevisionSignature() {
    const values = [KEYS.requests, KEYS.prefs, KEYS.inventory].map(key => globalThis.WMModuleStore.getItem(key) || "");
    let hash = 2166136261;
    for (const value of values) {
      for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      hash ^= 31;
      hash = Math.imul(hash, 16777619);
    }
    return `${values.map(value => value.length).join(":")}:${(hash >>> 0).toString(16)}`;
  }

  function hydrateState(options = {}) {
    const { source = "manual", forceRender = true, skipIfUnchanged = false } = options;

    const revision = storageRevisionSignature();

    if (skipIfUnchanged && revision === autoRefresh.lastSignature && state.dataStatus !== "loading") {
      autoRefresh.lastAttemptAt = Date.now();
      autoRefresh.lastSuccessAt = Date.now();
      updateAutoRefreshStatus("current");
      return { changed: false, revision, source };
    }

    const requests = readJsonResult(KEYS.requests, []);
    const activity = { value: Array.isArray(globalThis.WMModuleActivity?.items) ? [...globalThis.WMModuleActivity.items] : [], error: globalThis.WMModuleActivity?.error?.message || null };
    const prefs = readJsonResult(KEYS.prefs, { theme: "dark", pageSize: 8, userName: AUTHENTICATED_NAME, role: AUTHENTICATED_ROLE });
    const inventory = readJsonResult(KEYS.inventory, []);
    const userRoles = { value: cloudRoleDirectory(), error: null };

    state.requests = Array.isArray(requests.value) ? requests.value : [];
    state.activity = Array.isArray(activity.value) ? activity.value : [];
    state.inventory = Array.isArray(inventory.value) ? inventory.value : [];
    state.userRoles = Array.isArray(userRoles.value) ? userRoles.value : [];
    state.prefs = normalizeAccessProfile(prefs.value); state.prefs.userName=AUTHENTICATED_NAME; state.prefs.role=AUTHENTICATED_ROLE;
    state.activityFilters = normalizeActivityFilters(state.prefs.activityFilters || state.activityFilters);
    ensureAuthenticatedRoleRecord();
    state.prefs.role = resolveRoleForUser(state.prefs.userName);
    state.activityError = activity.error || null;
    state.storageErrors = [requests.error, prefs.error, inventory.error, userRoles.error].filter(Boolean);
    state.dataStatus = state.storageErrors.length ? "error" : "ready";
    state.loadedAt = new Date().toISOString();

    autoRefresh.lastSignature = revision;
    autoRefresh.lastAttemptAt = Date.now();
    autoRefresh.lastSuccessAt = Date.now();

    document.documentElement.classList.toggle("light", state.prefs.theme === "light");
    updateRbacUi();
    if (!canAccessRoute(state.route)) state.route = firstAccessibleRoute();
    updateBadges();
    if (forceRender) renderRoute();
    updateAutoRefreshStatus(state.storageErrors.length ? "error" : "current");

    return { changed: true, revision, source };
  }

  function autoRefreshInteractionReason() {
    if (document.hidden) return "background";
    if (document.querySelector("dialog[open]")) return "dialog open";

    const active = document.activeElement;
    if (active && els.content.contains(active) && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName)) {
      return "editing";
    }

    if (state.route === "new") {
      const form = $("requestForm");
      if (form) {
        const hasData = [...form.querySelectorAll("input,textarea,select")].some(control => {
          if (control.id === "refuelType") return false;
          if (control.type === "file") return Boolean(control.files?.length);
          return String(control.value || "").trim() !== "";
        });
        if (hasData) return "request form active";
      }
    }
    return "";
  }

  function updateAutoRefreshStatus(mode = "current", detail = "") {
    if (!els.autoRefreshStatus || !els.autoRefreshStatusText) return;
    els.autoRefreshStatus.dataset.state = mode;

    const labels = {
      starting: "Starting…",
      refreshing: "Refreshing…",
      current: "Up to date",
      deferred: detail ? `Paused · ${detail}` : "Paused for interaction",
      background: "Paused in background",
      error: "Refresh issue"
    };
    els.autoRefreshStatusText.textContent = labels[mode] || "Auto Refresh";
  }

  function requestAppRefresh({ source = "auto", force = false, showLoading = false } = {}) {
    const now = Date.now();

    if (autoRefresh.inFlight) {
      autoRefresh.pending = true;
      return false;
    }

    if (!force && now - autoRefresh.lastAttemptAt < AUTO_REFRESH_MIN_GAP_MS) return false;

    const interactionReason = force ? "" : autoRefreshInteractionReason();
    if (interactionReason) {
      autoRefresh.pending = true;
      autoRefresh.deferredReason = interactionReason;
      updateAutoRefreshStatus(interactionReason === "background" ? "background" : "deferred", interactionReason);
      return false;
    }

    autoRefresh.inFlight = true;
    autoRefresh.pending = false;
    autoRefresh.deferredReason = "";
    autoRefresh.lastAttemptAt = now;
    const generation = ++autoRefresh.generation;

    updateAutoRefreshStatus("refreshing");

    if (showLoading) {
      state.dataStatus = "loading";
      renderRoute();
    }

    queueMicrotask(() => {
      try {
        if (generation !== autoRefresh.generation) return;
        hydrateState({
          source,
          forceRender: true,
          skipIfUnchanged: !force
        });
      } finally {
        if (generation === autoRefresh.generation) {
          autoRefresh.inFlight = false;
          const rerun = autoRefresh.pending && !autoRefreshInteractionReason();
          autoRefresh.pending = false;
          if (rerun) setTimeout(() => requestAppRefresh({ source: "deferred" }), 120);
        }
      }
    });

    return true;
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    updateAutoRefreshStatus("starting");
    autoRefresh.timer = window.setInterval(() => {
      requestAppRefresh({ source: "interval" });
    }, AUTO_REFRESH_INTERVAL_MS);
  }

  function stopAutoRefresh() {
    if (autoRefresh.timer !== null) {
      clearInterval(autoRefresh.timer);
      autoRefresh.timer = null;
    }
  }

  function handleVisibilityRefresh() {
    if (document.hidden) {
      updateAutoRefreshStatus("background");
      return;
    }

    const stale = !autoRefresh.lastSuccessAt || Date.now() - autoRefresh.lastSuccessAt >= AUTO_REFRESH_INTERVAL_MS;
    if (stale || autoRefresh.pending) {
      setTimeout(() => requestAppRefresh({ source: "foreground" }), 100);
    } else {
      updateAutoRefreshStatus("current");
    }
  }

  function handleStorageSynchronization(event) {
    if (!event.key || ![KEYS.requests, KEYS.prefs, KEYS.inventory].includes(event.key)) return;

    if (document.hidden) {
      autoRefresh.pending = true;
      updateAutoRefreshStatus("background");
      return;
    }

    setTimeout(() => requestAppRefresh({ source: "storage" }), 80);
  }

  window.addEventListener("wm:module-directory-change",()=>{state.userRoles=cloudRoleDirectory();if(state.route==="roles")renderRoles();});
  window.addEventListener("wm:activity-change",(event)=>{
    state.activity=Array.isArray(event.detail)?[...event.detail]:[];
    state.activityError=null;
    state.activityRefreshError=null;
    state.activitySyncStatus="current";
    state.activityLastRefreshAt=new Date().toISOString();
    if(state.route==="activity") {
      if (document.getElementById("activityStream")) updateActivityResults({refreshActors:true});
      else renderActivity({preserveScroll:true});
    } else if(state.route==="dashboard") renderDashboard();
  });

  function initialize() {
    bindGlobalEvents();
    routeTo("dashboard", false);
    updateAutoRefreshStatus("starting");
    setTimeout(() => {
      hydrateState({ source: "initial", forceRender: true, skipIfUnchanged: false });
      startAutoRefresh();
    }, 0);
  }

  function bindGlobalEvents() {
    document.addEventListener("keydown",event=>{
      if(state.route!=="activity"||event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey) return;
      const target=event.target;
      const editing=target&&/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if(event.key==="/"&&!editing){event.preventDefault();$("activitySearch")?.focus({preventScroll:true});}
    });
    els.nav.addEventListener("click", (event) => {
      const button = event.target.closest("[data-route]");
      if (!button || !els.nav.contains(button)) return;
      routeTo(button.dataset.route);
    });
    els.mobileMenuBtn.addEventListener("click", openSidebar);
    els.mobileCloseBtn.addEventListener("click", closeSidebar);
    els.sidebarBackdrop.addEventListener("click", closeSidebar);
    els.themeToggle.addEventListener("click", toggleTheme);
    els.globalSearch.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        state.filters.search = els.globalSearch.value.trim();
        state.filters.page = 1;
        routeTo("requests");
      }
    });
    els.notificationBtn.addEventListener("click", showNotifications);
    document.addEventListener("click", (event) => {
      const closer = event.target.closest("[data-dialog-close]");
      if (closer) {
        const dialog = $(closer.dataset.dialogClose);
        if (dialog?.open) dialog.close();
      }
    });
    els.confirmDialog.addEventListener("close", () => {
      if (els.confirmDialog.returnValue === "confirm" && pendingConfirmation) {
        const action = pendingConfirmation;
        pendingConfirmation = null;
        action();
      } else {
        pendingConfirmation = null;
      }
    });
    els.approvalDecisionNote?.addEventListener("input", () => {
      if (els.approvalDecisionCounter) els.approvalDecisionCounter.textContent = `${els.approvalDecisionNote.value.length}/500`;
      if (els.approvalDecisionError) els.approvalDecisionError.textContent = "";
    });
    els.approvalDecisionForm?.addEventListener("submit", event => {
      event.preventDefault();
      commitApprovalDecision();
    });
    els.approvalDecisionDialog?.addEventListener("close", () => {
      pendingApprovalDecision = null;
      if (els.approvalDecisionNote) els.approvalDecisionNote.value = "";
      if (els.approvalDecisionCounter) els.approvalDecisionCounter.textContent = "0/500";
      if (els.approvalDecisionError) els.approvalDecisionError.textContent = "";
    });
    els.refuelingCompletionForm?.addEventListener("submit", event => {
      event.preventDefault();
      submitRefuelingCompletion();
    });
    els.refuelingCompletionDialog?.addEventListener("close", resetRefuelingCompletionDialog);
    els.refuelingReceiptPhoto?.addEventListener("change", handleRefuelingReceiptPhoto);
    [els.refuelingAmount,els.refuelingInvoiceNumber,els.refuelingFuelQuantity].forEach(control=>{
      control?.addEventListener("input",()=>clearRefuelingCompletionErrors());
    });
    document.addEventListener("visibilitychange", handleVisibilityRefresh);
    window.addEventListener("storage", handleStorageSynchronization);
    window.addEventListener("focus", () => {
      if (!document.hidden && autoRefresh.pending) setTimeout(() => requestAppRefresh({ source: "focus" }), 100);
    });
    document.addEventListener("focusout", () => {
      if (autoRefresh.pending && !autoRefreshInteractionReason()) {
        setTimeout(() => requestAppRefresh({ source: "interaction-complete" }), 180);
      }
    });
    window.addEventListener("beforeunload", stopAutoRefresh, { once: true });
  }

  function routeTo(route, focus = true) {
    if (!ROUTES[route]) route = firstAccessibleRoute();
    if (!canAccessRoute(route)) {
      const fallback = firstAccessibleRoute();
      toast("Access restricted", `${currentRole()} does not have access to ${ROUTES[route]?.title || "this module"}.`, "error");
      route = fallback;
    }
    const alreadyMounted = state.route === route && els.content.dataset.route === route;
    if (alreadyMounted) {
      closeSidebar();
      return;
    }
    state.route = route;
    els.pageTitle.textContent = ROUTES[route].title;
    els.pageEyebrow.textContent = ROUTES[route].eyebrow;
    [...els.nav.querySelectorAll("[data-route]")].forEach(btn => btn.classList.toggle("active", btn.dataset.route === route));
    closeSidebar();
    renderRoute();
    configureActivityAutoRefresh();
    if (focus) {
      els.content.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (autoRefresh.lastSuccessAt && Date.now() - autoRefresh.lastSuccessAt > AUTO_REFRESH_INTERVAL_MS && !document.hidden) {
      setTimeout(() => requestAppRefresh({ source: "navigation" }), 60);
    }
  }

  function renderRoute() {
    els.content.classList.remove("route-enter");
    void els.content.offsetWidth;
    if (state.dataStatus === "loading") {
      renderLoadingState();
      els.content.classList.add("route-enter");
      return;
    }
    const renderers = {
      dashboard: renderDashboard,
      analytics: renderAnalytics,
      requests: renderRequests,
      new: renderNewRequest,
      approvals: renderApprovals,
      lightfuels: renderLightFuels,
      activity: renderActivity,
      roles: renderRoles
    };
    renderers[state.route]();
    els.content.dataset.route = state.route;
    els.content.querySelector("[data-access-home]")?.addEventListener("click",()=>routeTo(firstAccessibleRoute()));
    els.content.classList.add("route-enter");
  }

  function renderLoadingState() {
    els.content.innerHTML = `
      <div class="page-head"><div><div class="skeleton" style="width:180px;height:30px;margin-bottom:10px"></div><div class="skeleton" style="width:min(560px,80vw);height:14px"></div></div></div>
      <div class="kpi-grid">${Array.from({length:4},()=>`<article class="kpi-card"><div class="skeleton" style="width:55%;height:11px"></div><div class="skeleton" style="width:42%;height:28px;margin-top:20px"></div><div class="skeleton" style="width:68%;height:9px;margin-top:10px"></div></article>`).join("")}</div>
      <article class="panel"><div class="skeleton" style="width:150px;height:14px;margin-bottom:18px"></div>${Array.from({length:5},()=>'<div class="skeleton skeleton-row"></div>').join("")}</article>`;
  }

  function storageBanner() {
    if (state.dataStatus !== "error") return "";
    return `<div class="data-banner error"><strong>Some persisted data is unavailable.</strong><span>FuelTrack+ is showing the data that could be read successfully. ${escapeHtml(state.storageErrors.join(" · "))}</span></div>`;
  }

  function renderDashboard() {
    const visibleRequests = authorizedRequests();
    const visibleActivity = authorizedActivity();
    const m = metrics(visibleRequests);
    const primary = primaryFuelMetrics(visibleRequests);
    const hasRequests = visibleRequests.length > 0;
    const recent = [...visibleRequests].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,6);
    const recentActivity = [...visibleActivity].sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,5);
    const monthly = monthlyRequestCountSeries(6,visibleRequests);
    const approvalRate = m.decisionCount ? Math.round((m.approved / m.decisionCount) * 100) : null;
    const inventoryLevel = state.inventory.reduce((sum,t)=>sum+(Number(t.level)||0),0);
    const inventoryCapacity = state.inventory.reduce((sum,t)=>sum+(Number(t.capacity)||0),0);

    els.content.innerHTML = `
      ${storageBanner()}
      <div class="page-head">
        <div>
          <h2>Fuel operations overview</h2>
          <p>Primary financial and refueling measures are presented first, followed by workflow, inventory, and operational context.</p>
        </div>
        <div class="page-actions">
          <button class="button secondary" type="button" data-action="refresh-dashboard">↻ Refresh</button>
          ${hasPermission("request.export")?`<button class="button secondary" type="button" data-action="export" ${hasRequests?"":"disabled"}>⇩ Export PDF</button>`:""}
          ${hasPermission("request.create")?`<button class="button primary" type="button" data-route-shortcut="new">＋ New request</button>`:""}
        </div>
      </div>

      <section class="primary-metrics-section" aria-label="Primary fuel operations metrics">
        <div class="primary-metrics-heading">
          <div><span class="section-label">PRIMARY OPERATIONS</span><h3>Fuel performance</h3></div>
          <p>Spend and volume use only successfully completed refueling records.</p>
        </div>
        <div class="primary-metrics-grid">
          ${primaryMetricCard("Total Spent",`₱${money(primary.totalSpent)}`,primary.completedWithRefueling?`${primary.completedWithRefueling} completed refueling record${primary.completedWithRefueling===1?"":"s"}`:"Available after refueling completion","₱",primary.completedWithRefueling>0)}
          ${primaryMetricCard("Fuel Volume",`${primary.fuelVolume.toLocaleString(undefined,{maximumFractionDigits:2})} L`,primary.completedWithRefueling?"Completed refueling volume":"Available after refueling completion","◒",primary.completedWithRefueling>0)}
          ${primaryMetricCard("Requests",String(primary.requests),primary.requests?"Persisted requests in the current workspace":"No requests recorded","≡",true)}
          ${primaryMetricCard("AVG / VEHICLE",`${primary.avgPerVehicle.toLocaleString(undefined,{maximumFractionDigits:2})} L`,primary.vehicleCount?`Average completed volume across ${primary.vehicleCount} vehicle${primary.vehicleCount===1?"":"s"}`:"Available after vehicle refueling completion","↗",primary.vehicleCount>0)}
        </div>
      </section>

      <section class="secondary-operations-strip" aria-label="Secondary workflow information">
        <div><span>Requests this month</span><strong>${m.monthRequests}</strong></div>
        <div><span>Approved this month</span><strong>${m.monthApprovedCount}</strong></div>
        <div><span>Pending review</span><strong>${m.pending}</strong></div>
        <div><span>Completed this month</span><strong>${m.monthIssuedCount}</strong></div>
      </section>

      <div class="dashboard-grid">
        <div class="stack">
          <article class="chart-card">
            <div class="panel-head">
              <div><h3>Monthly request activity</h3><p>Calculated from persisted request creation dates</p></div>
              ${hasRequests?`<div class="inline-stats"><div class="inline-stat"><span>6-month total</span><strong>${monthly.reduce((s,x)=>s+x.value,0)} requests</strong></div></div>`:""}
            </div>
            ${hasRequests ? barChart(monthly) : emptyState("No request history yet","Create or import requests to populate the monthly activity chart.")}
          </article>

          <article class="panel table-panel">
            <div class="table-head">
              <div><h3>Recent requests</h3><p>Newest persisted request records</p></div>
              <button class="button ghost small" type="button" data-route-shortcut="requests">View all</button>
            </div>
            ${recent.length ? requestTable(recent, false) : emptyState("No requests recorded","New fuel requests will appear here after they are saved or submitted.")}
          </article>
        </div>

        <div class="stack">
          <article class="panel">
            <div class="panel-head"><div><h3>Approval health</h3><p>Based only on completed approval decisions</p></div></div>
            ${approvalRate === null ? emptyState("No approval decisions yet","Approval rate becomes available after at least one request is approved or rejected.") : `
              <div class="donut-wrap"><div class="donut" style="--p:${approvalRate}"></div><div class="donut-label"><strong>${approvalRate}%</strong><span>approval rate</span></div></div>`}
          </article>
          <article class="panel">
            <div class="panel-head"><div><h3>Workflow status</h3><p>Current persisted request distribution</p></div></div>
            ${hasRequests ? `<div class="status-list">${workflowStatusList()}</div>` : emptyState("No workflow data","Request status distribution is unavailable until requests exist.")}
          </article>
          <article class="panel">
            <div class="panel-head"><div><h3>Inventory availability</h3><p>Derived from LightFuels inventory records</p></div></div>
            ${state.inventory.length && inventoryCapacity>0 ? `
              <div class="summary-line"><span>Available stock</span><strong>${formatLiters(inventoryLevel)}</strong></div>
              <div class="summary-line"><span>Total capacity</span><strong>${formatLiters(inventoryCapacity)}</strong></div>
              <div class="summary-line"><span>Storage records</span><strong>${state.inventory.length}</strong></div>` : emptyState("Inventory unavailable","No persisted LightFuels inventory records are currently available for stock visibility or issuance checks.")}
          </article>
        </div>
      </div>

      <div style="height:15px"></div>
      <div class="dashboard-grid">
        <article class="panel">
          <div class="panel-head"><div><h3>Recent activity</h3><p>Latest persisted workflow events</p></div><button class="button ghost small" type="button" data-route-shortcut="activity">View timeline</button></div>
          ${recentActivity.length ? `<div class="dashboard-activity-list">${recentActivity.map(dashboardActivityItem).join("")}</div>` : emptyState("No recorded activity","Activity is created when users save, submit, review, issue, complete, or cancel requests.")}
        </article>
        <article class="panel">
          <div class="panel-head"><div><h3>Data completeness</h3><p>Availability of optional persisted request fields</p></div></div>
          ${hasRequests ? `<div class="status-list">
            ${progressRow("Asset identifiers",`${m.assetRequests} of ${state.requests.length} requests`,state.requests.length?m.assetRequests/state.requests.length*100:0)}
            ${progressRow("Operational purpose",`${m.notedRequests} of ${state.requests.length} requests`,state.requests.length?m.notedRequests/state.requests.length*100:0)}
            ${progressRow("Route context",`${m.routedRequests} of ${state.requests.length} requests`,state.requests.length?m.routedRequests/state.requests.length*100:0)}
          </div>` : emptyState("No completeness data","Completeness indicators become available after requests are recorded.")}
        </article>
      </div>
    `;
    bindRouteShortcuts();
    els.content.querySelector('[data-action="export"]')?.addEventListener("click",()=>exportRequestsPdf(visibleRequests,{title:"FuelTrack+ Request Register",subtitle:"Dashboard request export"}));
    els.content.querySelector('[data-action="refresh-dashboard"]')?.addEventListener("click",()=>requestAppRefresh({source:"manual",force:true,showLoading:true}));
    bindTableActions();
    els.content.querySelectorAll("[data-dashboard-request]").forEach(btn=>btn.addEventListener("click",()=>showRequestDetail(btn.dataset.dashboardRequest)));
  }

  function renderAnalytics() {
    if (state.dataStatus === "loading") {
      els.content.innerHTML = `${storageBanner()}${analyticsLoadingState()}`;
      return;
    }

    const context=analyticsCountContext();
    const {filtered,series,byDept,byType,byLocation,byStatus,requestCount,pendingCount,approvedCount,rejectedCount,completionCount}=context;
    const selectedFilterCount=Object.values(state.analyticsFilters).filter(Boolean).length;
    const decisionCount=approvedCount+rejectedCount;
    const approvalRate=decisionCount?approvedCount/decisionCount*100:0;
    const primary=primaryFuelMetrics(filtered);

    els.content.innerHTML = `
      ${storageBanner()}
      <div class="page-head analytics-page-head">
        <div><h2>Fuel performance analytics</h2><p>Start with spend, completed fuel volume, request demand, and average vehicle consumption, then explore secondary workflow context.</p></div>
        <div class="page-actions">
          ${hasPermission("analytics.export")?`<button class="button secondary" type="button" data-action="analytics-export" ${filtered.length?"":"disabled"}>⇩ Export PDF</button>`:""}
          <button class="button secondary" type="button" data-action="analytics-refresh">↻ Refresh</button>
        </div>
      </div>

      <section class="analytics-toolbar panel" aria-label="Analytics controls">
        <div class="analytics-control-group">
          <span class="analytics-control-label">Period</span>
          <div class="segmented" id="analyticsSegments">
            ${["3m","6m","12m","all"].map(p=>`<button type="button" data-period="${p}" class="${state.analyticsPeriod===p?"active":""}">${p==="all"?"All time":p.toUpperCase()}</button>`).join("")}
          </div>
        </div>
        <div class="analytics-filter-grid">
          ${analyticsFilterSelect("analyticsDepartment","department",uniqueFromRows(state.requests,"department"),"All departments")}
          ${analyticsFilterSelect("analyticsStatus","status",[...new Set(state.requests.map(r=>r.status).filter(Boolean))].sort(),"All statuses")}
          ${analyticsFilterSelect("analyticsLocation","location",analyticsLocationValues(state.requests),"All locations / contexts")}
        </div>
        <button class="button ghost small analytics-reset" type="button" data-action="analytics-reset" ${selectedFilterCount?"":"disabled"}>Reset filters${selectedFilterCount?` (${selectedFilterCount})`:""}</button>
      </section>

      <div class="analytics-context-line">
        <span><strong>${requestCount}</strong> matching request${requestCount===1?"":"s"}</span>
        <span>${analyticsPeriodLabel()}</span>
        ${selectedFilterCount?`<span>${selectedFilterCount} active filter${selectedFilterCount===1?"":"s"}</span>`:""}
        ${state.loadedAt?`<span>Refreshed ${escapeHtml(relativeTime(state.loadedAt))}</span>`:""}
      </div>

      <section class="primary-metrics-section analytics-primary-metrics" aria-label="Primary analytics metrics">
        <div class="primary-metrics-heading">
          <div><span class="section-label">PRIMARY ANALYTICS</span><h3>Fuel performance</h3></div>
          <p>Calculated from the active period and filters. Spend and volume use completed refueling records only.</p>
        </div>
        <div class="primary-metrics-grid">
          ${primaryMetricCard("Total Spent",`₱${money(primary.totalSpent)}`,primary.completedWithRefueling?`${primary.completedWithRefueling} completed record${primary.completedWithRefueling===1?"":"s"} in scope`:"No completed refueling data in scope","₱",primary.completedWithRefueling>0)}
          ${primaryMetricCard("Fuel Volume",`${primary.fuelVolume.toLocaleString(undefined,{maximumFractionDigits:2})} L`,primary.completedWithRefueling?"Completed refueling volume in scope":"No completed refueling data in scope","◒",primary.completedWithRefueling>0)}
          ${primaryMetricCard("Requests",String(primary.requests),primary.requests?"Requests matching the active analytics context":"No matching requests","≡",true)}
          ${primaryMetricCard("AVG / VEHICLE",`${primary.avgPerVehicle.toLocaleString(undefined,{maximumFractionDigits:2})} L`,primary.vehicleCount?`Average across ${primary.vehicleCount} vehicle${primary.vehicleCount===1?"":"s"} in scope`:"No completed vehicle refueling data in scope","↗",primary.vehicleCount>0)}
        </div>
      </section>

      <section class="analytics-secondary-strip" aria-label="Secondary workflow analytics">
        <div><span>Pending review</span><strong>${pendingCount}</strong></div>
        <div><span>Approval rate</span><strong>${decisionCount?`${Math.round(approvalRate)}%`:"—"}</strong></div>
        <div><span>Completed</span><strong>${completionCount}</strong></div>
        <div><span>Approval decisions</span><strong>${decisionCount}</strong></div>
      </section>

      <div class="analytics-summary-grid">
        <article class="chart-card analytics-trend-card">
          <div class="panel-head"><div><h3>Request activity trend</h3><p>${escapeHtml(analyticsPeriodLabel())} · grouped by request creation month</p></div></div>
          ${requestCount?barChart(series):emptyState("No matching analytics data","Adjust the period or filters, or record requests to populate this trend.")}
        </article>
        <article class="panel analytics-insights-card">
          <div class="panel-head"><div><h3>Workflow conversion</h3><p>Lifecycle outcomes for the active analytics view</p></div></div>
          ${requestCount?`<div class="analytics-funnel">
            ${funnelRow("Requested",requestCount,100)}
            ${funnelRow("Approved",approvedCount,requestCount?approvedCount/requestCount*100:0)}
            ${funnelRow("Completed",completionCount,requestCount?completionCount/requestCount*100:0)}
          </div>`:emptyState("Conversion unavailable","Lifecycle conversion appears after requests match the selected analytics context.")}
        </article>
      </div>

      <div class="analytics-breakdown-grid">
        ${analyticsBreakdownPanel("Request type","Requests by refuel workflow",byType,requestCount,"refuelType",true)}
        ${analyticsBreakdownPanel("Department","Requests by department",byDept,requestCount,"department",true)}
        ${analyticsBreakdownPanel("Location / context","Vehicle destinations and persisted locations",byLocation,requestCount,"location",true)}
        ${analyticsBreakdownPanel("Request status","Requests by lifecycle status",byStatus,requestCount,"status",true)}
      </div>
    `;

    $("analyticsSegments")?.addEventListener("click",e=>{
      const btn=e.target.closest("[data-period]"); if(!btn)return;
      state.analyticsPeriod=btn.dataset.period; renderAnalytics();
    });
    ["analyticsDepartment","analyticsStatus","analyticsLocation"].forEach(id=>$(id)?.addEventListener("change",e=>{
      const key=id==="analyticsDepartment"?"department":id==="analyticsStatus"?"status":"location";
      state.analyticsFilters[key]=e.target.value; renderAnalytics();
    }));
    els.content.querySelector('[data-action="analytics-reset"]')?.addEventListener("click",()=>{
      state.analyticsFilters={department:"",status:"",location:""}; renderAnalytics();
    });
    els.content.querySelector('[data-action="analytics-refresh"]')?.addEventListener("click",()=>requestAppRefresh({source:"manual",force:true,showLoading:true}));
    els.content.querySelector('[data-action="analytics-export"]')?.addEventListener("click",()=>exportAnalyticsPdf(filtered));
    bindAnalyticsBreakdownFilters();
  }

  function analyticsCountContext() {
    const rows=analyticsPeriodRows();
    const filtered=rows.filter(r=>{
      const location=r.refuelType==="vehicle"
        ? String(r.destination||r.location||"").trim()
        : r.refuelType==="container"
          ? String(r.containerType||"Container request").trim()
          : String(r.location||"").trim();
      return (!state.analyticsFilters.department||r.department===state.analyticsFilters.department) &&
        (!state.analyticsFilters.status||r.status===state.analyticsFilters.status) &&
        (!state.analyticsFilters.location||location===state.analyticsFilters.location);
    });
    const requestCount=filtered.length;
    return {
      filtered,
      series:analyticsCountSeries(filtered),
      byDept:analyticsCountAggregate(filtered,"department"),
      byType:analyticsCountAggregate(filtered,"refuelType",value=>value==="vehicle"?"Vehicle Fuel":value==="container"?"Container Refill":"Legacy"),
      byLocation:analyticsLocationAggregate(filtered),
      byStatus:analyticsCountAggregate(filtered,"status"),
      requestCount,
      pendingCount:filtered.filter(r=>["Submitted","Under Review"].includes(r.status)).length,
      approvedCount:filtered.filter(r=>["Approved","Issued","Completed"].includes(r.status)).length,
      rejectedCount:filtered.filter(r=>r.status==="Rejected").length,
      completionCount:filtered.filter(r=>r.status==="Completed").length
    };
  }

  function analyticsPeriodRows() {
    if(state.analyticsPeriod==="all") return [...state.requests];
    const months=Number.parseInt(state.analyticsPeriod,10)||6;
    const threshold=new Date();
    threshold.setMonth(threshold.getMonth()-months+1,1);
    threshold.setHours(0,0,0,0);
    return state.requests.filter(r=>{
      const d=new Date(r.createdAt);
      return !Number.isNaN(d.getTime()) && d>=threshold;
    });
  }

  function analyticsCountSeries(rows) {
    const months=state.analyticsPeriod==="all"?Math.max(6,Math.min(18,monthsBetweenOldest(rows)+1)):Number.parseInt(state.analyticsPeriod,10)||6;
    const now=new Date(),arr=[];
    for(let i=months-1;i>=0;i--){
      const d=new Date(now.getFullYear(),now.getMonth()-i,1);
      const value=rows.filter(r=>{
        const x=new Date(r.createdAt);
        return !Number.isNaN(x.getTime())&&x.getFullYear()===d.getFullYear()&&x.getMonth()===d.getMonth();
      }).length;
      arr.push({label:d.toLocaleString(undefined,{month:"short",year:months>12?"2-digit":undefined}),value});
    }
    return arr;
  }

  function analyticsCountAggregate(rows,key,labeler=value=>value) {
    const map=new Map();
    rows.forEach(r=>{
      const raw=String(r?.[key]||"").trim();
      const label=raw?labeler(raw):"Unavailable";
      map.set(label,(map.get(label)||0)+1);
    });
    return [...map].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
  }

  function analyticsLocationAggregate(rows) {
    const map=new Map();
    rows.forEach(r=>{
      const label=r.refuelType==="vehicle"?(r.destination||r.location||"Unavailable"):(r.containerType||"Container request");
      map.set(label,(map.get(label)||0)+1);
    });
    return [...map].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
  }

  function uniqueFromRows(rows,key) {
    return [...new Set(rows.map(r=>String(r?.[key]||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  }

  function monthsBetweenOldest(rows) {
    if(!rows.length) return 0;
    const dates=rows.map(r=>new Date(r.createdAt)).filter(d=>!Number.isNaN(d.getTime())).sort((a,b)=>a-b);
    if(!dates.length) return 0;
    const first=dates[0],now=new Date();
    return Math.max(0,(now.getFullYear()-first.getFullYear())*12+now.getMonth()-first.getMonth());
  }

  function analyticsLocationValues(rows) {
    return [...new Set(rows.map(r=>{
      if(r.refuelType==="vehicle") return String(r.destination||r.location||"").trim();
      if(r.refuelType==="container") return String(r.containerType||"Container request").trim();
      return String(r.location||"").trim();
    }).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  }

  function analyticsPeriodLabel() {
    if(state.analyticsPeriod==="all") return "All persisted history";
    const months=Number.parseInt(state.analyticsPeriod,10)||6;
    return `Last ${months} month${months===1?"":"s"}`;
  }

  function analyticsFilterSelect(id,key,options,placeholder) {
    const selected=String(state.analyticsFilters?.[key]||"");
    return `<label class="analytics-filter">
      <span>${escapeHtml(key==="department"?"Department":key==="status"?"Status":"Location / context")}</span>
      <select id="${escapeAttr(id)}" class="select">
        <option value="" ${!selected?"selected":""}>${escapeHtml(placeholder)}</option>
        ${options.map(value=>`<option value="${escapeAttr(value)}" ${selected===String(value)?"selected":""}>${escapeHtml(value)}</option>`).join("")}
      </select>
    </label>`;
  }

  function funnelRow(label,value,pct) {
    const safePct=Math.max(0,Math.min(100,Number(pct)||0));
    return `<div class="analytics-funnel-row">
      <span>${escapeHtml(label)}</span>
      <div class="analytics-funnel-track" aria-hidden="true"><i style="width:${safePct}%"></i></div>
      <strong>${Number(value)||0}</strong>
      <small>${Math.round(safePct)}%</small>
    </div>`;
  }

  function analyticsBreakdownPanel(title,subtitle,rows,total,filterKey,interactive=false) {
    const max=Math.max(...rows.map(row=>Number(row.value)||0),1);
    return `<article class="panel analytics-breakdown-panel">
      <div class="panel-head">
        <div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p></div>
      </div>
      ${rows.length ? `<div class="analytics-ranking">
        ${rows.slice(0,10).map((row,index)=>{
          const pct=total?Math.round((Number(row.value)||0)/total*100):0;
          const filterValue = analyticsBreakdownFilterValue(filterKey,row.label);
          const clickable = interactive && filterValue !== null;
          return `<${clickable?"button":"div"} ${clickable?`type="button" data-analytics-breakdown-key="${escapeAttr(filterKey)}" data-analytics-breakdown-value="${escapeAttr(filterValue)}"`:""} class="analytics-rank-row ${clickable?"interactive":""}">
            <span class="analytics-rank-index">${index+1}</span>
            <span class="analytics-rank-copy">
              <strong>${escapeHtml(row.label)}</strong>
              <span class="analytics-rank-track"><i style="width:${Math.max(3,(Number(row.value)||0)/max*100)}%"></i></span>
            </span>
            <span class="analytics-rank-value">${Number(row.value)||0} <small>${pct}%</small></span>
          </${clickable?"button":"div"}>`;
        }).join("")}
      </div>` : emptyState(`No ${title.toLowerCase()} data`,"No matching requests contain data for this dimension.")}
    </article>`;
  }

  function analyticsBreakdownFilterValue(filterKey,label) {
    if(filterKey==="refuelType") {
      if(label==="Vehicle Fuel") return null;
      if(label==="Container Refill") return null;
      return null;
    }
    if(filterKey==="department") return label==="Unavailable"?null:label;
    if(filterKey==="status") return label==="Unavailable"?null:label;
    if(filterKey==="location") return label==="Unavailable"?null:label;
    return null;
  }

  function bindAnalyticsBreakdownFilters() {
    els.content.querySelectorAll("[data-analytics-breakdown-key]").forEach(btn=>btn.addEventListener("click",()=>{
      const key=btn.dataset.analyticsBreakdownKey;
      const value=btn.dataset.analyticsBreakdownValue;
      if(!key || value===undefined) return;
      if(key==="department"||key==="status"||key==="location") {
        state.analyticsFilters[key]=value;
        renderAnalytics();
      }
    }));
  }

  function analyticsLoadingState() {
    return `<div class="page-head analytics-page-head">
      <div>
        <div class="skeleton" style="width:310px;height:42px"></div>
        <div class="skeleton" style="width:min(760px,82vw);height:17px;margin-top:11px"></div>
      </div>
    </div>
    <section class="panel analytics-toolbar">
      <div class="skeleton" style="width:100%;height:50px"></div>
    </section>
    <div class="kpi-grid analytics-kpi-grid">
      ${Array.from({length:4},()=>`<article class="kpi-card"><div class="skeleton" style="width:55%;height:13px"></div><div class="skeleton" style="width:38%;height:34px;margin-top:20px"></div><div class="skeleton" style="width:70%;height:11px;margin-top:10px"></div></article>`).join("")}
    </div>
    <div class="analytics-summary-grid">
      <article class="chart-card"><div class="skeleton" style="width:180px;height:16px;margin-bottom:18px"></div><div class="skeleton" style="width:100%;height:260px"></div></article>
      <article class="panel"><div class="skeleton" style="width:160px;height:16px;margin-bottom:18px"></div>${Array.from({length:4},()=>'<div class="skeleton skeleton-row"></div>').join("")}</article>
    </div>`;
  }

  function renderRequests() {
    if (state.dataStatus === "loading") {
      els.content.innerHTML = `${storageBanner()}${requestsLoadingState()}`;
      return;
    }

    const filtered = filteredRequests();
    const pageSize = Math.max(5, Number(state.prefs.pageSize) || 10);
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (state.filters.page > pages) state.filters.page = pages;
    const start = (state.filters.page - 1) * pageSize;
    const page = filtered.slice(start, start + pageSize);
    const summary = requestRegistrySummary(filtered);
    const activeFilters = requestActiveFilters();
    const pendingTotal = state.requests.filter(r=>["Submitted","Under Review"].includes(r.status)).length;

    els.content.innerHTML = `
      ${storageBanner()}
      <div class="page-head requests-page-head">
        <div>
          <h2>Request workbench</h2>
          <p>Search, triage, inspect, export, and move through the operational request lifecycle from a single registry.</p>
        </div>
        <div class="page-actions">
          <button class="button secondary" type="button" data-action="requests-refresh">↻ Refresh</button>
          <button class="button primary" type="button" data-route-shortcut="new">＋ New request</button>
        </div>
      </div>

      <section class="request-registry-summary" aria-label="Request registry summary">
        ${registrySummaryCard("Matching requests",String(summary.count),`${state.requests.length} total persisted`,"≡")}
        ${registrySummaryCard("Under review",String(summary.inReview),summary.inReview?"Actively being reviewed":"No active reviews","◉")}
        ${registrySummaryCard("Pending review",String(summary.pending),pendingTotal?`${pendingTotal} pending across all requests`:"No pending approvals","⌛")}
        ${registrySummaryCard("Completed",String(summary.completed),summary.completed?"Completed requests in current view":"No completed requests","✓")}
      </section>

      <section class="request-quick-status" aria-label="Quick lifecycle filters">
        ${quickRequestStatusButton("","All",state.requests.length)}
        ${quickRequestStatusButton("Submitted","Submitted",countStatus("Submitted"))}
        ${quickRequestStatusButton("Under Review","Under Review",countStatus("Under Review"))}
        ${quickRequestStatusButton("Approved","Approved",countStatus("Approved"))}
        ${quickRequestStatusButton("Issued","Issued",countStatus("Issued"))}
        ${quickRequestStatusButton("Completed","Completed",countStatus("Completed"))}
      </section>

      <section class="request-filter-panel panel" aria-label="Request filters">
        <div class="request-filter-primary">
          <label class="search-box request-search-box">
            <span aria-hidden="true">⌕</span>
            <input id="requestSearch" type="search" value="${escapeAttr(state.filters.search)}" placeholder="Search ID, owner, plate, container, route, fuel…" />
          </label>
          ${selectHtml("requestStatus",["",...STATUSES],state.filters.status,"All statuses")}
          ${selectHtml("requestDepartment",["",...uniqueValues("department")],state.filters.department,"All departments")}
          
        </div>
        <div class="request-filter-secondary">
          <select id="requestRefuelType" class="select" aria-label="Filter by refuel type">
            <option value="" ${!state.filters.refuelType?"selected":""}>All refuel types</option>
            <option value="vehicle" ${state.filters.refuelType==="vehicle"?"selected":""}>Vehicle Fuel</option>
            <option value="container" ${state.filters.refuelType==="container"?"selected":""}>Container Refill</option>
            <option value="legacy" ${state.filters.refuelType==="legacy"?"selected":""}>Legacy requests</option>
          </select>
          ${selectHtml("requestPriority",["",...PRIORITIES],state.filters.priority,"All priorities")}
          ${selectHtml("requestLocation",["",...requestLocationValues()],state.filters.location,"All locations")}
          <select id="requestSort" class="select" aria-label="Sort requests">
            <option value="newest" ${state.filters.sort==="newest"?"selected":""}>Newest first</option>
            <option value="oldest" ${state.filters.sort==="oldest"?"selected":""}>Oldest first</option>
            <option value="updated" ${state.filters.sort==="updated"?"selected":""}>Recently updated</option>
            
            <option value="priority" ${state.filters.sort==="priority"?"selected":""}>Priority</option>
          </select>
          <select id="requestPageSize" class="select request-page-size" aria-label="Rows per page">
            ${[10,20,50].map(size=>`<option value="${size}" ${pageSize===size?"selected":""}>${size} rows</option>`).join("")}
          </select>
          <button class="button ghost" type="button" data-action="reset-filters" ${activeFilters.length?"":"disabled"}>Clear filters</button>
        </div>
        ${activeFilters.length ? `<div class="request-active-filters" aria-label="Active filters">
          <span class="request-active-label">Active filters</span>
          ${activeFilters.map(f=>`<button class="request-filter-chip" type="button" data-clear-request-filter="${escapeAttr(f.key)}">${escapeHtml(f.label)} <span aria-hidden="true">×</span></button>`).join("")}
        </div>` : ""}
      </section>

      <article class="panel table-panel requests-table-panel">
        <div class="table-head">
          <div>
            <h3>Fuel requests</h3>
            <p>${filtered.length} matching record${filtered.length===1?"":"s"} · lifecycle and ownership context</p>
          </div>
          <div class="request-table-head-actions">
            ${pendingTotal ? `<button class="button secondary small" type="button" data-route-shortcut="approvals">Review pending (${pendingTotal})</button>` : ""}
            <button class="button ghost small" type="button" data-action="export" ${filtered.length?"":"disabled"}>⇩ Export PDF</button>
          </div>
        </div>
        ${page.length ? requestWorkbenchTable(page) : emptyState("No matching requests","Adjust or clear the current filters, or create a new fuel request.")}
        <div class="pagination">
          <span>Showing ${filtered.length ? start+1 : 0}–${Math.min(start+pageSize,filtered.length)} of ${filtered.length}</span>
          <div class="pagination-controls">
            <button class="button secondary small" type="button" data-page="1" ${state.filters.page<=1?"disabled":""}>First</button>
            <button class="button secondary small" type="button" data-page="${Math.max(1,state.filters.page-1)}" ${state.filters.page<=1?"disabled":""}>Previous</button>
            <span class="request-page-indicator">Page ${state.filters.page} of ${pages}</span>
            <button class="button secondary small" type="button" data-page="${Math.min(pages,state.filters.page+1)}" ${state.filters.page>=pages?"disabled":""}>Next</button>
            <button class="button secondary small" type="button" data-page="${pages}" ${state.filters.page>=pages?"disabled":""}>Last</button>
          </div>
        </div>
      </article>
    `;

    bindRouteShortcuts();
    bindRequestFilters();
    bindTableActions();

    els.content.querySelector('[data-action="reset-filters"]')?.addEventListener("click", resetRequestFilters);
    els.content.querySelector('[data-action="requests-refresh"]')?.addEventListener("click",()=>requestAppRefresh({source:"manual",force:true,showLoading:true}));
    els.content.querySelector('[data-action="export"]')?.addEventListener("click", () => exportRequestsPdf(filtered,{title:"FuelTrack+ All Requests",subtitle:"Filtered request register"}));

    els.content.querySelectorAll("[data-page]").forEach(btn=>btn.addEventListener("click",()=>{
      state.filters.page=Number(btn.dataset.page);
      renderRequests();
    }));
    els.content.querySelectorAll("[data-request-quick-status]").forEach(btn=>btn.addEventListener("click",()=>{
      state.filters.status=btn.dataset.requestQuickStatus;
      state.filters.page=1;
      renderRequests();
    }));
    els.content.querySelectorAll("[data-clear-request-filter]").forEach(btn=>btn.addEventListener("click",()=>{
      clearSingleRequestFilter(btn.dataset.clearRequestFilter);
    }));
    els.content.querySelectorAll("[data-copy-request]").forEach(btn=>btn.addEventListener("click",()=>copyRequestId(btn.dataset.copyRequest)));
    els.content.querySelectorAll("[data-delete-request]").forEach(btn=>btn.addEventListener("click",()=>requestDeleteRequest(btn.dataset.deleteRequest)));
    els.content.querySelectorAll("[data-request-context-route]").forEach(btn=>btn.addEventListener("click",()=>routeTo(btn.dataset.requestContextRoute)));
  }

  function renderNewRequest() {
    const containerIds = CONTAINER_DIRECTORY;
    const plateOptions = VEHICLE_DIRECTORY.map(v => v.plateNumber);
    const ownerOptions = VEHICLE_DIRECTORY.map(v => v.vehicleOwner);
    els.content.innerHTML = `
      ${storageBanner()}
      <div class="page-head request-page-head">
        <div>
          <div class="request-title-line"><span class="request-title-icon" aria-hidden="true">↗</span><div><h2>Build a fuel request</h2><p>Create a validated request using the registered vehicle directory or a container-based refill path.</p></div></div>
        </div>
        <div class="request-directory-chip"><strong>${VEHICLE_DIRECTORY.length}</strong><span>registered vehicles</span></div>
      </div>

      <form id="requestForm" class="request-composer" novalidate>
        <div class="request-composer-main">
          <section class="request-mode-panel" aria-labelledby="refuelTypeHeading">
            <div class="request-mode-copy"><span class="section-label">REQUEST MODE</span><h3 id="refuelTypeHeading">How will the fuel be received?</h3><p>The form adapts to the selected operational path without changing the downstream approval lifecycle.</p></div>
            <div class="request-mode-switch" role="radiogroup" aria-label="Refuel type">
              <button class="request-mode-option active" type="button" role="radio" aria-checked="true" data-refuel-type="vehicle">
                <span class="request-mode-symbol" aria-hidden="true">◉</span><span><strong>Vehicle Fuel</strong><small>Registered fleet vehicle</small></span><span class="mode-check">✓</span>
              </button>
              <button class="request-mode-option" type="button" role="radio" aria-checked="false" data-refuel-type="container">
                <span class="request-mode-symbol" aria-hidden="true">◇</span><span><strong>Container Refill</strong><small>Drum, canister, or tank</small></span><span class="mode-check">✓</span>
              </button>
            </div>
            <input id="refuelType" type="hidden" value="vehicle" />
          </section>

          <section id="vehicleDetailsSection" class="composer-section">
            <div class="composer-section-head"><span class="composer-step">01</span><div><h3>Vehicle assignment</h3><p>Select either field and FuelTrack+ will resolve the registered plate-owner pair automatically.</p></div><span class="composer-state" id="vehicleLinkState">Awaiting selection</span></div>
            <div class="composer-grid">
              ${studioSelectField("plateNumber","Plate Number",plateOptions,"Choose a registered plate",true,"⌁")}
              ${studioSelectField("vehicleOwner","Vehicle Owner",ownerOptions,"Choose a vehicle owner",true,"♙")}
              ${studioNumberField("odometer","Odometer Reading","Current mileage in kilometers",false,"◔",0,999999999)}
              <div class="vehicle-link-card" id="vehicleLinkCard" aria-live="polite">
                <span class="vehicle-link-mark">↔</span><div><small>REGISTERED RELATIONSHIP</small><strong id="vehicleLinkTitle">No vehicle selected</strong><p id="vehicleLinkCopy">Plate and owner remain synchronized to prevent mismatched requests.</p></div>
              </div>
            </div>
          </section>

          <section id="containerDetailsSection" class="composer-section" hidden>
            <div class="composer-section-head"><span class="composer-step">01</span><div><h3>Container assignment</h3><p>Identify the receiving container and responsible custodian.</p></div></div>
            <div class="composer-grid">
              ${studioSelectField("containerId","Container ID / Label",containerIds,"Choose a registered container",true,"◇")}
              ${studioSelectField("containerOwner","Custodian / Owner",ownerOptions,"Choose a custodian / owner",true,"♙")}
              ${referenceTextField("containerType","Container Type","Drum, canister, tank, etc.",true,"▣")}
            </div>
          </section>

          <section id="routeDetailsSection" class="composer-section">
            <div class="composer-section-head"><span class="composer-step">02</span><div><h3>Trip route</h3><p>Capture route context for operational review and consumption analysis.</p></div></div>
            <div class="route-field-grid">
              ${referenceTextField("origin","Origin","Starting location",true,"⌖")}
              <div class="route-connector" aria-hidden="true"><span>→</span></div>
              ${referenceTextField("destination","Destination","Ending location",true,"⌁")}
              ${studioNumberField("distanceKm","Distance","Kilometers",false,"↔",0,100000)}
            </div>
          </section>

          <section class="composer-section justification-composer-section">
            <div class="composer-section-head"><span class="composer-step" id="purposeStepNumber">03</span><div><h3>Purpose & evidence</h3><p>Give reviewers enough context to understand why the request is necessary.</p></div></div>
            <div class="purpose-studio">
              <label class="reference-field full">
                <span class="reference-label">Purpose <b aria-hidden="true">*</b></span>
                <textarea id="purposeText" class="reference-textarea purpose-studio-textarea" maxlength="500" placeholder="Describe the operational purpose, destination context, or reason for this fuel request..."></textarea>
                <div class="purpose-feedback"><small id="purposeRequirement" class="purpose-required">10 more characters required</small><small id="purposeCounter">0/500</small></div>
                <small class="field-error" data-error-for="purposeText"></small>
              </label>
              <div class="purpose-progress-card"><div id="purposeGauge" class="purpose-gauge" aria-label="Purpose completion" style="--purpose-progress:0"><strong>0</strong></div><div><strong>Purpose quality gate</strong><small>Minimum 10 characters before submission.</small></div></div>
            </div>

            <div class="evidence-dropzone">
              <div class="evidence-copy"><span class="evidence-icon" aria-hidden="true">▣</span><div><strong>Receipt or supporting photo</strong><small>Optional · image files up to 8 MB before compression</small></div></div>
              <label class="button secondary evidence-button" for="receiptPhoto"><span id="receiptLabel">Add photo</span></label>
              <input id="receiptPhoto" class="visually-hidden" type="file" accept="image/*" capture="environment" />
            </div>
            <div id="receiptPreview" class="receipt-preview" hidden></div>
            <small class="field-error" data-error-for="receiptPhoto"></small>
          </section>
        </div>

        <aside class="request-review-panel" aria-label="Request review">
          <div class="review-panel-head"><span class="section-label">LIVE REVIEW</span><h3>Request readiness</h3><p>FuelTrack+ checks the form before it enters the approval queue.</p></div>
          <div class="review-summary-card">
            <div class="review-summary-row"><span>Mode</span><strong id="reviewMode">Vehicle Fuel</strong></div>
            <div class="review-summary-row"><span>Asset</span><strong id="reviewAsset">Not selected</strong></div>
            <div class="review-summary-row"><span>Owner</span><strong id="reviewOwner">Not selected</strong></div>
            <div class="review-summary-row" id="reviewRouteRow"><span>Route</span><strong id="reviewRoute">Not provided</strong></div>
          </div>
          <div class="readiness-list" id="requestReadinessList">
            <div class="readiness-item pending"><span>○</span><div><strong>Vehicle assignment</strong><small>Select a registered plate and owner.</small></div></div>
            <div class="readiness-item pending"><span>○</span><div><strong>Trip route</strong><small>Origin and destination are required.</small></div></div>
            <div class="readiness-item pending"><span>○</span><div><strong>Justification</strong><small>At least 10 characters are required.</small></div></div>
          </div>
          <div class="review-actions">
            <button class="button secondary review-draft-button" type="button" id="saveDraftBtn">Save Draft</button>
            <button class="review-submit-button" type="submit"><span aria-hidden="true">↗</span><span>Submit for Approval</span></button>
          </div>
          <p class="review-footnote">Submission creates a persisted <strong>Submitted</strong> request and sends it to the existing approval workflow.</p>
        </aside>
      </form>
    `;
    bindNewRequestForm();
  }

  function renderApprovals() {
    if (state.dataStatus === "loading") {
      els.content.innerHTML = `${storageBanner()}${approvalsLoadingState()}`;
      return;
    }

    const allPending = state.requests.filter(r => ["Submitted","Under Review"].includes(r.status));
    const pending = filteredApprovalQueue(allPending);
    const summary = approvalQueueSummary(allPending);
    const selectedFilters = Object.values(state.approvalFilters).filter((value,key)=>key!=="sort" && Boolean(value)).length;

    els.content.innerHTML = `
      ${storageBanner()}
      <div class="page-head approvals-page-head">
        <div>
          <h2>Approval operations</h2>
          <p>Triage incoming requests, explicitly start reviews, capture decision context, and move requests through the approval lifecycle with an auditable workflow.</p>
        </div>
        <div class="page-actions">
          <button class="button secondary" type="button" data-action="approvals-refresh">↻ Refresh</button>
          ${hasPermission("approval.export")?`<button class="button secondary" type="button" data-action="approvals-export" ${pending.length?"":"disabled"}>⇩ Export PDF</button>`:""}
        </div>
      </div>

      <section class="approval-kpi-grid" aria-label="Approval workload summary">
        ${approvalKpi("Awaiting decision",String(summary.total),`${summary.submitted} submitted · ${summary.inReview} under review`,"⌛")}
        ${approvalKpi("Under review",String(summary.inReview),summary.inReview?"Decision-ready requests":"No active reviews","◉")}
        ${approvalKpi("High priority",String(summary.highPriority),summary.highPriority?"Requires prioritization":"No high-priority queue items","!")}
        ${approvalKpi("Oldest waiting",summary.oldest?approvalAgeLabel(summary.oldest):"—",summary.oldest?escapeHtml(summary.oldest.id):"Queue is clear","↥")}
      </section>

      <section class="panel approval-toolbar" aria-label="Approval queue controls">
        <label class="search-box approval-search">
          <span aria-hidden="true">⌕</span>
          <input id="approvalSearch" type="search" value="${escapeAttr(state.approvalFilters.search)}" placeholder="Search request ID, owner, asset, route…" />
        </label>
        <select id="approvalStage" class="select" aria-label="Filter approval stage">
          <option value="" ${!state.approvalFilters.stage?"selected":""}>All queue stages</option>
          <option value="Submitted" ${state.approvalFilters.stage==="Submitted"?"selected":""}>Submitted</option>
          <option value="Under Review" ${state.approvalFilters.stage==="Under Review"?"selected":""}>Under Review</option>
        </select>
        <select id="approvalRefuelType" class="select" aria-label="Filter refuel type">
          <option value="" ${!state.approvalFilters.refuelType?"selected":""}>All refuel types</option>
          <option value="vehicle" ${state.approvalFilters.refuelType==="vehicle"?"selected":""}>Vehicle Fuel</option>
          <option value="container" ${state.approvalFilters.refuelType==="container"?"selected":""}>Container Refill</option>
          <option value="legacy" ${state.approvalFilters.refuelType==="legacy"?"selected":""}>Legacy</option>
        </select>
        ${selectHtml("approvalPriority",["",...PRIORITIES],state.approvalFilters.priority,"All priorities")}
        <select id="approvalSort" class="select" aria-label="Sort approval queue">
          <option value="oldest" ${state.approvalFilters.sort==="oldest"?"selected":""}>Oldest waiting</option>
          <option value="priority" ${state.approvalFilters.sort==="priority"?"selected":""}>Priority first</option>
          <option value="newest" ${state.approvalFilters.sort==="newest"?"selected":""}>Newest first</option>
          <option value="updated" ${state.approvalFilters.sort==="updated"?"selected":""}>Recently updated</option>
        </select>
        <button class="button ghost approval-reset" type="button" data-action="approvals-reset" ${selectedFilters?"":"disabled"}>Clear filters${selectedFilters?` (${selectedFilters})`:""}</button>
      </section>

      <div class="approval-context-line">
        <span><strong>${pending.length}</strong> matching queue item${pending.length===1?"":"s"}</span>
        <span>${summary.total} total awaiting decision</span>
        ${state.loadedAt ? `<span>Refreshed ${escapeHtml(relativeTime(state.loadedAt))}</span>` : ""}
      </div>

      <article class="panel approval-workbench-panel">
        <div class="panel-head">
          <div>
            <h3>Decision queue</h3>
            <p>Submitted requests must enter review before a final approval or rejection can be recorded.</p>
          </div>
          ${summary.inReview ? `<span class="status-pill status-review">${summary.inReview} decision-ready</span>` : ""}
        </div>
        ${pending.length ? `<div class="approval-list approval-workbench-list">${pending.map(approvalCard).join("")}</div>` : emptyState(
          allPending.length ? "No requests match these filters" : "Approval queue is clear",
          allPending.length ? "Adjust or clear the current approval filters." : "There are currently no submitted or under-review requests awaiting a decision."
        )}
      </article>
    `;

    bindApprovalControls();
  }

  function renderLightFuels() {
    if (state.dataStatus === "loading") {
      els.content.innerHTML = `${storageBanner()}${lightFuelsLoadingState()}`;
      return;
    }

    const inventory = filteredLightFuelInventory();
    const approved = state.requests
      .filter(r=>r.status==="Approved")
      .sort((a,b)=>new Date(a.updatedAt||a.createdAt)-new Date(b.updatedAt||b.createdAt));
    const visibleRequests = state.lightFuelFilters.requestView==="all" ? approved : approved.filter(r=>{
      if(state.lightFuelFilters.requestView==="vehicle") return r.refuelType==="vehicle";
      if(state.lightFuelFilters.requestView==="container") return r.refuelType==="container";
      return true;
    });
    const summary = lightFuelSummary(state.inventory);
    const activeInventoryFilters = ["search","fuelType","location","health"].filter(key=>Boolean(state.lightFuelFilters[key])).length;

    els.content.innerHTML = `
      ${storageBanner()}
      <div class="page-head lightfuels-page-head">
        <div>
          <h2>LightFuels operations</h2>
          <p>Monitor persisted inventory and complete approved-request fulfillment. The current request model does not carry Fuel Type or Requested Quantity, so request issuance no longer performs quantity-based inventory matching or stock deductions.</p>
        </div>
        <div class="page-actions">
          <button class="button secondary" type="button" data-action="lightfuels-refresh">↻ Refresh</button>
          ${hasPermission("lightfuels.export")?`${hasPermission("lightfuels.export")?`<button class="button secondary" type="button" data-action="lightfuels-export" ${state.inventory.length?"":"disabled"}>⇩ Export PDF</button>`:""}`:""}
        </div>
      </div>

      <section class="lightfuels-kpi-grid" aria-label="Inventory summary">
        ${lightFuelKpi("Inventory records",String(summary.records),summary.records?`${summary.fuelTypes} inventory fuel type${summary.fuelTypes===1?"":"s"}`:"No persisted inventory","▦")}
        ${lightFuelKpi("Available stock",summary.records?formatLiters(summary.level):"—",summary.capacity?`${Math.round(summary.level/summary.capacity*100)}% combined utilization`:"Capacity unavailable","◒")}
        ${lightFuelKpi("Low stock",String(summary.lowStock),summary.lowStock?"At or below reorder threshold":"No reorder alerts","!")}
        ${lightFuelKpi("Approved requests",String(approved.length),approved.length?"Awaiting fulfillment transition":"Nothing awaiting fulfillment","↗")}
      </section>

      <section class="panel lightfuels-inventory-panel">
        <div class="panel-head">
          <div><h3>Inventory health</h3><p>Inventory records remain independent from request Fuel Type and Requested Quantity.</p></div>
          ${state.inventory.length ? `<span class="status-pill ${summary.lowStock?"status-review":"status-approved"}">${summary.lowStock?`${summary.lowStock} attention required`:"Inventory healthy"}</span>` : ""}
        </div>

        <div class="lightfuels-toolbar">
          <label class="search-box lightfuels-search"><span aria-hidden="true">⌕</span><input id="lightFuelSearch" type="search" value="${escapeAttr(state.lightFuelFilters.search)}" placeholder="Search storage, inventory fuel type, location…" /></label>
          ${selectHtml("lightFuelType",["",...inventoryDimensionValues("fuelType")],state.lightFuelFilters.fuelType,"All inventory fuel types")}
          ${selectHtml("lightFuelLocation",["",...inventoryDimensionValues("location")],state.lightFuelFilters.location,"All locations")}
          <select id="lightFuelHealth" class="select" aria-label="Filter inventory health">
            <option value="" ${!state.lightFuelFilters.health?"selected":""}>All stock health</option>
            <option value="healthy" ${state.lightFuelFilters.health==="healthy"?"selected":""}>Healthy</option>
            <option value="low" ${state.lightFuelFilters.health==="low"?"selected":""}>Low / reorder</option>
          </select>
          <button class="button ghost" type="button" data-action="lightfuels-reset" ${activeInventoryFilters?"":"disabled"}>Clear filters${activeInventoryFilters?` (${activeInventoryFilters})`:""}</button>
        </div>

        ${state.inventory.length
          ? inventory.length
            ? `<div class="lightfuel-grid lightfuel-operations-grid">${inventory.map(tankCard).join("")}</div>`
            : emptyState("No inventory matches these filters","Adjust or clear the current LightFuels inventory filters.")
          : emptyState("Inventory data unavailable","No persisted inventory records are currently available.")}
      </section>

      <section class="panel lightfuels-issuance-panel">
        <div class="panel-head lightfuels-issuance-head">
          <div><h3>Approved request fulfillment</h3><p>Complete approved requests only after final refueling details have been recorded and validated.</p></div>
          <div class="segmented lightfuels-request-segments" id="lightFuelRequestSegments">
            <button type="button" data-request-view="all" class="${state.lightFuelFilters.requestView==="all"?"active":""}">All ${approved.length}</button>
            <button type="button" data-request-view="vehicle" class="${state.lightFuelFilters.requestView==="vehicle"?"active":""}">Vehicle ${approved.filter(r=>r.refuelType==="vehicle").length}</button>
            <button type="button" data-request-view="container" class="${state.lightFuelFilters.requestView==="container"?"active":""}">Container ${approved.filter(r=>r.refuelType==="container").length}</button>
          </div>
        </div>

        ${visibleRequests.length
          ? `<div class="lightfuels-readiness-list">${visibleRequests.map(lightFuelFulfillmentCard).join("")}</div>`
          : emptyState(approved.length?"No requests in this view":"Nothing awaiting fulfillment",approved.length?"Choose another request-type filter.":"Approved requests will appear here for fulfillment.")}
      </section>
    `;

    bindLightFuelControls();
  }

  function renderActivity(options={}) {
    const preserveScroll=Boolean(options.preserveScroll);
    const previousScrollY=preserveScroll?window.scrollY:null;
    if(!hasPermission("activity.view.any")) {
      els.content.innerHTML = accessDeniedState("Activity","Activity is restricted to Admin users.");
      return;
    }
    if (state.dataStatus === "loading") {
      els.content.innerHTML = `${storageBanner()}${activityLoadingState()}`;
      return;
    }

    const filtered = filteredActivityItems();
    const visible = filtered.slice(0,state.activityVisibleCount);
    const grouped = groupActivityByDate(visible);
    const actorOptions = activityActorValues();
    const activeFilterCount = [
      state.activityFilters.search,
      state.activityFilters.type !== "all" ? state.activityFilters.type : "",
      state.activityFilters.actor,
      state.activityFilters.period !== "all" ? state.activityFilters.period : "",
      state.activityFilters.linkage !== "all" ? state.activityFilters.linkage : ""
    ].filter(Boolean).length;
    const syncLabel=state.activitySyncStatus==="refreshing"?"Refreshing…":state.activitySyncStatus==="error"?"Refresh needed":"Up to date";
    const syncClass=state.activitySyncStatus==="error"?"error":state.activitySyncStatus==="refreshing"?"working":"current";
    const lastRefresh=state.activityLastRefreshAt||state.loadedAt;

    els.content.innerHTML = `
      ${storageBanner()}
      ${state.activityError ? `<div class="data-banner error activity-recovery-banner" role="alert"><strong>Activity stream is temporarily unavailable.</strong><span>${escapeHtml(state.activityError)} Existing operational data remains available; retry the audit stream without reloading the application.</span><button class="button secondary" type="button" data-action="activity-retry">Retry Activity</button></div>` : ""}
      <div class="page-head activity-page-head">
        <div>
          <h2>Activity workspace</h2>
          <p>Find, inspect, trace, and navigate operational events without altering the underlying audit history.</p>
        </div>
        <div class="page-actions">
          <span class="activity-sync-status ${syncClass}" role="status" aria-live="polite"><i aria-hidden="true"></i>${escapeHtml(syncLabel)}</span>
          <button id="activityRefresh" class="button secondary" type="button" data-action="activity-refresh" ${state.activitySyncStatus==="refreshing"?"disabled aria-busy=\"true\"":""}>↻ Refresh</button>
          ${hasPermission("activity.export")?`${hasPermission("activity.export")?`<button id="activityExport" class="button secondary" type="button" data-action="activity-export" ${filtered.length?"":"disabled"}>⇩ Export PDF</button>`:""}`:""}
        </div>
      </div>

      <section class="panel activity-toolbar" aria-label="Activity controls">
        <label class="search-box activity-search">
          <span aria-hidden="true">⌕</span>
          <input id="activitySearch" type="search" value="${escapeAttr(state.activityFilters.search)}" placeholder="Search event, request ID, actor, or message…" aria-label="Search activity events" aria-controls="activityStream" autocomplete="off" />
        </label>
        <select id="activityType" class="select" aria-label="Filter activity type" aria-controls="activityStream">
          ${[["all","All event types"],["submit","Requests"],["review","Reviews"],["issue","Issuance"],["system","System"]].map(([value,label])=>`<option value="${value}" ${state.activityFilters.type===value?"selected":""}>${label}</option>`).join("")}
        </select>
        <select id="activityActor" class="select" aria-label="Filter actor" aria-controls="activityStream">
          <option value="" ${!state.activityFilters.actor?"selected":""}>All actors</option>
          ${actorOptions.map(actor=>`<option value="${escapeAttr(actor.value)}" ${activityActorFilterMatchesSelection(actor.value)?"selected":""}>${escapeHtml(actor.label)}</option>`).join("")}
        </select>
        <select id="activityPeriod" class="select" aria-label="Filter time period" aria-controls="activityStream">
          <option value="all" ${state.activityFilters.period==="all"?"selected":""}>All time</option>
          <option value="today" ${state.activityFilters.period==="today"?"selected":""}>Today</option>
          <option value="7d" ${state.activityFilters.period==="7d"?"selected":""}>Last 7 days</option>
          <option value="30d" ${state.activityFilters.period==="30d"?"selected":""}>Last 30 days</option>
        </select>
        <select id="activityLinkage" class="select" aria-label="Filter request linkage" aria-controls="activityStream">
          <option value="all" ${state.activityFilters.linkage==="all"?"selected":""}>All linkage</option>
          <option value="linked" ${state.activityFilters.linkage==="linked"?"selected":""}>Linked to request</option>
          <option value="unlinked" ${state.activityFilters.linkage==="unlinked"?"selected":""}>No request link</option>
        </select>
        <select id="activitySort" class="select" aria-label="Sort activity" aria-controls="activityStream">
          <option value="newest" ${state.activityFilters.sort==="newest"?"selected":""}>Newest first</option>
          <option value="oldest" ${state.activityFilters.sort==="oldest"?"selected":""}>Oldest first</option>
        </select>
        <button id="activityClear" class="button ghost activity-clear" type="button" data-action="activity-clear" ${activeFilterCount?"":"disabled"}>Clear filters${activeFilterCount?` (${activeFilterCount})`:""}</button>
      </section>

      <div id="activityContextLine" class="activity-context-line" role="status" aria-live="polite" aria-atomic="true">
        <span>Showing <strong>${Math.min(visible.length,filtered.length)}</strong> of ${filtered.length} matching event${filtered.length===1?"":"s"}</span>
        <span>Append-only shared audit stream · server-authored identity and timestamps</span>
        ${lastRefresh?`<span>Refreshed ${escapeHtml(relativeTime(lastRefresh))}</span>`:""}
      </div>

      <section id="activityStream" class="activity-stream" aria-label="Activity timeline" aria-busy="${state.activitySyncStatus==="refreshing"?"true":"false"}">
        ${filtered.length
          ? grouped.map(group=>activityDateGroup(group)).join("")
          : activeFilterCount
            ? emptyState("No activity matches these filters","Adjust or clear the current filters. Activity events are preserved and are not deleted by filtering.")
            : emptyState("No activity recorded yet","Operational events will appear here as authorized workflows are completed.")}
      </section>

      <div id="activityLoadMore" class="activity-load-more" ${(filtered.length > visible.length || globalThis.WMModuleActivity?.hasMore) ? "" : "hidden"}>${(filtered.length > visible.length || globalThis.WMModuleActivity?.hasMore) ? `<button class="button secondary" type="button" data-action="activity-load-more">${filtered.length > visible.length ? `Load ${Math.min(30,filtered.length-visible.length)} more` : "Load older events"}</button>` : ""}</div>
    `;

    bindActivityControls();
    if(preserveScroll && Number.isFinite(previousScrollY)) requestAnimationFrame(()=>window.scrollTo({top:previousScrollY,behavior:"auto"}));
  }

  function activityViewModel() {
    const filtered = filteredActivityItems();
    const visible = filtered.slice(0,state.activityVisibleCount);
    const grouped = groupActivityByDate(visible);
    const activeFilterCount = [
      state.activityFilters.search,
      state.activityFilters.type !== "all" ? state.activityFilters.type : "",
      state.activityFilters.actor,
      state.activityFilters.period !== "all" ? state.activityFilters.period : "",
      state.activityFilters.linkage !== "all" ? state.activityFilters.linkage : ""
    ].filter(Boolean).length;
    return { filtered, visible, grouped, activeFilterCount };
  }

  function updateActivityActorOptions() {
    const select = $("activityActor");
    if (!select) return;
    const current = state.activityFilters.actor;
    const actors=activityActorValues();
    const markup = ['<option value="">All actors</option>', ...actors.map(actor=>`<option value="${escapeAttr(actor.value)}">${escapeHtml(actor.label)}</option>`)].join("");
    if (select.innerHTML !== markup) select.innerHTML = markup;
    if(actors.some(actor=>actor.value===current)) select.value=current;
    else {
      const legacy=actors.find(actor=>actor.value.startsWith("name:")&&actor.value.slice(5)===String(current||"").toLowerCase());
      select.value=legacy?.value||"";
      if(legacy && current!==legacy.value){state.activityFilters.actor=legacy.value;queueActivityFilterPersistence();}
    }
  }

  function updateActivityResults({ refreshActors = false } = {}) {
    if (state.route !== "activity") return;
    const stream = $("activityStream");
    const context = $("activityContextLine");
    const loadMore = $("activityLoadMore");
    if (!stream || !context || !loadMore) return renderActivity({ preserveScroll:true });
    const { filtered, visible, grouped, activeFilterCount } = activityViewModel();
    const lastRefresh=state.activityLastRefreshAt||state.loadedAt;
    stream.setAttribute("aria-busy",state.activitySyncStatus==="refreshing"?"true":"false");
    context.innerHTML = `
      <span>Showing <strong>${Math.min(visible.length,filtered.length)}</strong> of ${filtered.length} matching event${filtered.length===1?"":"s"}</span>
      <span>Append-only shared audit stream · server-authored identity and timestamps</span>
      ${lastRefresh?`<span>Refreshed ${escapeHtml(relativeTime(lastRefresh))}</span>`:""}`;
    stream.innerHTML = filtered.length
      ? grouped.map(group=>activityDateGroup(group)).join("")
      : activeFilterCount
        ? emptyState("No activity matches these filters","Adjust or clear the current filters. Activity events are preserved and are not deleted by filtering.")
        : emptyState("No activity recorded yet","Operational events will appear here as authorized workflows are completed.");
    const hasMore = filtered.length > visible.length || Boolean(globalThis.WMModuleActivity?.hasMore);
    loadMore.hidden = !hasMore;
    loadMore.innerHTML = hasMore
      ? `<button class="button secondary" type="button" data-action="activity-load-more">${filtered.length > visible.length ? `Load ${Math.min(30,filtered.length-visible.length)} more` : "Load older events"}</button>`
      : "";
    const clear = $("activityClear");
    if (clear) {
      clear.disabled = !activeFilterCount;
      clear.textContent = `Clear filters${activeFilterCount?` (${activeFilterCount})`:""}`;
    }
    const exportButton = $("activityExport");
    if (exportButton) exportButton.disabled = !filtered.length;
    const refreshButton = $("activityRefresh");
    if(refreshButton){
      const refreshing=state.activitySyncStatus==="refreshing";
      refreshButton.disabled=refreshing;
      refreshButton.toggleAttribute("aria-busy",refreshing);
      refreshButton.textContent=refreshing?"Refreshing…":"↻ Refresh";
    }
    const sync = els.content.querySelector('.activity-sync-status');
    if (sync) {
      const label=state.activitySyncStatus==="refreshing"?"Refreshing…":state.activitySyncStatus==="error"?"Refresh needed":"Up to date";
      sync.className=`activity-sync-status ${state.activitySyncStatus==="error"?"error":state.activitySyncStatus==="refreshing"?"working":"current"}`;
      sync.innerHTML=`<i aria-hidden="true"></i>${escapeHtml(label)}`;
    }
    if (refreshActors) updateActivityActorOptions();
  }

  async function handleActivityResultClick(event) {
    const requestButton=event.target.closest("[data-activity-request]");
    if(requestButton){showRequestDetail(requestButton.dataset.activityRequest);return;}
    const detailButton=event.target.closest("[data-activity-detail]");
    if(detailButton){showActivityDetail(detailButton.dataset.activityDetail);return;}
    const copyButton=event.target.closest("[data-copy-activity]");
    if(copyButton){await copyActivityEvent(copyButton.dataset.copyActivity);return;}
  }

  async function handleActivityLoadMore(event) {
    const button=event.target.closest('[data-action="activity-load-more"]');
    if(!button||button.disabled) return;
    button.disabled=true;button.setAttribute("aria-busy","true");
    const original=button.textContent;button.textContent="Loading…";
    try {
      if (filteredActivityItems().length > state.activityVisibleCount) state.activityVisibleCount+=30;
      else if (globalThis.WMModuleActivity?.hasMore) {
        await globalThis.WMModuleActivity.loadOlder?.();
        state.activity=[...(globalThis.WMModuleActivity?.items||[])];
      }
      updateActivityResults({refreshActors:true});
    } catch(error) {
      toast("Older activity unavailable",error?.message||"Older audit events could not be loaded.","error");
      button.disabled=false;button.removeAttribute("aria-busy");button.textContent=original;
    }
  }

  function renderRoles(){
    if(!hasPermission("roles.view")){els.content.innerHTML=accessDeniedState("Role Management","Role Management is restricted to Admin users.");return;}
    state.userRoles=cloudRoleDirectory(); ensureAuthenticatedRoleRecord();
    const users=filteredManagedUsers(),active=CLOUD_IDENTITY?.user?.id;
    els.content.innerHTML=`${storageBanner()}<div class="page-head roles-page-head"><div><h2>Role Management</h2><p>Review the Supabase-backed account directory and effective FuelTrack+ roles. Changes are managed centrally in Work Management Users.</p></div><div class="page-actions"><button class="button secondary" type="button" data-action="roles-refresh">↻ Refresh access</button></div></div><section class="panel roles-toolbar"><label class="search-box"><span>⌕</span><input id="roleSearch" type="search" value="${escapeAttr(state.roleFilters.search)}" placeholder="Search account, email, or role…" /></label><select id="roleFilter" class="select"><option value="all">All roles</option>${Object.values(ROLES).map(r=>`<option value="${escapeAttr(r)}" ${state.roleFilters.role===r?"selected":""}>${escapeHtml(r)}</option>`).join("")}</select><button class="button ghost" data-action="roles-clear" ${state.roleFilters.search||state.roleFilters.role!=="all"?"":"disabled"}>Clear filters</button></section><section class="panel"><div class="panel-head"><div><h3>Cloud account roles</h3><p>Server-enforced Work Management identity is authoritative. Module-local role state cannot override it.</p></div><span class="roles-scope-note">Read-only directory</span></div>${users.length?`<div class="roles-list">${users.map(x=>`<article class="role-user-row ${x.cloudUserId===active?"active-user":""}"><div class="role-user-identity"><span class="role-user-avatar">${escapeHtml(x.userName.slice(0,2).toUpperCase())}</span><div><strong>${escapeHtml(x.userName)}</strong><p>${escapeHtml(x.email||"")}${x.cloudUserId===active?" · Current authenticated account":""}</p></div></div><div class="role-user-control"><span>Effective role</span><strong>${escapeHtml(x.role)}</strong></div><div class="role-user-meta"><span>Status</span><strong>${escapeHtml(x.status||"active")}</strong></div></article>`).join("")}</div>`:emptyState("No authorized accounts found","Refresh access or verify Work Management module assignments.")}</section>`;
    bindRoleManagementControls();
  }
  function bindRoleManagementControls(){
    const db=(fn,w=180)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),w);};};
    $("roleSearch")?.addEventListener("input",db(e=>{state.roleFilters.search=e.target.value;renderRoles();}));
    $("roleFilter")?.addEventListener("change",e=>{state.roleFilters.role=e.target.value;renderRoles();});
    els.content.querySelector('[data-action="roles-clear"]')?.addEventListener("click",()=>{state.roleFilters={search:"",role:"all"};renderRoles();});
    els.content.querySelector('[data-action="roles-refresh"]')?.addEventListener("click",async()=>{await globalThis.WMModuleStore.refresh();state.userRoles=cloudRoleDirectory();renderRoles();toast("Access refreshed","Cloud role assignments were refreshed.","success");});
  }

  function bindRouteShortcuts() {
    els.content.querySelectorAll("[data-route-shortcut]").forEach(btn => btn.addEventListener("click", () => routeTo(btn.dataset.routeShortcut)));
  }

  function bindRequestFilters() {
    const debounce = (fn, wait=180) => {
      let timer;
      return (...args) => { clearTimeout(timer); timer = setTimeout(()=>fn(...args),wait); };
    };
    $("requestSearch")?.addEventListener("input", debounce(e=>{state.filters.search=e.target.value;state.filters.page=1;renderRequests();}));
    $("requestStatus")?.addEventListener("change",e=>{state.filters.status=e.target.value;state.filters.page=1;renderRequests();});
    $("requestDepartment")?.addEventListener("change",e=>{state.filters.department=e.target.value;state.filters.page=1;renderRequests();});
    $("requestRefuelType")?.addEventListener("change",e=>{state.filters.refuelType=e.target.value;state.filters.page=1;renderRequests();});
    $("requestPriority")?.addEventListener("change",e=>{state.filters.priority=e.target.value;state.filters.page=1;renderRequests();});
    $("requestLocation")?.addEventListener("change",e=>{state.filters.location=e.target.value;state.filters.page=1;renderRequests();});
    $("requestSort")?.addEventListener("change",e=>{state.filters.sort=e.target.value;state.filters.page=1;renderRequests();});
    $("requestPageSize")?.addEventListener("change",e=>{
      state.prefs.pageSize=Number(e.target.value)||10;
      saveJson(KEYS.prefs,state.prefs);
      state.filters.page=1;
      renderRequests();
    });
  }

  function bindTableActions() {
    els.content.querySelectorAll("[data-view-request]").forEach(btn=>btn.addEventListener("click",()=>showRequestDetail(btn.dataset.viewRequest)));
    els.content.querySelectorAll("[data-next-state]").forEach(btn=>btn.addEventListener("click",()=>{
      const [id,next] = btn.dataset.nextState.split("|");
      transitionRequest(id,next);
    }));
  }

  function bindNewRequestForm() {
    const form = $("requestForm");
    let receiptData = null;
    let syncingVehicle = false;
    const watched = ["plateNumber","vehicleOwner","odometer","containerId","containerOwner","containerType","origin","destination","distanceKm","purposeText"];
    watched.forEach(id => $(id)?.addEventListener("input", updateReferenceRequestState));
    watched.forEach(id => $(id)?.addEventListener("change", updateReferenceRequestState));

    const syncVehiclePair = (source) => {
      if (syncingVehicle || $("refuelType")?.value !== "vehicle") return;
      syncingVehicle = true;
      if (source === "plate") {
        const match = vehicleByPlate($("plateNumber").value);
        $("vehicleOwner").value = match?.vehicleOwner || "";
      } else {
        const match = vehicleByOwner($("vehicleOwner").value);
        $("plateNumber").value = match?.plateNumber || "";
      }
      syncingVehicle = false;
      clearFieldError("plateNumber");
      clearFieldError("vehicleOwner");
      updateReferenceRequestState();
    };
    $("plateNumber")?.addEventListener("change", () => syncVehiclePair("plate"));
    $("vehicleOwner")?.addEventListener("change", () => syncVehiclePair("owner"));

    els.content.querySelectorAll("[data-refuel-type]").forEach(card => card.addEventListener("click", () => {
      const type = card.dataset.refuelType;
      $("refuelType").value = type;
      els.content.querySelectorAll("[data-refuel-type]").forEach(other => {
        const active = other === card;
        other.classList.toggle("active", active);
        other.setAttribute("aria-checked", active ? "true" : "false");
      });
      $("vehicleDetailsSection").hidden = type !== "vehicle";
      $("containerDetailsSection").hidden = type !== "container";
      $("routeDetailsSection").hidden = type !== "vehicle";
      if ($("reviewRouteRow")) $("reviewRouteRow").hidden = type !== "vehicle";
      if ($("purposeStepNumber")) $("purposeStepNumber").textContent = type === "vehicle" ? "03" : "02";
      updateReferenceRequestState();
    }));

    $("receiptPhoto").addEventListener("change", async event => {
      const file = event.target.files?.[0];
      receiptData = null;
      $("receiptPreview").hidden = true;
      $("receiptPreview").innerHTML = "";
      $("receiptLabel").textContent = "Add photo";
      const errorEl = els.content.querySelector('[data-error-for="receiptPhoto"]');
      if (errorEl) errorEl.textContent = "";
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        if (errorEl) errorEl.textContent = "Choose an image file.";
        event.target.value = "";
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        if (errorEl) errorEl.textContent = "Photo must be 8 MB or smaller before compression.";
        event.target.value = "";
        return;
      }
      try {
        receiptData = await compressReceiptPhoto(file);
        $("receiptLabel").textContent = "Replace photo";
        $("receiptPreview").hidden = false;
        $("receiptPreview").innerHTML = `<img src="${receiptData.dataUrl}" alt="Receipt preview" /><div><strong>${escapeHtml(file.name)}</strong><small>${formatBytes(receiptData.size)} stored in the shared cloud record</small><button class="button secondary small" type="button" id="removeReceiptBtn">Remove</button></div>`;
        $("removeReceiptBtn").addEventListener("click", () => {
          receiptData = null;
          $("receiptPhoto").value = "";
          $("receiptPreview").hidden = true;
          $("receiptPreview").innerHTML = "";
          $("receiptLabel").textContent = "Add photo";
        });
      } catch (error) {
        console.error(error);
        if (errorEl) errorEl.textContent = "FuelTrack+ could not process this photo.";
        event.target.value = "";
      }
    });

    $("saveDraftBtn").addEventListener("click", () => saveRequestFromReferenceForm("Draft", receiptData));
    form.addEventListener("submit", event => {
      event.preventDefault();
      saveRequestFromReferenceForm("Submitted", receiptData);
    });
    updateReferenceRequestState();
  }

  function readRequestForm() {
    const get = id => $(id)?.value?.trim() || "";
    const refuelType = get("refuelType") || "vehicle";
    const odometerText = get("odometer");
    const distanceText = get("distanceKm");
    const vehicleOwner = get("vehicleOwner");
    const containerOwner = get("containerOwner");
    const plateNumber = get("plateNumber");
    const containerId = get("containerId");
    const purposeText = get("purposeText");
    return {
      refuelType,
      plateNumber: refuelType === "vehicle" ? plateNumber : "",
      vehicleOwner: refuelType === "vehicle" ? vehicleOwner : "",
      odometer: refuelType === "vehicle" && odometerText !== "" ? Number(odometerText) : null,
      containerId: refuelType === "container" ? containerId : "",
      containerOwner: refuelType === "container" ? containerOwner : "",
      containerType: refuelType === "container" ? get("containerType") : "",
      origin:refuelType === "vehicle" ? get("origin") : "",
      destination:refuelType === "vehicle" ? get("destination") : "",
      distanceKm:refuelType === "vehicle" && distanceText !== "" ? Number(distanceText) : null,
      purposeText,
      requester: refuelType === "vehicle" ? vehicleOwner : containerOwner,
      department:"",
      location:refuelType === "vehicle" ? get("destination") : "",
      requestedDate:localDateKey(new Date()),
      purpose:purposeText,
      asset:refuelType === "vehicle" ? plateNumber : containerId,
      priority:"Medium",
      reference:"",
      notes:purposeText
    };
  }

  function validateRequest(data, draft=false) {
    const errors = {};
    if (data.refuelType === "vehicle") {
      if (!draft && !data.plateNumber) errors.plateNumber = "Plate number is required.";
      if (!draft && !data.vehicleOwner) errors.vehicleOwner = "Vehicle owner is required.";
      if (data.plateNumber || data.vehicleOwner) {
        const registered = vehicleByPlate(data.plateNumber);
        if (!registered) errors.plateNumber = "Choose a registered plate number.";
        else if (registered.vehicleOwner !== data.vehicleOwner) errors.vehicleOwner = "Vehicle owner does not match the registered plate.";
      }
      if (data.odometer !== null && (!Number.isFinite(data.odometer) || data.odometer < 0)) errors.odometer = "Odometer must be zero or greater.";
    } else if (data.refuelType === "container") {
      if (!draft && !data.containerId) errors.containerId = "Container ID or label is required.";
      if (data.containerId && !CONTAINER_DIRECTORY.includes(data.containerId)) errors.containerId = "Choose a registered container ID.";
      if (!draft && !data.containerOwner) errors.containerOwner = "Custodian or owner is required.";
      if (!draft && !data.containerType) errors.containerType = "Container type is required.";
    } else {
      errors.refuelType = "Choose a valid refuel type.";
    }
    if (data.refuelType === "vehicle") {
      if (!draft && !data.origin) errors.origin = "Origin is required.";
      if (!draft && !data.destination) errors.destination = "Destination is required.";
      if (data.distanceKm !== null && (!Number.isFinite(data.distanceKm) || data.distanceKm < 0)) errors.distanceKm = "Distance must be zero or greater.";
    }
    if (!draft && data.purposeText.length < 10) errors.purposeText = "Purpose must contain at least 10 characters.";
    if (data.purposeText.length > 500) errors.purposeText = "Purpose cannot exceed 500 characters.";
    return errors;
  }

  async function saveRequestFromReferenceForm(status, receiptData) {
    if(!requirePermission("request.create","Your role cannot create fuel requests.")) return;
    const data = readRequestForm();
    const errors = validateRequest(data, status === "Draft");
    if (Object.keys(errors).length) {
      showFormErrors(errors);
      toast("Check request details","Resolve the highlighted fields before continuing.","error");
      return;
    }
    const now = new Date().toISOString();
    const id = nextRequestId();
    const request = {
      id, ...data, status, createdAt:now, updatedAt:now, createdBy:currentActor(), createdByUserId:CLOUD_IDENTITY?.user?.id||null, createdByEmail:CLOUD_IDENTITY?.user?.email||'', createdByRole:currentRole(),
      approver:"", reviewedAt:"", reviewComment:"",
      receiptPhoto: receiptData ? { dataUrl:receiptData.dataUrl, mimeType:receiptData.mimeType, size:receiptData.size } : null,
      vehicleDirectorySource: data.refuelType === "vehicle" ? "registered-directory-v1" : null,
      containerDirectorySource: data.refuelType === "container" ? "registered-container-directory-v1" : null,
      schemaVersion:6
    };
    state.requests.unshift(request);
    const activityMessage=data.refuelType === "vehicle"
      ? `${id} · ${data.plateNumber} · ${data.origin || "Origin unavailable"} → ${data.destination || "Destination unavailable"}`
      : `${id} · ${data.containerId} · ${data.containerOwner || "Custodian unavailable"}`;
    try {
      await commitRequestsWithActivity(newActivityEvent(status === "Draft" ? "system" : "submit",status === "Draft" ? "Draft saved" : "Request submitted",activityMessage,id,{status}));
    } catch(error) {
      state.requests=state.requests.filter(item=>item!==request);
      toast("Request not saved",error?.message||"Cloud persistence rejected the request. Refresh and try again.","error");
      return;
    }
    updateBadges();
    toast(status === "Draft" ? "Draft saved" : "Request submitted", `${id} was ${status === "Draft" ? "saved to the cloud" : "sent to the approval queue"}.`, "success");
    routeTo(status === "Draft" || !canAccessRoute("approvals") ? "requests" : "approvals");
  }

  function updateReferenceRequestState() {
    const data = readRequestForm();
    const purposeLength = data.purposeText.length;
    const remaining = Math.max(0,10-purposeLength);
    if ($("purposeCounter")) $("purposeCounter").textContent = `${purposeLength}/500`;
    if ($("purposeRequirement")) {
      $("purposeRequirement").textContent = remaining ? `${remaining} more character${remaining===1?"":"s"} required` : "Purpose requirement satisfied";
      $("purposeRequirement").classList.toggle("complete", remaining===0);
    }
    if ($("purposeGauge")) {
      const pct=Math.min(100,Math.round(purposeLength/10*100));
      $("purposeGauge").style.setProperty("--purpose-progress",pct);
      $("purposeGauge").querySelector("strong").textContent=String(Math.min(purposeLength,99));
    }

    const vehicleMatch = data.refuelType === "vehicle" ? vehicleByPlate(data.plateNumber) : null;
    const vehicleLinked = Boolean(vehicleMatch && vehicleMatch.vehicleOwner === data.vehicleOwner);
    if ($("vehicleLinkState")) {
      $("vehicleLinkState").textContent = vehicleLinked ? "Directory matched" : "Awaiting selection";
      $("vehicleLinkState").classList.toggle("matched", vehicleLinked);
    }
    if ($("vehicleLinkCard")) $("vehicleLinkCard").classList.toggle("matched", vehicleLinked);
    if ($("vehicleLinkTitle")) $("vehicleLinkTitle").textContent = vehicleLinked ? `${data.plateNumber} · ${data.vehicleOwner}` : "No vehicle selected";
    if ($("vehicleLinkCopy")) $("vehicleLinkCopy").textContent = vehicleLinked ? "Registered plate-owner relationship verified for this request." : "Plate and owner remain synchronized to prevent mismatched requests.";

    const containerLinked = data.refuelType === "container" ? CONTAINER_DIRECTORY.includes(data.containerId) : false;
    const assignmentOk = data.refuelType === "vehicle" ? vehicleLinked : Boolean(containerLinked && data.containerOwner && data.containerType);
    const routeOk = data.refuelType === "vehicle" ? Boolean(data.origin && data.destination) : true;
    const purposeOk = purposeLength >= 10;
    if ($("reviewMode")) $("reviewMode").textContent = data.refuelType === "vehicle" ? "Vehicle Fuel" : "Container Refill";
    if ($("reviewAsset")) $("reviewAsset").textContent = (data.refuelType === "vehicle" ? data.plateNumber : data.containerId) || "Not selected";
    if ($("reviewOwner")) $("reviewOwner").textContent = (data.refuelType === "vehicle" ? data.vehicleOwner : data.containerOwner) || "Not selected";
    if ($("reviewRouteRow")) $("reviewRouteRow").hidden = data.refuelType !== "vehicle";
    if ($("reviewRoute")) $("reviewRoute").textContent = data.origin && data.destination ? `${data.origin} → ${data.destination}` : "Not provided";
    if ($("requestReadinessList")) {
      const item=(ok,title,copy)=>`<div class="readiness-item ${ok?"ready":"pending"}"><span>${ok?"✓":"○"}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></div></div>`;
      const checks = [
        item(assignmentOk, data.refuelType === "vehicle" ? "Vehicle assignment" : "Container assignment", assignmentOk ? "Assignment details are valid." : data.refuelType === "vehicle" ? "Select a registered plate or owner." : "Select a registered container and complete its custodian details.")
      ];
      if (data.refuelType === "vehicle") checks.push(item(routeOk,"Trip route",routeOk ? "Origin and destination captured." : "Origin and destination are required."));
      checks.push(item(purposeOk,"Justification",purposeOk ? "Purpose meets the minimum detail requirement." : "At least 10 characters are required."));
      $("requestReadinessList").innerHTML = checks.join("");
    }
  }

  function compressReceiptPhoto(file) {
    return new Promise((resolve,reject) => {
      const reader=new FileReader();
      reader.onerror=()=>reject(reader.error || new Error("Unable to read image"));
      reader.onload=()=>{
        const img=new Image();
        img.onerror=()=>reject(new Error("Unable to decode image"));
        img.onload=()=>{
          const maxDimension=1280;
          const scale=Math.min(1,maxDimension/Math.max(img.naturalWidth,img.naturalHeight));
          const width=Math.max(1,Math.round(img.naturalWidth*scale));
          const height=Math.max(1,Math.round(img.naturalHeight*scale));
          const canvas=document.createElement("canvas");
          canvas.width=width; canvas.height=height;
          const ctx=canvas.getContext("2d");
          if(!ctx) return reject(new Error("Canvas unavailable"));
          ctx.drawImage(img,0,0,width,height);
          const mimeType="image/jpeg";
          const dataUrl=canvas.toDataURL(mimeType,.78);
          const size=Math.round((dataUrl.length-dataUrl.indexOf(",")-1)*.75);
          if(size>1_500_000) return reject(new Error("Compressed image exceeds local storage-safe size"));
          resolve({dataUrl,mimeType,size});
        };
        img.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
    return `${(bytes/1024/1024).toFixed(1)} MB`;
  }

  function inventoryDimensionValues(key) {
    return [...new Set(state.inventory.map(item=>String(item?.[key]||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  }

  function inventoryIsLow(item) {
    return item?.reorder!==null && item?.reorder!==undefined &&
      Number.isFinite(Number(item.reorder)) && Number.isFinite(Number(item.level)) &&
      Number(item.level)<=Number(item.reorder);
  }

  function filteredLightFuelInventory() {
    const q=String(state.lightFuelFilters.search||"").trim().toLowerCase();
    return state.inventory.filter(item=>{
      const hay=[item.name,item.fuelType,item.location].join(" ").toLowerCase();
      const low=inventoryIsLow(item);
      return (!q||hay.includes(q)) &&
        (!state.lightFuelFilters.fuelType||item.fuelType===state.lightFuelFilters.fuelType) &&
        (!state.lightFuelFilters.location||item.location===state.lightFuelFilters.location) &&
        (!state.lightFuelFilters.health||(state.lightFuelFilters.health==="low"?low:!low));
    }).sort((a,b)=>{
      const lowDiff=Number(inventoryIsLow(b))-Number(inventoryIsLow(a));
      if(lowDiff) return lowDiff;
      return String(a.name||"").localeCompare(String(b.name||""));
    });
  }

  function lightFuelSummary(inventory) {
    const capacity=inventory.reduce((s,x)=>s+(Number(x.capacity)||0),0);
    const level=inventory.reduce((s,x)=>s+(Number(x.level)||0),0);
    return {
      records:inventory.length,
      fuelTypes:new Set(inventory.map(x=>x.fuelType).filter(Boolean)).size,
      capacity,
      level,
      lowStock:inventory.filter(inventoryIsLow).length
    };
  }

  function lightFuelKpi(label,value,foot,icon) {
    return `<article class="lightfuels-kpi-card">
      <span class="lightfuels-kpi-icon">${escapeHtml(icon)}</span>
      <div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><p>${escapeHtml(foot)}</p></div>
    </article>`;
  }

  function lightFuelFulfillmentCard(r) {
    const owner=r.vehicleOwner||r.containerOwner||r.requester||"Owner unavailable";
    const asset=r.plateNumber||r.containerId||r.asset||"Asset unavailable";
    const context=r.refuelType==="vehicle"
      ? (r.origin&&r.destination?`${r.origin} → ${r.destination}`:(r.destination||r.location||"Route unavailable"))
      : (r.containerType||"Container request");
    const purpose=r.purposeText||r.notes||r.purpose||"Purpose unavailable";
    return `<article class="lightfuels-request-card">
      <div class="lightfuels-request-status" aria-hidden="true">↗</div>
      <div class="lightfuels-request-main">
        <div class="lightfuels-request-meta">
          ${statusPill(r.status)}
          <span class="type-pill">${escapeHtml(r.refuelType==="container"?"Container Refill":r.refuelType==="vehicle"?"Vehicle Fuel":"Legacy")}</span>
        </div>
        <h4>${escapeHtml(r.id)} · ${escapeHtml(owner)}</h4>
        <p>${escapeHtml(asset)} · ${escapeHtml(context)}</p>
        <div class="lightfuels-readiness-reason ready">${escapeHtml(purpose)}</div>
        <div class="lightfuels-request-facts">
          <div><span>Asset</span><strong>${escapeHtml(asset)}</strong></div>
          <div><span>Approved</span><strong>${escapeHtml(relativeTime(r.reviewedAt||r.updatedAt||r.createdAt))}</strong></div>
          <div><span>Context</span><strong>${escapeHtml(context)}</strong></div>
        </div>
      </div>
      <div class="lightfuels-request-actions">
        <button class="button primary" type="button" data-refueling-done="${escapeAttr(r.id)}">Mark as Refueling Done</button>
        <button class="button secondary" type="button" data-approval-view="${escapeAttr(r.id)}">View details</button>
        <button class="button ghost small" type="button" data-copy-lightfuel-id="${escapeAttr(r.id)}">Copy ID</button>
      </div>
    </article>`;
  }

  function bindLightFuelControls() {
    const debounce=(fn,wait=180)=>{let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),wait);};};
    $("lightFuelSearch")?.addEventListener("input",debounce(e=>{state.lightFuelFilters.search=e.target.value;renderLightFuels();}));
    $("lightFuelType")?.addEventListener("change",e=>{state.lightFuelFilters.fuelType=e.target.value;renderLightFuels();});
    $("lightFuelLocation")?.addEventListener("change",e=>{state.lightFuelFilters.location=e.target.value;renderLightFuels();});
    $("lightFuelHealth")?.addEventListener("change",e=>{state.lightFuelFilters.health=e.target.value;renderLightFuels();});
    els.content.querySelector('[data-action="lightfuels-reset"]')?.addEventListener("click",()=>{
      state.lightFuelFilters={...state.lightFuelFilters,search:"",fuelType:"",location:"",health:""};
      renderLightFuels();
    });
    els.content.querySelector('[data-action="lightfuels-refresh"]')?.addEventListener("click",()=>requestAppRefresh({source:"manual",force:true,showLoading:true}));
    els.content.querySelector('[data-action="lightfuels-export"]')?.addEventListener("click",()=>exportInventoryPdf(state.inventory));
    $("lightFuelRequestSegments")?.addEventListener("click",event=>{
      const btn=event.target.closest("[data-request-view]");
      if(!btn) return;
      state.lightFuelFilters.requestView=btn.dataset.requestView;
      renderLightFuels();
    });
    els.content.querySelectorAll("[data-refueling-done]").forEach(btn=>btn.addEventListener("click",()=>openRefuelingCompletion(btn.dataset.refuelingDone)));
    els.content.querySelectorAll("[data-approval-view]").forEach(btn=>btn.addEventListener("click",()=>showRequestDetail(btn.dataset.approvalView)));
    els.content.querySelectorAll("[data-copy-lightfuel-id]").forEach(btn=>btn.addEventListener("click",()=>copyRequestId(btn.dataset.copyLightfuelId)));
  }


  function lightFuelsLoadingState() {
    return `<div class="page-head lightfuels-page-head">
      <div><div class="skeleton" style="width:300px;height:38px"></div><div class="skeleton" style="width:min(720px,82vw);height:16px;margin-top:10px"></div></div>
    </div>
    <div class="lightfuels-kpi-grid">${Array.from({length:4},()=>`<div class="lightfuels-kpi-card"><div class="skeleton" style="width:44px;height:44px"></div><div style="flex:1"><div class="skeleton" style="width:96px;height:12px"></div><div class="skeleton" style="width:110px;height:28px;margin-top:8px"></div></div></div>`).join("")}</div>
    <article class="panel"><div style="padding:18px">${Array.from({length:4},()=>'<div class="skeleton skeleton-row" style="height:92px"></div>').join("")}</div></article>`;
  }

  function showRequestDetail(id) {
    const r = state.requests.find(x=>x.id===id);
    if (!r) return toast("Request not found","The selected request no longer exists.","error");
    if (!canViewRequest(r)) return toast("Access denied","You do not have permission to view this request.","error");
    els.detailDialogBody.innerHTML = `
      <div class="dialog-header">
        <div><p class="section-label">REQUEST DETAIL</p><h3>${escapeHtml(r.id)}</h3></div>
        <button class="icon-button" type="button" data-dialog-close="detailDialog" aria-label="Close">×</button>
      </div>
      <div class="dialog-body">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">${statusPill(r.status)} ${priorityPill(r.priority)}</div>
        <div class="dialog-grid">
          ${detail("Refuel type",r.refuelType === "container" ? "Container Refill" : r.refuelType === "vehicle" ? "Vehicle Fuel" : "Legacy request")}
          ${detail("Requester / owner",r.vehicleOwner||r.containerOwner||r.requester||"—")}
          ${r.refuelType === "vehicle" ? detail("Plate number",r.plateNumber||r.asset||"—") : ""}
          ${r.refuelType === "vehicle" ? detail("Odometer",r.odometer!==null&&r.odometer!==undefined?`${Number(r.odometer).toLocaleString()} km`:"—") : ""}
          ${r.refuelType === "container" ? detail("Container",r.containerId||r.asset||"—") : ""}
          ${r.refuelType === "container" ? detail("Container type",r.containerType||"—") : ""}
          ${r.refuelType === "vehicle" ? detail("Origin",r.origin||"—") : ""}
          ${r.refuelType === "vehicle" ? detail("Destination",r.destination||r.location||"—") : ""}
          ${r.refuelType === "vehicle" ? detail("Distance",r.distanceKm!==null&&r.distanceKm!==undefined?`${Number(r.distanceKm).toLocaleString()} km`:"—") : ""}
          ${detail("Created",formatDateTime(new Date(r.createdAt)))}
          ${detail("Last updated",formatDateTime(new Date(r.updatedAt)))}
          ${detail("Purpose",r.purposeText||r.notes||r.purpose||"—",true)}
          ${r.refuelingDetails ? detail("Amount",money(r.refuelingDetails.amount)) : ""}
          ${r.refuelingDetails ? detail("Invoice number",r.refuelingDetails.invoiceNumber||"—") : ""}
          ${r.refuelingDetails ? detail("Fuel quantity",`${Number(r.refuelingDetails.fuelQuantityLiters||0).toLocaleString(undefined,{maximumFractionDigits:2})} L`) : ""}
          ${r.refuelingDetails ? detail("Refueling completed",formatDateTime(new Date(r.refuelingDetails.completedAt||r.completedAt))) : ""}
          ${r.refuelingDetails?.receiptPhoto?.dataUrl ? `<div class="detail-item full"><span>Refueling receipt / photo</span><img class="detail-receipt-image" src="${escapeAttr(r.refuelingDetails.receiptPhoto.dataUrl)}" alt="Refueling receipt attached to ${escapeAttr(r.id)}" /></div>` : ""}
          ${r.receiptPhoto?.dataUrl ? `<div class="detail-item full"><span>Receipt photo</span><img class="detail-receipt-image" src="${escapeAttr(r.receiptPhoto.dataUrl)}" alt="Receipt attached to ${escapeAttr(r.id)}" /></div>` : ""}
          ${r.reviewComment ? detail("Review comment",r.reviewComment,true) : ""}
        </div>
      </div>
      <div class="dialog-footer">
        <button class="button secondary" type="button" data-dialog-close="detailDialog">Close</button>
      </div>`;
    els.detailDialog.showModal();
  }

  function transitionRequest(id,next) {
    if(next==="Completed") {
      return toast("Completion workflow required","Requests can only be completed through LightFuels → Mark as Refueling Done.","error");
    }
    const r = state.requests.find(x=>x.id===id);
    if (!r || !(VALID_TRANSITIONS[r.status]||[]).includes(next)) {
      return toast("Transition blocked","That state change is not valid for the current request.","error");
    }
    if (["Cancelled","Rejected"].includes(next)) {
      return confirmAction(`${next} ${id}?`,`This will move the request from ${r.status} to ${next}. The action is recorded in Activity.`,()=>{
        applyTransition(r,next);
      });
    }
    applyTransition(r,next);
  }

  async function applyTransition(r,next,extra={}) {
    const snapshot={...r};
    const previous=r.status;
    Object.assign(r,extra,{status:next,updatedAt:new Date().toISOString()});
    if(next==="Under Review") {
      r.reviewedAt="";
      if(!r.reviewStartedAt) r.reviewStartedAt=new Date().toISOString();
    }
    if(next==="Approved") {
      r.approver=r.approver||currentActor();
      r.reviewedAt=r.reviewedAt||new Date().toISOString();
    }
    try {
      await commitRequestsWithActivity(newActivityEvent(next==="Approved"||next==="Rejected"?"review":next==="Issued"?"issue":"system",
        `Request ${next.toLowerCase()}`,`${r.id} moved from ${previous} to ${next}${r.reviewComment?` · ${r.reviewComment}`:""}.`,r.id,{from:previous,to:next}));
    } catch(error) {
      Object.keys(r).forEach(key=>delete r[key]);
      Object.assign(r,snapshot);
      return toast("Request not updated",error?.message||"The state change could not be committed. Refresh and retry.","error");
    }
    updateBadges();
    toast("Request updated",`${r.id} is now ${next}.`,"success");
    renderRoute();
  }

  function approveRequest(id) {
    const r=state.requests.find(x=>x.id===id);
    if(!r) return toast("Approval unavailable","The selected request no longer exists.","error");
    if(r.status==="Submitted") return toast("Start review first","Submitted requests must enter Under Review before approval.","info");
    if(r.status!=="Under Review") return toast("Approval unavailable","Only under-review requests can be approved.","error");
    openApprovalDecision(id,"approve");
  }

  function rejectRequest(id) {
    const r=state.requests.find(x=>x.id===id);
    if(!r) return toast("Rejection unavailable","The selected request no longer exists.","error");
    if(r.status==="Submitted") return toast("Start review first","Submitted requests must enter Under Review before rejection.","info");
    if(r.status!=="Under Review") return toast("Rejection unavailable","Only under-review requests can be rejected.","error");
    openApprovalDecision(id,"reject");
  }

  function openRefuelingCompletion(id) {
    if(!requirePermission("lightfuels.complete","Only Admin or Pump Attendant can complete refueling.")) return;
    const r=state.requests.find(x=>x.id===id);
    if(!r || r.status!=="Approved") {
      return toast("Completion unavailable","Only approved requests can enter the refueling completion workflow.","error");
    }
    pendingRefuelingCompletion=id;
    refuelingReceiptData=null;
    clearRefuelingCompletionErrors();
    els.refuelingCompletionForm?.reset();
    if(els.refuelingReceiptLabel) els.refuelingReceiptLabel.textContent="Capture or upload photo";
    if(els.refuelingReceiptPreview) {
      els.refuelingReceiptPreview.hidden=true;
      els.refuelingReceiptPreview.innerHTML="";
    }
    const owner=r.vehicleOwner||r.containerOwner||r.requester||"Owner unavailable";
    const asset=r.plateNumber||r.containerId||r.asset||"Asset unavailable";
    const type=r.refuelType==="container"?"Container Refill":r.refuelType==="vehicle"?"Vehicle Fuel":"Legacy";
    els.refuelingCompletionTitle.textContent=`Mark ${r.id} as Refueling Done`;
    els.refuelingCompletionSummary.innerHTML=`
      <div><span>Request</span><strong>${escapeHtml(r.id)}</strong></div>
      <div><span>Owner</span><strong>${escapeHtml(owner)}</strong></div>
      <div><span>Asset</span><strong>${escapeHtml(asset)}</strong></div>
      <div><span>Refuel type</span><strong>${escapeHtml(type)}</strong></div>`;
    els.refuelingCompletionDialog.showModal();
    setTimeout(()=>els.refuelingAmount?.focus(),0);
  }

  function clearRefuelingCompletionErrors() {
    document.querySelectorAll("[data-refueling-error]").forEach(node=>node.textContent="");
    [els.refuelingAmount,els.refuelingInvoiceNumber,els.refuelingFuelQuantity].forEach(node=>node?.classList.remove("invalid"));
  }

  function validateRefuelingCompletion() {
    const amountText=String(els.refuelingAmount?.value||"").trim();
    const invoiceNumber=String(els.refuelingInvoiceNumber?.value||"").trim();
    const quantityText=String(els.refuelingFuelQuantity?.value||"").trim();
    const amount=Number(amountText);
    const fuelQuantityLiters=Number(quantityText);
    const errors={};
    if(!amountText || !Number.isFinite(amount) || amount<=0) errors.amount="Enter an amount greater than zero.";
    if(!invoiceNumber) errors.invoiceNumber="Invoice number is required.";
    else if(invoiceNumber.length>120) errors.invoiceNumber="Invoice number cannot exceed 120 characters.";
    if(!quantityText || !Number.isFinite(fuelQuantityLiters) || fuelQuantityLiters<=0) errors.fuelQuantityLiters="Enter a fuel quantity greater than zero.";
    return {errors,data:{amount:round2(amount),invoiceNumber,fuelQuantityLiters:round2(fuelQuantityLiters)}};
  }

  function showRefuelingCompletionErrors(errors) {
    clearRefuelingCompletionErrors();
    const fieldMap={
      amount:els.refuelingAmount,
      invoiceNumber:els.refuelingInvoiceNumber,
      fuelQuantityLiters:els.refuelingFuelQuantity
    };
    Object.entries(errors).forEach(([key,message])=>{
      const errorNode=document.querySelector(`[data-refueling-error="${key}"]`);
      if(errorNode) errorNode.textContent=message;
      fieldMap[key]?.classList.add("invalid");
    });
    const firstKey=Object.keys(errors)[0];
    fieldMap[firstKey]?.focus();
  }

  async function handleRefuelingReceiptPhoto(event) {
    const file=event.target.files?.[0];
    refuelingReceiptData=null;
    const errorNode=document.querySelector('[data-refueling-error="receiptPhoto"]');
    if(errorNode) errorNode.textContent="";
    if(els.refuelingReceiptPreview) {
      els.refuelingReceiptPreview.hidden=true;
      els.refuelingReceiptPreview.innerHTML="";
    }
    if(els.refuelingReceiptLabel) els.refuelingReceiptLabel.textContent="Capture or upload photo";
    if(!file) return;
    if(!file.type.startsWith("image/")) {
      if(errorNode) errorNode.textContent="Choose an image file.";
      event.target.value="";
      return;
    }
    if(file.size>8*1024*1024) {
      if(errorNode) errorNode.textContent="Photo must be 8 MB or smaller before compression.";
      event.target.value="";
      return;
    }
    try {
      refuelingReceiptData=await compressReceiptPhoto(file);
      if(els.refuelingReceiptLabel) els.refuelingReceiptLabel.textContent="Replace photo";
      if(els.refuelingReceiptPreview) {
        els.refuelingReceiptPreview.hidden=false;
        els.refuelingReceiptPreview.innerHTML=`<img src="${refuelingReceiptData.dataUrl}" alt="Refueling receipt preview" /><div><strong>${escapeHtml(file.name)}</strong><small>${formatBytes(refuelingReceiptData.size)} stored in the shared cloud record</small><button class="button secondary small" type="button" id="removeRefuelingReceiptBtn">Remove</button></div>`;
        $("removeRefuelingReceiptBtn")?.addEventListener("click",()=>{
          refuelingReceiptData=null;
          if(els.refuelingReceiptPhoto) els.refuelingReceiptPhoto.value="";
          els.refuelingReceiptPreview.hidden=true;
          els.refuelingReceiptPreview.innerHTML="";
          if(els.refuelingReceiptLabel) els.refuelingReceiptLabel.textContent="Capture or upload photo";
        });
      }
    } catch(error) {
      console.error(error);
      if(errorNode) errorNode.textContent="FuelTrack+ could not process this photo.";
      event.target.value="";
    }
  }

  async function submitRefuelingCompletion() {
    if(!pendingRefuelingCompletion) return;
    const r=state.requests.find(x=>x.id===pendingRefuelingCompletion);
    if(!r || r.status!=="Approved") {
      els.refuelingCompletionDialog.close();
      return toast("Completion unavailable","The request state changed before refueling completion could be recorded.","error");
    }
    const {errors,data}=validateRefuelingCompletion();
    if(Object.keys(errors).length) {
      showRefuelingCompletionErrors(errors);
      return toast("Check refueling details","Complete all required refueling fields before continuing.","error");
    }

    const snapshot={...r};
    const now=new Date().toISOString();
    const receiptPhoto=refuelingReceiptData
      ? {dataUrl:refuelingReceiptData.dataUrl,mimeType:refuelingReceiptData.mimeType,size:refuelingReceiptData.size}
      : null;

    Object.assign(r,{
      status:"Completed",
      completedAt:now,
      updatedAt:now,
      completedBy:currentActor(),
      refuelingDetails:{
        amount:data.amount,
        invoiceNumber:data.invoiceNumber,
        fuelQuantityLiters:data.fuelQuantityLiters,
        receiptPhoto,
        completedAt:now,
        completedBy:currentActor()
      }
    });

    try {
      await commitRequestsWithActivity(newActivityEvent(
        "issue","Refueling completed",
        `${r.id} · Invoice ${data.invoiceNumber} · ${data.fuelQuantityLiters.toLocaleString(undefined,{maximumFractionDigits:2})} L · Amount ${money(data.amount)}`,
        r.id,{invoiceNumber:data.invoiceNumber,fuelQuantityLiters:data.fuelQuantityLiters,amount:data.amount}
      ));
    } catch(error) {
      Object.keys(r).forEach(key=>delete r[key]);
      Object.assign(r,snapshot);
      return toast("Completion not saved",error?.message||"Refueling details could not be committed. Refresh and retry.","error");
    }
    updateBadges();
    els.refuelingCompletionDialog.close();
    toast("Refueling completed",`${r.id} was completed and the refueling details were saved.`,"success");
    renderRoute();
  }

  function resetRefuelingCompletionDialog() {
    pendingRefuelingCompletion=null;
    refuelingReceiptData=null;
    els.refuelingCompletionForm?.reset();
    clearRefuelingCompletionErrors();
    if(els.refuelingReceiptLabel) els.refuelingReceiptLabel.textContent="Capture or upload photo";
    if(els.refuelingReceiptPreview) {
      els.refuelingReceiptPreview.hidden=true;
      els.refuelingReceiptPreview.innerHTML="";
    }
  }

  function confirmAction(title,message,action) {
    els.confirmTitle.textContent=title;
    els.confirmMessage.textContent=message;
    pendingConfirmation=action;
    els.confirmDialog.showModal();
  }

  function showNotifications() {
    const pending=authorizedRequests().filter(r=>["Submitted","Under Review"].includes(r.status));
    const lowStock=hasPermission("lightfuels.view")?state.inventory.filter(t=>t.reorder!==null && t.reorder!==undefined && Number.isFinite(Number(t.reorder)) && Number(t.level)<=Number(t.reorder)):[];
    const notes=[
      ...pending.slice(0,4).map(r=>({title:`${r.id} awaiting review`,message:`${r.vehicleOwner||r.containerOwner||r.requester||"Requester unavailable"} · ${r.plateNumber||r.containerId||r.asset||"Asset unavailable"}.`,at:r.createdAt})),
      ...lowStock.map(t=>({title:`${t.name} near reorder level`,message:`${formatLiters(t.level)} remains at ${t.location}.`,at:t.updatedAt}))
    ];
    els.notificationList.innerHTML = notes.length ? notes.map(n=>`<div class="notification-item"><span></span><div><strong>${escapeHtml(n.title)}</strong><p>${escapeHtml(n.message)}</p><time>${escapeHtml(relativeTime(n.at))}</time></div></div>`).join("") : emptyState("No active alerts","The workspace has no pending operational notifications.");
    els.notificationDialog.showModal();
  }

  function filteredRequests() {
    const q=String(state.filters.search||"").trim().toLowerCase();
    let rows=authorizedRequests().filter(r=>{
      const refuelType = r.refuelType || "legacy";
      const locationValue = r.destination || r.location || "";
      const hay=[
        r.id,r.requester,r.vehicleOwner,r.containerOwner,r.plateNumber,r.containerId,r.department,
        r.location,r.origin,r.destination,r.asset,r.purposeText,r.purpose,r.status,
        r.priority,refuelType
      ].join(" ").toLowerCase();
      return (!q||hay.includes(q)) &&
        (!state.filters.status||r.status===state.filters.status) &&
        (!state.filters.department||r.department===state.filters.department) &&
        (!state.filters.refuelType||refuelType===state.filters.refuelType) &&
        (!state.filters.priority||r.priority===state.filters.priority) &&
        (!state.filters.location||locationValue===state.filters.location);
    });
    const pri={High:3,Medium:2,Low:1};
    rows.sort((a,b)=>{
      if(state.filters.sort==="oldest") return new Date(a.createdAt)-new Date(b.createdAt);
      if(state.filters.sort==="updated") return new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt);
      if(state.filters.sort==="priority") return (pri[b.priority]||0)-(pri[a.priority]||0) || new Date(b.createdAt)-new Date(a.createdAt);
      return new Date(b.createdAt)-new Date(a.createdAt);
    });
    return rows;
  }

  function requestRegistrySummary(rows) {
    return {
      count:rows.length,
      pending:rows.filter(r=>["Submitted","Under Review"].includes(r.status)).length,
      inReview:rows.filter(r=>r.status==="Under Review").length,
      completed:rows.filter(r=>r.status==="Completed").length
    };
  }

  function requestLocationValues() {
    return [...new Set(authorizedRequests().map(r=>r.destination||r.location||"").filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  }

  function countStatus(status) {
    return state.requests.filter(r=>r.status===status).length;
  }

  function quickRequestStatusButton(value,label,count) {
    const active = String(state.filters.status||"")===value;
    return `<button class="request-status-chip ${active?"active":""}" type="button" data-request-quick-status="${escapeAttr(value)}" aria-pressed="${active}">
      <span>${escapeHtml(label)}</span><strong>${count}</strong>
    </button>`;
  }

  function registrySummaryCard(label,value,foot,icon) {
    return `<article class="request-summary-card">
      <span class="request-summary-icon">${escapeHtml(icon)}</span>
      <div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><p>${escapeHtml(foot)}</p></div>
    </article>`;
  }

  function requestActiveFilters() {
    const filters = [];
    const push=(key,prefix,value)=>{ if(value) filters.push({key,label:`${prefix}: ${value}`}); };
    push("search","Search",state.filters.search);
    push("status","Status",state.filters.status);
    push("department","Department",state.filters.department);
    push("priority","Priority",state.filters.priority);
    push("location","Location",state.filters.location);
    if (state.filters.refuelType) {
      const label = state.filters.refuelType==="vehicle"?"Vehicle Fuel":state.filters.refuelType==="container"?"Container Refill":"Legacy";
      filters.push({key:"refuelType",label:`Type: ${label}`});
    }
    return filters;
  }

  function resetRequestFilters() {
    state.filters = {
      search:"",status:"",department:"",refuelType:"",priority:"",location:"",
      month:"",sort:"newest",page:1
    };
    renderRequests();
  }

  function clearSingleRequestFilter(key) {
    if (!(key in state.filters)) return;
    state.filters[key]="";
    state.filters.page=1;
    renderRequests();
  }

  function requestContextRoute(r) {
    if (["Submitted","Under Review"].includes(r.status) && hasPermission("approval.view")) return {route:"approvals",label:"Review"};
    if (r.status==="Approved" && hasPermission("lightfuels.complete")) return {route:"lightfuels",label:"Complete refueling"};
    return null;
  }

  function requestWorkbenchTable(rows) {
    return `<div class="table-scroll"><table class="data-table request-workbench-table">
      <thead><tr><th>Request</th><th>Owner / Asset</th><th>Type</th><th>Purpose</th><th>Route / Context</th><th>Status</th><th>Updated</th><th></th></tr></thead>
      <tbody>${rows.map(r=>{
        const context=requestContextRoute(r);
        const purpose=r.purposeText||r.notes||r.purpose||"Purpose unavailable";
        const location=r.refuelType==="vehicle" ? (r.destination||r.location||"—") : (r.containerType||"Container request");
        const sub=r.refuelType==="vehicle" ? (r.origin?`From ${r.origin}`:shortDate(r.requestedDate)) : (r.containerId||r.asset||"—");
        return `<tr>
          <td><div class="cell-main mono">${escapeHtml(r.id)}</div><div class="cell-sub">${escapeHtml(r.priority||"—")} priority</div></td>
          <td><div class="cell-main">${escapeHtml(r.vehicleOwner||r.containerOwner||r.requester||"—")}</div><div class="cell-sub">${escapeHtml(r.plateNumber||r.containerId||r.asset||"—")}</div></td>
          <td><span class="type-pill">${escapeHtml(r.refuelType==="container"?"Container Refill":r.refuelType==="vehicle"?"Vehicle Fuel":"Legacy")}</span></td>
          <td><div class="cell-main request-purpose-cell">${escapeHtml(purpose)}</div></td>
          <td><div class="cell-main">${escapeHtml(location)}</div><div class="cell-sub">${escapeHtml(sub)}</div></td>
          <td>${statusPill(r.status)}</td>
          <td><div class="cell-main">${escapeHtml(relativeTime(r.updatedAt||r.createdAt))}</div><div class="cell-sub">${escapeHtml(shortDate(localDateKey(new Date(r.updatedAt||r.createdAt))))}</div></td>
          <td><div class="table-actions request-row-actions">
            ${context?`<button class="button primary small" type="button" data-request-context-route="${context.route}">${context.label}</button>`:""}
            <button class="button secondary small" type="button" data-view-request="${escapeAttr(r.id)}">View</button>
            ${hasPermission("request.delete")?`<button class="button danger small" type="button" data-delete-request="${escapeAttr(r.id)}">Delete</button>`:""}
            <button class="icon-button request-copy-button" type="button" data-copy-request="${escapeAttr(r.id)}" aria-label="Copy ${escapeAttr(r.id)}">⧉</button>
          </div></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>`;
  }

  function requestDeleteRequest(id) {
    if(!requirePermission("request.delete","Only Admin can delete requests.")) return;
    const r=state.requests.find(x=>x.id===id);
    if(!r) return toast("Delete unavailable","The selected request no longer exists.","error");

    const owner=r.vehicleOwner||r.containerOwner||r.requester||"Owner unavailable";
    confirmAction(
      `Delete ${r.id}?`,
      `This permanently removes the request record for ${owner} from the shared cloud registry. Activity history will be preserved for audit continuity.`,
      ()=>deleteRequestRecord(r.id)
    );
  }

  async function deleteRequestRecord(id) {
    const index=state.requests.findIndex(r=>r.id===id);
    if(index<0) return toast("Delete unavailable","The selected request no longer exists.","error");

    const removed=state.requests[index];
    const previousRequests=[...state.requests];
    state.requests.splice(index,1);

    try {
      await commitRequestsWithActivity(newActivityEvent("system","Request deleted",`${removed.id} was permanently removed from the request registry.`,removed.id,{operation:"delete"}));
    } catch(error) {
      state.requests=previousRequests;
      return toast("Request not deleted",error?.message||"The request could not be removed. Refresh and retry.","error");
    }

    const pageSize=Math.max(5,Number(state.prefs.pageSize)||10);
    const remaining=filteredRequests();
    const pages=Math.max(1,Math.ceil(remaining.length/pageSize));
    if(state.filters.page>pages) state.filters.page=pages;

    updateBadges();
    toast("Request deleted",`${removed.id} was removed successfully.`,"success");
    renderRequests();
  }

  async function copyRequestId(id) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
      } else {
        const area=document.createElement("textarea");
        area.value=id; area.style.position="fixed"; area.style.opacity="0";
        document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
      }
      toast("Request ID copied",`${id} copied to the clipboard.`,"success");
    } catch {
      toast("Copy unavailable","The browser could not copy the request ID.","error");
    }
  }

  function requestsLoadingState() {
    return `<div class="page-head requests-page-head">
      <div><div class="skeleton" style="width:260px;height:35px"></div><div class="skeleton" style="width:min(620px,80vw);height:16px;margin-top:10px"></div></div>
    </div>
    <div class="request-registry-summary">${Array.from({length:4},()=>`<div class="request-summary-card"><div class="skeleton" style="width:42px;height:42px"></div><div style="flex:1"><div class="skeleton" style="width:90px;height:12px"></div><div class="skeleton" style="width:120px;height:28px;margin-top:9px"></div></div></div>`).join("")}</div>
    <article class="panel table-panel"><div style="padding:18px">${Array.from({length:7},()=>'<div class="skeleton skeleton-row"></div>').join("")}</div></article>`;
  }

  function primaryFuelMetrics(rows=state.requests) {
    const requests=Array.isArray(rows)?rows:[];
    const completed=requests.filter(r=>r.refuelingDetails && r.status==="Completed");
    const spent=completed.reduce((sum,r)=>{
      const value=Number(r.refuelingDetails?.amount);
      return sum+(Number.isFinite(value)&&value>0?value:0);
    },0);
    const volume=completed.reduce((sum,r)=>{
      const value=Number(r.refuelingDetails?.fuelQuantityLiters);
      return sum+(Number.isFinite(value)&&value>0?value:0);
    },0);

    const vehicleCompleted=completed.filter(r=>r.refuelType==="vehicle");
    const vehicleKeys=new Set(
      vehicleCompleted
        .map(r=>String(r.plateNumber||r.asset||"").trim())
        .filter(Boolean)
    );
    const vehicleVolume=vehicleCompleted.reduce((sum,r)=>{
      const value=Number(r.refuelingDetails?.fuelQuantityLiters);
      return sum+(Number.isFinite(value)&&value>0?value:0);
    },0);

    return {
      totalSpent:round2(spent),
      fuelVolume:round2(volume),
      requests:requests.length,
      avgPerVehicle:vehicleKeys.size?round2(vehicleVolume/vehicleKeys.size):0,
      completedWithRefueling:completed.length,
      vehicleCount:vehicleKeys.size
    };
  }

  function primaryMetricCard(label,value,foot,icon,availability=true) {
    return `<article class="primary-metric-card ${availability?"":"unavailable"}">
      <div class="primary-metric-head">
        <span>${escapeHtml(label)}</span>
        <i aria-hidden="true">${escapeHtml(icon)}</i>
      </div>
      <strong>${availability?escapeHtml(value):"—"}</strong>
      <p>${escapeHtml(foot)}</p>
    </article>`;
  }

  function metrics(rows=rows) {
    const now=new Date(), month=now.getMonth(), year=now.getFullYear();
    const isThisMonth = value => {
      if (!value) return false;
      const d=new Date(value);
      return !Number.isNaN(d.getTime()) && d.getMonth()===month && d.getFullYear()===year;
    };
    const requestedThisMonth=rows.filter(r=>isThisMonth(r.createdAt) && r.status!=="Cancelled");
    const approvedThisMonth=rows.filter(r=>isThisMonth(r.reviewedAt) && ["Approved","Issued","Completed"].includes(r.status));
    const issuedThisMonth=rows.filter(r=>isThisMonth(r.issuedAt) && ["Issued","Completed"].includes(r.status));
    const approvedAll=rows.filter(r=>["Approved","Issued","Completed"].includes(r.status)).length;
    const rejected=rows.filter(r=>r.status==="Rejected").length;
    return {
      monthRequests:requestedThisMonth.length,
      monthApprovedCount:approvedThisMonth.length,
      monthIssuedCount:issuedThisMonth.length,
      pending:rows.filter(r=>["Submitted","Under Review"].includes(r.status)).length,
      approved:approvedAll,
      decisionCount:approvedAll+rejected,
      assetRequests:rows.filter(r=>String(r.asset||"").trim()).length,
      notedRequests:rows.filter(r=>String(r.purposeText||r.notes||r.purpose||"").trim()).length,
      routedRequests:rows.filter(r=>String(r.origin||"").trim() && String(r.destination||r.location||"").trim()).length
    };
  }

  function monthlyRequestCountSeries(count=6,rows=state.requests) {
    const now=new Date();
    const arr=[];
    for(let i=count-1;i>=0;i--){
      const d=new Date(now.getFullYear(),now.getMonth()-i,1);
      const y=d.getFullYear(),m=d.getMonth();
      const value=rows.filter(r=>{
        const x=new Date(r.createdAt);
        return !Number.isNaN(x.getTime()) && x.getFullYear()===y && x.getMonth()===m && r.status!=="Cancelled";
      }).length;
      arr.push({label:d.toLocaleString(undefined,{month:"short"}),value});
    }
    return arr;
  }

  function aggregateBy(key) {
    const map=new Map();
    for(const r of state.requests){
      if(r.status==="Cancelled") continue;
      const label=String(r[key]||"").trim();
      if(!label) continue;
      map.set(label,(map.get(label)||0)+1);
    }
    return [...map].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
  }

  function workflowStatusList() {
    const keys=["Submitted","Under Review","Approved","Issued","Completed"];
    const counts=keys.map(k=>({k,n:state.requests.filter(r=>r.status===k).length}));
    const max=Math.max(...counts.map(x=>x.n),1);
    return counts.map(x=>progressRow(x.k,String(x.n),x.n/max*100)).join("");
  }

  function requestTable(rows, actions=true) {
    return `<div class="table-scroll"><table class="data-table">
      <thead><tr><th>Request</th><th>Owner / Asset</th><th>Refuel type</th><th>Purpose</th><th>Context</th><th>Status</th>${actions?"<th></th>":""}</tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td><div class="cell-main mono">${escapeHtml(r.id)}</div><div class="cell-sub">${escapeHtml(r.priority||"—")} priority</div></td>
        <td><div class="cell-main">${escapeHtml(r.vehicleOwner||r.containerOwner||r.requester||"—")}</div><div class="cell-sub">${escapeHtml(r.plateNumber||r.containerId||r.asset||"—")}</div></td>
        <td><span class="type-pill">${escapeHtml(r.refuelType==="container"?"Container Refill":r.refuelType==="vehicle"?"Vehicle Fuel":"Legacy")}</span></td>
        <td><div class="cell-main request-purpose-cell">${escapeHtml(r.purposeText||r.notes||r.purpose||"Purpose unavailable")}</div></td>
        <td><div class="cell-main">${escapeHtml(r.refuelType==="vehicle"?(r.destination||r.location||"—"):(r.containerType||"Container request"))}</div></td>
        <td>${statusPill(r.status)}</td>
        ${actions?`<td><div class="table-actions"><button class="button secondary small" type="button" data-view-request="${escapeAttr(r.id)}">View</button></div></td>`:""}
      </tr>`).join("")}</tbody>
    </table></div>`;
  }

  function approvalCard(r) {
    const underReview = r.status === "Under Review";
    const owner = r.vehicleOwner || r.containerOwner || r.requester || "Owner unavailable";
    const asset = r.plateNumber || r.containerId || r.asset || "Asset unavailable";
    const route = r.origin && r.destination ? `${r.origin} → ${r.destination}` : (r.destination || r.location || "Route unavailable");
    const refuelLabel = r.refuelType==="container" ? "Container Refill" : r.refuelType==="vehicle" ? "Vehicle Fuel" : "Legacy";
    const hasEvidence = Boolean(r.receiptPhoto?.dataUrl);

    return `<article class="approval-card approval-workbench-card">
      <div class="approval-card-main">
        <div class="approval-meta">
          ${priorityPill(r.priority||"Medium")}
          ${statusPill(r.status)}
          <span class="type-pill">${escapeHtml(refuelLabel)}</span>
          ${hasEvidence?'<span class="approval-evidence-pill">Photo attached</span>':""}
        </div>
        <div class="approval-card-title-row">
          <div>
            <h4>${escapeHtml(r.id)}</h4>
            <p class="approval-owner">${escapeHtml(owner)} · ${escapeHtml(asset)}</p>
          </div>
          <div class="approval-age">
            <span>Waiting</span>
            <strong>${escapeHtml(approvalAgeLabel(r))}</strong>
          </div>
        </div>
        <p class="approval-purpose">${escapeHtml(r.purposeText||r.notes||r.purpose||"No purpose supplied")}</p>
        ${r.refuelType==="vehicle" ? `<div class="approval-route"><span aria-hidden="true">↗</span><strong>${escapeHtml(route)}</strong>${Number.isFinite(Number(r.distanceKm))?`<small>${Number(r.distanceKm).toLocaleString()} km</small>`:""}</div>` : ""}
        <div class="approval-summary approval-summary-enhanced">
          <div><span>Stage</span><strong>${escapeHtml(r.status)}</strong></div>
          <div><span>Refuel type</span><strong>${escapeHtml(refuelLabel)}</strong></div>
          <div class="approval-summary-purpose"><span>Purpose</span><strong>${escapeHtml(r.purposeText||r.notes||r.purpose||"Purpose unavailable")}</strong></div>
          <div><span>Submitted</span><strong>${escapeHtml(formatDateTime(new Date(r.createdAt)))}</strong></div>
        </div>
      </div>
      <div class="approval-actions approval-actions-enhanced">
        ${underReview
          ? `<button class="button primary" type="button" data-approve="${escapeAttr(r.id)}">Approve</button>
             <button class="button danger" type="button" data-reject="${escapeAttr(r.id)}">Reject</button>`
          : `<button class="button primary" type="button" data-start-review="${escapeAttr(r.id)}">Start review</button>`}
        <button class="button secondary" type="button" data-approval-view="${escapeAttr(r.id)}">View details</button>
        <button class="button ghost small" type="button" data-copy-approval-id="${escapeAttr(r.id)}">Copy ID</button>
      </div>
    </article>`;
  }

  function filteredApprovalQueue(rows) {
    const q = String(state.approvalFilters.search||"").trim().toLowerCase();
    const priority = {High:3,Medium:2,Low:1};
    const filtered = rows.filter(r => {
      const refuelType = r.refuelType || "legacy";
      const hay = [
        r.id,r.vehicleOwner,r.containerOwner,r.requester,r.plateNumber,r.containerId,r.asset,
        r.origin,r.destination,r.location,r.purposeText,r.notes,r.purpose,r.status,r.priority,refuelType
      ].join(" ").toLowerCase();
      return (!q || hay.includes(q)) &&
        (!state.approvalFilters.stage || r.status===state.approvalFilters.stage) &&
        (!state.approvalFilters.refuelType || refuelType===state.approvalFilters.refuelType) &&
        (!state.approvalFilters.priority || r.priority===state.approvalFilters.priority);
    });
    filtered.sort((a,b)=>{
      if(state.approvalFilters.sort==="priority") return (priority[b.priority]||0)-(priority[a.priority]||0) || new Date(a.createdAt)-new Date(b.createdAt);
      if(state.approvalFilters.sort==="newest") return new Date(b.createdAt)-new Date(a.createdAt);
      if(state.approvalFilters.sort==="updated") return new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt);
      return new Date(a.createdAt)-new Date(b.createdAt);
    });
    return filtered;
  }

  function approvalQueueSummary(rows) {
    const sorted = [...rows].sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
    return {
      total:rows.length,
      submitted:rows.filter(r=>r.status==="Submitted").length,
      inReview:rows.filter(r=>r.status==="Under Review").length,
      highPriority:rows.filter(r=>r.priority==="High").length,
      oldest:sorted[0]||null
    };
  }

  function approvalKpi(label,value,foot,icon) {
    return `<article class="approval-kpi-card">
      <span class="approval-kpi-icon">${escapeHtml(icon)}</span>
      <div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><p>${foot}</p></div>
    </article>`;
  }

  function approvalAgeLabel(r) {
    if (!r?.createdAt) return "Unavailable";
    const ms = Math.max(0,Date.now()-new Date(r.createdAt).getTime());
    const hours = Math.floor(ms/3600000);
    if (hours < 1) return "< 1 hour";
    if (hours < 24) return `${hours} hr`;
    const days = Math.floor(hours/24);
    const rem = hours%24;
    return rem ? `${days} d ${rem} hr` : `${days} d`;
  }

  function bindApprovalControls() {
    const debounce=(fn,wait=180)=>{let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),wait);};};
    $("approvalSearch")?.addEventListener("input",debounce(e=>{state.approvalFilters.search=e.target.value;renderApprovals();}));
    $("approvalStage")?.addEventListener("change",e=>{state.approvalFilters.stage=e.target.value;renderApprovals();});
    $("approvalRefuelType")?.addEventListener("change",e=>{state.approvalFilters.refuelType=e.target.value;renderApprovals();});
    $("approvalPriority")?.addEventListener("change",e=>{state.approvalFilters.priority=e.target.value;renderApprovals();});
    $("approvalSort")?.addEventListener("change",e=>{state.approvalFilters.sort=e.target.value;renderApprovals();});
    els.content.querySelector('[data-action="approvals-reset"]')?.addEventListener("click",()=>{
      state.approvalFilters={search:"",stage:"",refuelType:"",priority:"",sort:"oldest"};
      renderApprovals();
    });
    els.content.querySelector('[data-action="approvals-refresh"]')?.addEventListener("click",()=>requestAppRefresh({source:"manual",force:true,showLoading:true}));
    els.content.querySelector('[data-action="approvals-export"]')?.addEventListener("click",()=>{
      exportApprovalsPdf(filteredApprovalQueue(state.requests.filter(r=>["Submitted","Under Review"].includes(r.status))));
    });
    els.content.querySelectorAll("[data-start-review]").forEach(btn=>btn.addEventListener("click",()=>startReviewRequest(btn.dataset.startReview)));
    els.content.querySelectorAll("[data-approve]").forEach(btn=>btn.addEventListener("click",()=>approveRequest(btn.dataset.approve)));
    els.content.querySelectorAll("[data-reject]").forEach(btn=>btn.addEventListener("click",()=>rejectRequest(btn.dataset.reject)));
    els.content.querySelectorAll("[data-approval-view]").forEach(btn=>btn.addEventListener("click",()=>showRequestDetail(btn.dataset.approvalView)));
    els.content.querySelectorAll("[data-copy-approval-id]").forEach(btn=>btn.addEventListener("click",()=>copyRequestId(btn.dataset.copyApprovalId)));
  }

  function startReviewRequest(id) {
    if(!requirePermission("approval.start","Only Admin can start approval reviews.")) return;
    const r=state.requests.find(x=>x.id===id);
    if(!r || r.status!=="Submitted") return toast("Review unavailable","Only submitted requests can enter review.","error");
    applyTransition(r,"Under Review",{reviewStartedAt:new Date().toISOString()});
  }

  function openApprovalDecision(id, decision) {
    if(!requirePermission("approval.decide","Only Admin can approve or reject requests.")) return;
    const r=state.requests.find(x=>x.id===id);
    if(!r || r.status!=="Under Review") {
      return toast("Decision unavailable","Start review before recording a final decision.","error");
    }
    pendingApprovalDecision={id,decision};
    const rejecting=decision==="reject";
    els.approvalDecisionEyebrow.textContent=rejecting?"REJECTION DECISION":"APPROVAL DECISION";
    els.approvalDecisionTitle.textContent=`${rejecting?"Reject":"Approve"} ${r.id}`;
    els.approvalDecisionSummary.innerHTML=`
      <div><span>Owner</span><strong>${escapeHtml(r.vehicleOwner||r.containerOwner||r.requester||"Unavailable")}</strong></div>
      <div><span>Asset</span><strong>${escapeHtml(r.plateNumber||r.containerId||r.asset||"Unavailable")}</strong></div>
      ${r.refuelType==="vehicle"
        ? `<div><span>Route</span><strong>${escapeHtml(r.origin&&r.destination?`${r.origin} → ${r.destination}`:r.destination||r.location||"Unavailable")}</strong></div>`
        : `<div><span>Purpose</span><strong>${escapeHtml(r.purposeText||r.notes||r.purpose||"Unavailable")}</strong></div>`}
      <div><span>Waiting</span><strong>${escapeHtml(approvalAgeLabel(r))}</strong></div>`;
    els.approvalDecisionNoteLabel.textContent=rejecting?"Rejection reason":"Approval note";
    els.approvalDecisionRequirement.textContent=rejecting?"Required · provide at least 5 characters.":"Optional · add context for future audit review.";
    els.approvalDecisionNote.placeholder=rejecting?"Explain why this request is being rejected.":"Add any conditions, context, or reviewer notes.";
    els.approvalDecisionSubmit.textContent=rejecting?"Confirm rejection":"Confirm approval";
    els.approvalDecisionSubmit.className=`button ${rejecting?"danger":"primary"}`;
    els.approvalDecisionNote.value="";
    els.approvalDecisionCounter.textContent="0/500";
    els.approvalDecisionError.textContent="";
    els.approvalDecisionDialog.showModal();
    setTimeout(()=>els.approvalDecisionNote.focus(),0);
  }

  function commitApprovalDecision() {
    if(!pendingApprovalDecision) return;
    const {id,decision}=pendingApprovalDecision;
    const r=state.requests.find(x=>x.id===id);
    if(!r || r.status!=="Under Review") {
      els.approvalDecisionDialog.close();
      return toast("Decision unavailable","The request state changed before this decision was recorded.","error");
    }
    const note=String(els.approvalDecisionNote.value||"").trim();
    if(decision==="reject" && note.length<5) {
      els.approvalDecisionError.textContent="A rejection reason of at least 5 characters is required.";
      els.approvalDecisionNote.focus();
      return;
    }
    const now=new Date().toISOString();
    const extra={
      approver:currentActor(),
      reviewedAt:now,
      decisionAt:now,
      decisionType:decision==="reject"?"Rejected":"Approved",
      reviewComment:note
    };
    els.approvalDecisionDialog.close();
    if(decision==="reject") applyTransition(r,"Rejected",extra);
    else applyTransition(r,"Approved",extra);
  }

  function approvalsLoadingState() {
    return `<div class="page-head approvals-page-head">
      <div><div class="skeleton" style="width:280px;height:38px"></div><div class="skeleton" style="width:min(700px,82vw);height:16px;margin-top:10px"></div></div>
    </div>
    <div class="approval-kpi-grid">${Array.from({length:4},()=>`<div class="approval-kpi-card"><div class="skeleton" style="width:44px;height:44px"></div><div style="flex:1"><div class="skeleton" style="width:100px;height:12px"></div><div class="skeleton" style="width:80px;height:28px;margin-top:8px"></div></div></div>`).join("")}</div>
    <article class="panel"><div style="padding:18px">${Array.from({length:4},()=>'<div class="skeleton skeleton-row" style="height:100px"></div>').join("")}</div></article>`;
  }

  function tankCard(t) {
    const capacity=Number(t.capacity)||0;
    const level=Number(t.level)||0;
    const pct=capacity>0?Math.round(level/capacity*100):0;
    const low=inventoryIsLow(t);
    const updated=t.updatedAt?relativeTime(t.updatedAt):"Update time unavailable";
    return `<article class="tank-card lightfuel-tank-card ${low?"low":""}">
      <div class="tank-head">
        <div><h3>${escapeHtml(t.name||"Unnamed storage")}</h3><p>${escapeHtml(t.fuelType||"Fuel type unavailable")} · ${escapeHtml(t.location||"Location unavailable")}</p></div>
        <span class="status-pill ${low?"status-rejected":"status-approved"}">${low?"Reorder":"Healthy"}</span>
      </div>
      <div class="tank-level" role="progressbar" aria-label="${escapeAttr(t.name||"Storage")} stock level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.max(0,Math.min(100,pct))}"><span style="width:${Math.max(0,Math.min(100,pct))}%"></span></div>
      <div class="tank-stats">
        <span><strong>${formatLiters(level)}</strong> available</span>
        <span>${capacity?`${pct}% of ${formatLiters(capacity)}`:"Capacity unavailable"}</span>
      </div>
      <div class="lightfuel-tank-foot">
        <span>Reorder ${Number.isFinite(Number(t.reorder))?formatLiters(t.reorder):"not configured"}</span>
        <span>Updated ${escapeHtml(updated)}</span>
      </div>
    </article>`;
  }

  function barChart(series) {
    const max=Math.max(...series.map(x=>x.value),1);
    return `<div class="chart-bars">${series.map(x=>`<div class="bar-group"><div class="bar-value">${formatCompact(x.value)}</div><div class="bar-track"><div class="bar-fill" style="height:${Math.max(2,x.value/max*100)}%"></div></div><div class="bar-label">${escapeHtml(x.label)}</div></div>`).join("")}</div>`;
  }

  function kpi(label,value,foot,icon,trendClass) {
    return `<article class="kpi-card"><div class="kpi-top"><span>${escapeHtml(label)}</span><span class="kpi-icon">${escapeHtml(icon)}</span></div><div class="kpi-value">${escapeHtml(value)}</div><div class="kpi-foot"><span class="trend ${trendClass}">●</span> ${escapeHtml(foot)}</div></article>`;
  }

  function progressRow(label,value,pct) {
    return `<div class="status-row-card"><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(value)}</small><div class="progress"><span style="width:${Math.max(0,Math.min(100,pct))}%"></span></div></div><strong>${Math.round(pct)}%</strong></div>`;
  }

  function dashboardActivityItem(a) {
    const requestId=inferActivityRequestId(a);
    const linked=requestId?state.requests.some(r=>r.id===requestId):false;
    return `<div class="dashboard-activity-item">
      <span class="dashboard-activity-icon type-${escapeAttr(a.type||"system")}" aria-hidden="true">${escapeHtml(activityTypeIcon(a.type))}</span>
      <div class="dashboard-activity-copy">
        <strong>${escapeHtml(a.title||"Activity event")}</strong>
        <p>${escapeHtml(a.message||"No event message recorded.")}</p>
        <small>${escapeHtml(a.actor||"Actor unavailable")} · ${escapeHtml(relativeTime(a.at))}</small>
      </div>
      ${linked?`<button class="button ghost small" type="button" data-dashboard-request="${escapeAttr(requestId)}">Open</button>`:""}
    </div>`;
  }

  function filteredActivityItems() {
    const q=String(state.activityFilters.search||"").trim().toLowerCase();
    const now=Date.now();
    const startOfToday=new Date();
    startOfToday.setHours(0,0,0,0);
    const rows=authorizedActivity().filter(a=>{
      const requestId=inferActivityRequestId(a);
      const hay=[a.id,a.title,a.message,a.actor,a.actorEmail,a.actorRole,a.type,requestId,JSON.stringify(a.payload||{})].join(" ").toLowerCase();
      const at=new Date(a.at).getTime();
      let periodOk=true;
      if(state.activityFilters.period==="today") periodOk=at>=startOfToday.getTime();
      if(state.activityFilters.period==="7d") periodOk=at>=now-7*86400000;
      if(state.activityFilters.period==="30d") periodOk=at>=now-30*86400000;
      const linked=Boolean(requestId);
      const linkageOk=state.activityFilters.linkage==="all" ||
        (state.activityFilters.linkage==="linked"&&linked) ||
        (state.activityFilters.linkage==="unlinked"&&!linked);
      return (!q||hay.includes(q)) &&
        (state.activityFilters.type==="all"||a.type===state.activityFilters.type) &&
        (!state.activityFilters.actor||activityActorToken(a)===state.activityFilters.actor||String(a.actor||"").toLowerCase()===String(state.activityFilters.actor).toLowerCase()) &&
        periodOk && linkageOk;
    });
    const stamp=(value)=>{const n=Date.parse(value);return Number.isFinite(n)?n:0;};
    rows.sort((a,b)=>state.activityFilters.sort==="oldest"
      ? (stamp(a.at)-stamp(b.at)) || (Number(a.sequence||0)-Number(b.sequence||0))
      : (stamp(b.at)-stamp(a.at)) || (Number(b.sequence||0)-Number(a.sequence||0)));
    return rows;
  }

  function activityActorToken(activity) {
    const userId=String(activity?.actorUserId||"").trim();
    if(userId) return `uid:${userId}`;
    const email=String(activity?.actorEmail||"").trim().toLowerCase();
    if(email) return `email:${email}`;
    return `name:${String(activity?.actor||"Actor unavailable").trim().toLowerCase()}`;
  }

  function activityActorFilterMatchesSelection(token) {
    const selected=String(state.activityFilters.actor||"");
    if(!selected) return false;
    if(selected===token) return true;
    const legacyName=token.startsWith("name:")?token.slice(5):"";
    return Boolean(legacyName && selected.toLowerCase()===legacyName);
  }

  function activityActorValues() {
    const byToken=new Map();
    authorizedActivity().forEach(activity=>{
      const token=activityActorToken(activity);
      if(byToken.has(token)) return;
      const name=String(activity.actor||"Actor unavailable").trim()||"Actor unavailable";
      const email=String(activity.actorEmail||"").trim();
      byToken.set(token,{value:token,label:email?`${name} · ${email}`:name});
    });
    return [...byToken.values()].sort((a,b)=>a.label.localeCompare(b.label));
  }

  function inferActivityRequestId(activity) {
    if(activity?.requestId) return String(activity.requestId);
    const source=`${activity?.title||""} ${activity?.message||""}`;
    const match=source.match(/\bFTR-[A-Za-z0-9-]+\b/);
    return match?.[0]||"";
  }

  function groupActivityByDate(items) {
    const groups=[];
    const map=new Map();
    items.forEach(item=>{
      const date=new Date(item.at);
      const key=Number.isNaN(date.getTime())?"unknown":localDateKey(date);
      if(!map.has(key)) {
        const group={key,label:activityDateLabel(date),items:[]};
        map.set(key,group); groups.push(group);
      }
      map.get(key).items.push(item);
    });
    return groups;
  }

  function activityDateLabel(date) {
    if(Number.isNaN(date.getTime())) return "Unknown date";
    const today=localDateKey(new Date());
    const yesterdayDate=new Date(); yesterdayDate.setDate(yesterdayDate.getDate()-1);
    const key=localDateKey(date);
    if(key===today) return "Today";
    if(key===localDateKey(yesterdayDate)) return "Yesterday";
    return new Intl.DateTimeFormat(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"}).format(date);
  }

  function activityTypeLabel(type) {
    return ({submit:"Request",review:"Review",issue:"Issuance",system:"System"})[type]||"Activity";
  }

  function activityTypeIcon(type) {
    return ({submit:"↗",review:"✓",issue:"◈",system:"⚙"})[type]||"•";
  }

  function validActivityDate(value){const date=new Date(value);return Number.isNaN(date.getTime())?null:date;}
  function activityTimeLabel(value){const date=validActivityDate(value);return date?formatDateTime(date):"Timestamp unavailable";}

  function activityDateGroup(group) {
    return `<section class="activity-date-group">
      <div class="activity-date-heading"><span>${escapeHtml(group.label)}</span><span class="activity-date-line"></span></div>
      <div class="activity-event-list">
        ${group.items.map(activityEventCard).join("")}
      </div>
    </section>`;
  }

  function activityEventCard(a) {
    const requestId=inferActivityRequestId(a);
    const linkedRequest=requestId?state.requests.find(r=>r.id===requestId):null;
    return `<article class="activity-event-card">
      <div class="activity-event-icon type-${escapeAttr(a.type||"system")}" aria-hidden="true">${escapeHtml(activityTypeIcon(a.type))}</div>
      <div class="activity-event-main">
        <div class="activity-event-topline">
          <span class="activity-type-pill">${escapeHtml(activityTypeLabel(a.type))}</span>
          <time ${validActivityDate(a.at)?`datetime="${escapeAttr(a.at)}"`:""}>${escapeHtml(activityTimeLabel(a.at))}</time>
        </div>
        <h3>${escapeHtml(a.title||"Activity event")}</h3>
        <p>${escapeHtml(a.message||"No event message recorded.")}</p>
        <div class="activity-event-meta">
          <span><strong>Actor</strong> ${escapeHtml(a.actor||"Actor unavailable")}</span>
          ${requestId?`<span><strong>Request</strong> ${escapeHtml(requestId)}</span>`:""}
        </div>
      </div>
      <div class="activity-event-actions">
        ${linkedRequest?`<button class="button primary small" type="button" data-activity-request="${escapeAttr(linkedRequest.id)}">Open request</button>`:""}
        <button class="button secondary small" type="button" data-activity-detail="${escapeAttr(a.id)}">Details</button>
        <button class="button ghost small" type="button" data-copy-activity="${escapeAttr(a.id)}">Copy</button>
      </div>
    </article>`;
  }

  function bindActivityControls() {
    const debounce=(fn,wait=180)=>{let timer;return(...args)=>{clearTimeout(timer);timer=setTimeout(()=>fn(...args),wait);};};
    const persistDebounced = debounce(()=>persistActivityFilters(),240);
    $("activitySearch")?.addEventListener("input",e=>{
      state.activityFilters.search=e.target.value;
      state.activityVisibleCount=30;
      persistDebounced();
      updateActivityResults();
    });
    [["activityType","type"],["activityActor","actor"],["activityPeriod","period"],["activityLinkage","linkage"],["activitySort","sort"]].forEach(([id,key])=>{
      $(id)?.addEventListener("change",e=>{
        state.activityFilters[key]=e.target.value;
        state.activityVisibleCount=30;
        persistActivityFilters();
        updateActivityResults();
      });
    });
    $("activitySearch")?.addEventListener("keydown",e=>{
      if(e.key==="Escape" && state.activityFilters.search) {
        e.preventDefault();
        state.activityFilters.search="";
        e.currentTarget.value="";
        state.activityVisibleCount=30;
        persistActivityFilters();
        updateActivityResults();
      }
    });
    $("activityClear")?.addEventListener("click",()=>{
      state.activityFilters={search:"",type:"all",actor:"",period:"all",linkage:"all",sort:"newest"};
      state.activityVisibleCount=30;
      const values={activitySearch:"",activityType:"all",activityActor:"",activityPeriod:"all",activityLinkage:"all",activitySort:"newest"};
      Object.entries(values).forEach(([id,value])=>{const el=$(id);if(el)el.value=value;});
      persistActivityFilters();
      updateActivityResults({refreshActors:true});
      $("activitySearch")?.focus({preventScroll:true});
    });
    $("activityRefresh")?.addEventListener("click",()=>refreshActivityStream({announce:true}));
    els.content.querySelector('[data-action="activity-retry"]')?.addEventListener("click",()=>refreshActivityStream({announce:true}));
    $("activityExport")?.addEventListener("click",()=>exportActivityPdf(filteredActivityItems()));
    $("activityStream")?.addEventListener("click",handleActivityResultClick);
    $("activityLoadMore")?.addEventListener("click",handleActivityLoadMore);
  }

  async function refreshActivityStream({announce=false,silent=false}={}) {
    if(activityRefreshPromise) return activityRefreshPromise;
    if(document.hidden || state.route!=="activity") return false;
    state.activitySyncStatus="refreshing"; state.activityRefreshError=null;
    if(!silent) updateActivityResults();
    activityRefreshPromise=(async()=>{
      try {
        await globalThis.WMModuleActivity?.refresh?.();
        state.activity=[...(globalThis.WMModuleActivity?.items||[])];
        state.activityError=null; state.activityRefreshError=null; state.activitySyncStatus="current";
        state.activityLastRefreshAt=new Date().toISOString(); state.loadedAt=state.activityLastRefreshAt;
        updateActivityResults({refreshActors:true});
        if(announce) toast("Activity refreshed","The latest shared audit events were loaded from Supabase.","success");
        return true;
      } catch(error) {
        state.activityError=error?.message||"The activity stream could not be refreshed.";
        state.activityRefreshError=state.activityError; state.activitySyncStatus="error";
        renderActivity({preserveScroll:true});
        if(announce) toast("Activity refresh failed",state.activityError,"error");
        return false;
      } finally { activityRefreshPromise=null; }
    })();
    return activityRefreshPromise;
  }

  function configureActivityAutoRefresh(){
    if(activityRefreshTimer){clearInterval(activityRefreshTimer);activityRefreshTimer=null;}
    if(state.route!=="activity"||!hasPermission("activity.view.any")) return;
    activityRefreshTimer=setInterval(()=>{
      if(!document.hidden&&!document.querySelector("dialog[open]")&&!activityRefreshPromise) void refreshActivityStream({silent:true});
    },ACTIVITY_REFRESH_INTERVAL_MS);
  }

  function showActivityDetail(id) {
    if(!requirePermission("activity.view.any","Activity is restricted to Admin users.")) return;
    const a=state.activity.find(item=>item.id===id);
    if(!a) return toast("Activity unavailable","The selected activity entry no longer exists.","error");
    const requestId=inferActivityRequestId(a);
    const linkedRequest=requestId?state.requests.find(r=>r.id===requestId):null;
    els.activityDetailTitle.textContent=a.title||"Activity detail";
    els.activityDetailBody.innerHTML=`
      <div class="activity-detail-grid">
        ${detail("Event type",activityTypeLabel(a.type))}
        ${detail("Actor",a.actor||"Actor unavailable")}
        ${a.actorEmail?detail("Actor email",a.actorEmail):""}
        ${a.actorRole?detail("Role at event",a.actorRole):""}
        ${a.actorUserId?detail("Account ID",a.actorUserId):""}
        ${Number(a.sequence)>0?detail("Sequence",String(a.sequence)):""}
        ${detail("Occurred",activityTimeLabel(a.at))}
        ${detail("Relative time",relativeTime(a.at))}
        ${requestId?detail("Request ID",requestId):""}
        ${detail("Event ID",a.id||"Unavailable")}
        ${detail("Message",a.message||"No event message recorded.",true)}
      </div>`;
    els.activityDetailFooter.innerHTML=`
      <button class="button secondary" type="button" data-dialog-close="activityDetailDialog">Close</button>
      <button class="button secondary" type="button" data-copy-activity-dialog="${escapeAttr(a.id)}">Copy event</button>
      ${linkedRequest?`<button class="button primary" type="button" data-activity-request-dialog="${escapeAttr(linkedRequest.id)}">Open request</button>`:""}`;
    els.activityDetailFooter.querySelector("[data-copy-activity-dialog]")?.addEventListener("click",()=>copyActivityEvent(a.id));
    els.activityDetailFooter.querySelector("[data-activity-request-dialog]")?.addEventListener("click",()=>{
      els.activityDetailDialog.close(); showRequestDetail(linkedRequest.id);
    });
    els.activityDetailDialog.showModal();
  }

  async function copyActivityEvent(id) {
    if(!requirePermission("activity.view.any","Activity is restricted to Admin users.")) return;
    const a=state.activity.find(item=>item.id===id);
    if(!a) return toast("Activity unavailable","The selected activity entry no longer exists.","error");
    const requestId=inferActivityRequestId(a);
    const text=[
      a.title||"Activity event",
      a.message||"",
      `Type: ${activityTypeLabel(a.type)}`,
      `Actor: ${a.actor||"Actor unavailable"}`,
      a.actorEmail?`Actor email: ${a.actorEmail}`:"",
      a.actorRole?`Role: ${a.actorRole}`:"",
      `Time: ${activityTimeLabel(a.at)}`,
      requestId?`Request: ${requestId}`:"",
      a.id?`Event ID: ${a.id}`:""
    ].filter(Boolean).join("\n");
    try {
      if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const area=document.createElement("textarea");
        area.value=text; area.style.position="fixed"; area.style.opacity="0";
        document.body.appendChild(area); area.select(); document.execCommand("copy"); area.remove();
      }
      toast("Activity copied","Event details were copied to the clipboard.","success");
    } catch {
      toast("Copy unavailable","The browser could not copy this activity event.","error");
    }
  }


  function activityLoadingState() {
    return `<div class="page-head activity-page-head">
      <div><div class="skeleton" style="width:290px;height:38px"></div><div class="skeleton" style="width:min(660px,82vw);height:16px;margin-top:10px"></div></div>
    </div>
    <article class="panel"><div style="padding:18px">${Array.from({length:6},()=>'<div class="skeleton skeleton-row" style="height:92px"></div>').join("")}</div></article>`;
  }

  function accessDeniedState(title,message) {
    return `<div class="access-denied-state">
      <div class="access-denied-icon" aria-hidden="true">⊘</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <button class="button primary" type="button" data-access-home>Return to Dashboard</button>
    </div>`;
  }

  function emptyState(title,message){return `<div class="empty-state"><div class="empty-icon">◌</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></div>`;}
  function detail(label,value,full=false){return `<div class="detail-item ${full?"full":""}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;}

  function vehicleByPlate(plateNumber) {
    const value = String(plateNumber || "").trim();
    return VEHICLE_DIRECTORY.find(vehicle => vehicle.plateNumber === value) || null;
  }

  function vehicleByOwner(vehicleOwner) {
    const value = String(vehicleOwner || "").trim();
    return VEHICLE_DIRECTORY.find(vehicle => vehicle.vehicleOwner === value) || null;
  }

  function clearFieldError(id) {
    $(id)?.classList.remove("invalid");
    const error = els.content.querySelector(`[data-error-for="${CSS.escape(id)}"]`);
    if (error) error.textContent = "";
  }

  function studioSelectField(id,label,values,placeholder,required=false,icon="") {
    return `<label class="reference-field studio-field"><span class="reference-label">${icon?`<i aria-hidden="true">${escapeHtml(icon)}</i>`:""}${escapeHtml(label)} ${required?'<b aria-hidden="true">*</b>':""}</span><div class="studio-select-wrap"><select id="${id}" class="reference-input studio-select"><option value="">${escapeHtml(placeholder)}</option>${values.map(v=>`<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join("")}</select><span aria-hidden="true">⌄</span></div><small class="field-error" data-error-for="${id}"></small></label>`;
  }

  function studioNumberField(id,label,help,required=false,icon="",min=0,max="") {
    return `<label class="reference-field studio-field"><span class="reference-label">${icon?`<i aria-hidden="true">${escapeHtml(icon)}</i>`:""}${escapeHtml(label)} ${required?'<b aria-hidden="true">*</b>':""}</span><div class="studio-number-wrap"><input id="${id}" class="reference-input" type="number" inputmode="decimal" min="${escapeAttr(min)}" ${max!==""?`max="${escapeAttr(max)}"`:""} placeholder="0" />${help?`<span>${escapeHtml(help)}</span>`:""}</div><small class="field-error" data-error-for="${id}"></small></label>`;
  }

  function referenceSuggestField(id,label,values,placeholder,required=false,icon="") {
    const listId=`${id}Options`;
    return `<label class="reference-field"><span class="reference-label">${icon?`<i aria-hidden="true">${escapeHtml(icon)}</i>`:""}${escapeHtml(label)} ${required?'<b aria-hidden="true">*</b>':""}</span><div class="reference-control has-chevron"><input id="${id}" class="reference-input" type="text" list="${listId}" autocomplete="off" placeholder="${escapeAttr(placeholder)}" /><span class="reference-chevron" aria-hidden="true">⌄</span></div><datalist id="${listId}">${values.map(v=>`<option value="${escapeAttr(v)}"></option>`).join("")}</datalist><small class="field-error" data-error-for="${id}"></small></label>`;
  }

  function referenceTextField(id,label,placeholder,required=false,icon="") {
    return `<label class="reference-field"><span class="reference-label">${icon?`<i aria-hidden="true">${escapeHtml(icon)}</i>`:""}${escapeHtml(label)} ${required?'<b aria-hidden="true">*</b>':""}</span><input id="${id}" class="reference-input" type="text" autocomplete="off" placeholder="${escapeAttr(placeholder)}" /><small class="field-error" data-error-for="${id}"></small></label>`;
  }

  function referenceNumberField(id,label,value,help,required=false,icon="",min=0,max="") {
    return `<label class="reference-field ${id==="odometer"||id==="distanceKm"?"full":""}"><span class="reference-label">${icon?`<i aria-hidden="true">${escapeHtml(icon)}</i>`:""}${escapeHtml(label)} ${required?'<b aria-hidden="true">*</b>':""}</span><input id="${id}" class="reference-input" type="number" inputmode="decimal" value="${escapeAttr(value)}" min="${escapeAttr(min)}" ${max!==""?`max="${escapeAttr(max)}"`:""} />${help?`<small class="reference-help">${escapeHtml(help)}</small>`:""}<small class="field-error" data-error-for="${id}"></small></label>`;
  }

  function fieldInput(id,label,type,value,placeholder,min="",max=""){
    return `<label class="field"><span>${escapeHtml(label)}</span><input id="${id}" class="input" type="${type}" value="${escapeAttr(value)}" placeholder="${escapeAttr(placeholder)}" ${min?`min="${min}"`:""} ${max?`max="${max}"`:""} /><small class="field-error" data-error-for="${id}"></small></label>`;
  }

  function fieldSuggest(id,label,values,placeholder){
    const listId=`${id}Suggestions`;
    return `<label class="field"><span>${escapeHtml(label)}</span><input id="${id}" class="input" type="text" list="${listId}" placeholder="${escapeAttr(placeholder)}" autocomplete="off" /><datalist id="${listId}">${values.map(v=>`<option value="${escapeAttr(v)}"></option>`).join("")}</datalist><small class="field-error" data-error-for="${id}"></small></label>`;
  }

  function fieldSelect(id,label,values,placeholder){
    return `<label class="field"><span>${escapeHtml(label)}</span><select id="${id}" class="select"><option value="">${escapeHtml(placeholder)}</option>${values.map(v=>`<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join("")}</select><small class="field-error" data-error-for="${id}"></small></label>`;
  }

  function selectHtml(id,values,current,placeholder){
    return `<select id="${id}" class="select">${values.map((v,i)=>`<option value="${escapeAttr(v)}" ${v===current?"selected":""}>${escapeHtml(i===0&&v===""?placeholder:v)}</option>`).join("")}</select>`;
  }

  function statusPill(status){return `<span class="status-pill status-${statusClass(status)}">${escapeHtml(status)}</span>`;}
  function priorityPill(priority){return `<span class="priority-pill priority-${priority.toLowerCase()}">${escapeHtml(priority)}</span>`;}
  function statusClass(status){return {"Draft":"draft","Submitted":"submitted","Under Review":"review","Approved":"approved","Rejected":"rejected","Issued":"issued","Completed":"completed","Cancelled":"cancelled"}[status]||"draft";}

  function persistActivityFilters(){
    state.prefs.activityFilters=normalizeActivityFilters(state.activityFilters);
    saveJson(KEYS.prefs,state.prefs);
  }
  function queueActivityFilterPersistence(){
    clearTimeout(activityFilterPersistTimer);
    activityFilterPersistTimer=setTimeout(()=>{
      state.prefs.activityFilters=normalizeActivityFilters(state.activityFilters);
      const payload=JSON.stringify(state.prefs);
      globalThis.WMModuleStore?.setItemAsync?.(KEYS.prefs,payload).catch(error=>console.warn("Activity filter preferences were not persisted.",error));
    },300);
  }

  function newActivityEvent(type,title,message,requestId="",payload={}){
    return {id:uid("act"),type,title,message,requestId:String(requestId||""),payload:payload&&typeof payload==="object"?payload:{}};
  }

  async function commitRequestsWithActivity(event){
    const result=await globalThis.WMModuleStore.commitWithActivity(KEYS.requests,JSON.stringify(state.requests),event);
    state.activity=[...(globalThis.WMModuleActivity?.items||state.activity)];
    autoRefresh.lastSignature=storageRevisionSignature();autoRefresh.lastSuccessAt=Date.now();autoRefresh.lastAttemptAt=Date.now();updateAutoRefreshStatus("current");
    return result;
  }

  async function logActivity(type,title,message,actor){
    const event=newActivityEvent(type,title,message,inferActivityRequestId({title,message}),{source:"fueltrack-plus"});
    try{const saved=await globalThis.WMModuleActivity.append(event);state.activity=[...(globalThis.WMModuleActivity.items||[])];return saved;}catch(error){toast("Activity not recorded",error?.message||"The audit event could not be committed to the shared activity stream.","error");throw error;}
  }
  function activityEntry(type,title,message,actor){
    const source=`${title||""} ${message||""}`;
    const requestId=source.match(/\bFTR-[A-Za-z0-9-]+\b/)?.[0]||"";
    return {id:uid("act"),type,title,message,actor,actorUserId:CLOUD_IDENTITY?.user?.id||null,requestId,at:new Date().toISOString()};
  }

  function updateBadges(){
    const n=state.requests.filter(r=>["Submitted","Under Review"].includes(r.status)).length;
    els.approvalNavBadge.textContent=String(n);
    els.approvalNavBadge.hidden=n===0;
    els.notificationDot.hidden=n===0 && !state.inventory.some(t=>t.reorder!==null && t.reorder!==undefined && Number(t.level)<=Number(t.reorder));
  }

  function toggleTheme(){
    const isLight=document.documentElement.classList.toggle("light");
    state.prefs.theme=isLight?"light":"dark";
    saveJson(KEYS.prefs,state.prefs);
  }

  function openSidebar(){els.sidebar.classList.add("open");els.sidebarBackdrop.classList.add("show");}
  function closeSidebar(){els.sidebar.classList.remove("open");els.sidebarBackdrop.classList.remove("show");}


  function exportRequestsPdf(rows=state.requests,options={}) {
    if(!requirePermission("request.export","Only Admin can export request reports.")) return;
    if(!Array.isArray(rows)||!rows.length) return toast("Nothing to export","No request records are available for the current selection.","error");
    const title=options.title||"FuelTrack+ Request Register";
    const subtitle=options.subtitle||"Persisted request records";
    const metadata=[
      ["Records",String(rows.length)],
      ["Generated",formatDateTime(new Date())],
      ["Scope",subtitle],
      ["Source","FuelTrack+ shared cloud workspace"]
    ];
    const columns=[
      {key:"id",label:"Request ID",weight:1.2},
      {key:"owner",label:"Owner / Requester",weight:1.55},
      {key:"asset",label:"Asset",weight:1.15},
      {key:"type",label:"Refuel Type",weight:1.0},
      {key:"purpose",label:"Purpose",weight:2.1},
      {key:"context",label:"Route / Context",weight:1.55},
      {key:"priority",label:"Priority",weight:.72},
      {key:"status",label:"Status",weight:.82},
      {key:"updated",label:"Last Updated",weight:1.2},
      {key:"refueling",label:"Completion Details",weight:1.7}
    ];
    const data=rows.map(r=>({
      id:r.id||"",
      owner:r.vehicleOwner||r.containerOwner||r.requester||"",
      asset:r.plateNumber||r.containerId||r.asset||"",
      type:r.refuelType==="container"?"Container Refill":r.refuelType==="vehicle"?"Vehicle Fuel":"Legacy",
      purpose:r.purposeText||r.notes||r.purpose||"",
      context:r.refuelType==="vehicle"
        ? [r.origin,r.destination||r.location].filter(Boolean).join(" -> ")
        : (r.containerType||"Container request"),
      priority:r.priority||"",
      status:r.status||"",
      updated:formatDateTime(new Date(r.updatedAt||r.createdAt)),
      refueling:r.refuelingDetails
        ? `Amount ${money(r.refuelingDetails.amount)} | Invoice ${r.refuelingDetails.invoiceNumber||"-"} | ${Number(r.refuelingDetails.fuelQuantityLiters||0).toLocaleString(undefined,{maximumFractionDigits:2})} L${r.refuelingDetails.receiptPhoto?.dataUrl?" | Receipt attached":""}`
        : ""
    }));
    createPdfReport({
      title,subtitle,metadata,columns,rows:data,
      filename:`FuelTrackPlus_Requests_${localDateKey(new Date())}.pdf`,
      orientation:"landscape"
    });
  }

  function exportAnalyticsPdf(rows) {
    if(!requirePermission("analytics.export","Only Admin can export Analytics reports.")) return;
    if(!Array.isArray(rows)||!rows.length) return toast("Nothing to export","No requests match the current analytics view.","error");
    const filters=[];
    if(state.analyticsFilters.department) filters.push(`Department: ${state.analyticsFilters.department}`);
    if(state.analyticsFilters.status) filters.push(`Status: ${state.analyticsFilters.status}`);
    if(state.analyticsFilters.location) filters.push(`Location / Context: ${state.analyticsFilters.location}`);
    exportRequestsPdf(rows,{
      title:"FuelTrack+ Analytics Report",
      subtitle:`${analyticsPeriodLabel()}${filters.length?` | ${filters.join(" | ")}`:" | No dimension filters"}`
    });
  }

  function exportApprovalsPdf(rows) {
    if(!requirePermission("approval.export","Only Admin can export the approval queue.")) return;
    if(!Array.isArray(rows)||!rows.length) return toast("Nothing to export","No approval queue records match the current view.","error");
    const metadata=[
      ["Queue records",String(rows.length)],
      ["Generated",formatDateTime(new Date())],
      ["Sort",state.approvalFilters.sort||"oldest"],
      ["Stage filter",state.approvalFilters.stage||"All stages"]
    ];
    const columns=[
      {key:"id",label:"Request ID",weight:1.15},
      {key:"owner",label:"Owner / Asset",weight:1.8},
      {key:"type",label:"Refuel Type",weight:1.0},
      {key:"purpose",label:"Purpose",weight:2.35},
      {key:"context",label:"Route / Context",weight:1.65},
      {key:"priority",label:"Priority",weight:.78},
      {key:"stage",label:"Queue Stage",weight:1.0},
      {key:"waiting",label:"Waiting",weight:.8},
      {key:"created",label:"Submitted",weight:1.2}
    ];
    const data=rows.map(r=>({
      id:r.id||"",
      owner:`${r.vehicleOwner||r.containerOwner||r.requester||""}${r.plateNumber||r.containerId||r.asset?` | ${r.plateNumber||r.containerId||r.asset}`:""}`,
      type:r.refuelType==="container"?"Container Refill":r.refuelType==="vehicle"?"Vehicle Fuel":"Legacy",
      purpose:r.purposeText||r.notes||r.purpose||"",
      context:r.refuelType==="vehicle"
        ? [r.origin,r.destination||r.location].filter(Boolean).join(" -> ")
        : (r.containerType||"Container request"),
      priority:r.priority||"",
      stage:r.status||"",
      waiting:approvalAgeLabel(r),
      created:formatDateTime(new Date(r.createdAt))
    }));
    createPdfReport({
      title:"FuelTrack+ Approval Queue",
      subtitle:"Current approval decision queue",
      metadata,columns,rows:data,
      filename:`FuelTrackPlus_Approvals_${localDateKey(new Date())}.pdf`,
      orientation:"landscape"
    });
  }

  function exportInventoryPdf(rows=state.inventory) {
    if(!requirePermission("lightfuels.export","Only Admin can export inventory reports.")) return;
    if(!Array.isArray(rows)||!rows.length) return toast("Nothing to export","No inventory records are available.","error");
    const summary=lightFuelSummary(rows);
    const columns=[
      {key:"name",label:"Storage",weight:1.4},
      {key:"fuelType",label:"Fuel Type",weight:1.1},
      {key:"location",label:"Location",weight:1.3},
      {key:"capacity",label:"Capacity",weight:.95},
      {key:"level",label:"Current Level",weight:1.0},
      {key:"reorder",label:"Reorder Level",weight:1.0},
      {key:"health",label:"Health",weight:.9},
      {key:"updated",label:"Updated",weight:1.2}
    ];
    const data=rows.map(item=>({
      name:item.name||item.id||"",
      fuelType:item.fuelType||"",
      location:item.location||"",
      capacity:Number.isFinite(Number(item.capacity))?formatLiters(item.capacity):"Unavailable",
      level:Number.isFinite(Number(item.level))?formatLiters(item.level):"Unavailable",
      reorder:Number.isFinite(Number(item.reorder))?formatLiters(item.reorder):"Not configured",
      health:inventoryIsLow(item)?"Low / reorder":"Healthy",
      updated:item.updatedAt?formatDateTime(new Date(item.updatedAt)):"Unavailable"
    }));
    createPdfReport({
      title:"FuelTrack+ LightFuels Inventory",
      subtitle:"Persisted inventory register",
      metadata:[
        ["Inventory records",String(summary.records)],
        ["Available stock",formatLiters(summary.level)],
        ["Low stock",String(summary.lowStock)],
        ["Generated",formatDateTime(new Date())]
      ],
      columns,rows:data,
      filename:`FuelTrackPlus_Inventory_${localDateKey(new Date())}.pdf`,
      orientation:"landscape"
    });
  }

  function exportActivityPdf(rows) {
    if(!requirePermission("activity.export","Only Admin can export the Activity log.")) return;
    if(!Array.isArray(rows)||!rows.length) return toast("Nothing to export","No activity events match the current view.","error");
    const columns=[
      {key:"time",label:"Occurred",weight:1.25},
      {key:"type",label:"Type",weight:.8},
      {key:"title",label:"Event",weight:1.35},
      {key:"message",label:"Message",weight:2.8},
      {key:"actor",label:"Actor",weight:1.15},
      {key:"request",label:"Request ID",weight:1.1}
    ];
    const data=rows.map(a=>({
      time:activityTimeLabel(a.at),
      type:activityTypeLabel(a.type),
      title:a.title||"",
      message:a.message||"",
      actor:a.actor||"",
      request:inferActivityRequestId(a)||""
    }));
    createPdfReport({
      title:"FuelTrack+ Activity Log",
      subtitle:"Filtered operational audit trail",
      metadata:[
        ["Events",String(rows.length)],
        ["Period",state.activityFilters.period==="all"?"All time":state.activityFilters.period],
        ["Event type",state.activityFilters.type==="all"?"All types":activityTypeLabel(state.activityFilters.type)],
        ["Linkage",state.activityFilters.linkage==="all"?"All events":state.activityFilters.linkage==="linked"?"Linked requests":"Unlinked events"],
        ["Generated",formatDateTime(new Date())]
      ],
      columns,rows:data,
      filename:`FuelTrackPlus_Activity_${localDateKey(new Date())}.pdf`,
      orientation:"landscape"
    });
  }

  function createPdfReport({title,subtitle="",metadata=[],columns=[],rows=[],filename="FuelTrackPlus_Report.pdf",orientation="portrait"}) {
    try {
      const pdf=buildPdfDocument({title,subtitle,metadata,columns,rows,orientation});
      const blob=new Blob([pdf],{type:"application/pdf"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;
      link.download=filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1200);
      toast("PDF export created",`${rows.length} record${rows.length===1?"":"s"} exported to ${filename}.`,"success");
    } catch(error) {
      console.error("PDF export failed",error);
      toast("PDF export failed","FuelTrack+ could not generate this PDF report.","error");
    }
  }

  function buildPdfDocument({title,subtitle,metadata,columns,rows,orientation}) {
    const landscape=orientation==="landscape";
    const pageW=landscape?841.89:595.28;
    const pageH=landscape?595.28:841.89;
    const margin=34;
    const footerH=28;
    const contentW=pageW-margin*2;
    const topY=pageH-margin;
    const bottomY=margin+footerH;
    const fontBody="F1",fontBold="F2";
    const pages=[];
    let page=null;

    const widths=pdfColumnWidths(columns,contentW);
    const xPositions=[];
    let runningX=margin;
    widths.forEach(w=>{xPositions.push(runningX);runningX+=w;});

    const beginPage=()=>{
      page={ops:[],cursorY:topY};
      pages.push(page);
      pdfDrawHeader(page,{title,subtitle,pageW,margin,fontBody,fontBold});
      page.cursorY-=62;
      if(metadata?.length) {
        page.cursorY=pdfDrawMetadata(page,metadata,{x:margin,y:page.cursorY,width:contentW,fontBody,fontBold});
        page.cursorY-=14;
      }
      page.cursorY=pdfDrawTableHeader(page,{columns,widths,xPositions,y:page.cursorY,fontBody,fontBold});
    };

    beginPage();

    for(const row of rows) {
      const layout=pdfLayoutTableRow(row,columns,widths,8.4,2.4);
      if(page.cursorY-layout.height<bottomY) {
        beginPage();
      }
      page.cursorY=pdfDrawTableRow(page,{row,layout,columns,widths,xPositions,y:page.cursorY,fontBody});
    }

    if(!rows.length) {
      pdfText(page,margin,page.cursorY-10,"No records available.",11,fontBody);
    }

    pages.forEach((p,index)=>{
      pdfDrawFooter(p,{pageW,margin,pageNumber:index+1,pageCount:pages.length,fontBody});
    });

    return pdfAssemble(pages,{pageW,pageH,title,fontBody,fontBold});
  }

  function pdfColumnWidths(columns,totalWidth) {
    const weights=columns.map(c=>Math.max(.25,Number(c.weight)||1));
    const total=weights.reduce((a,b)=>a+b,0)||1;
    return weights.map(w=>totalWidth*w/total);
  }

  function pdfDrawHeader(page,{title,subtitle,pageW,margin,fontBody,fontBold}) {
    pdfFillRect(page,margin,page.cursorY-38,pageW-margin*2,38,.055,.11,.16);
    pdfFillRect(page,margin,page.cursorY-38,5,38,.24,.82,.68);
    pdfText(page,margin+16,page.cursorY-17,pdfSafeText(title),18,fontBold,1,1,1);
    if(subtitle) pdfText(page,margin+16,page.cursorY-31,pdfSafeText(subtitle),8.5,fontBody,.68,.76,.84);
    pdfText(page,pageW-margin-142,page.cursorY-18,"FuelTrack+ Operations V3",8.5,fontBold,.24,.82,.68);
    pdfText(page,pageW-margin-142,page.cursorY-31,"Generated locally from persisted data",7.2,fontBody,.62,.69,.76);
  }

  function pdfDrawMetadata(page,metadata,{x,y,width,fontBody,fontBold}) {
    const gap=6;
    const cols=Math.min(4,Math.max(1,metadata.length));
    const cellW=(width-gap*(cols-1))/cols;
    const rows=Math.ceil(metadata.length/cols);
    const cellH=33;
    metadata.forEach((item,index)=>{
      const col=index%cols,row=Math.floor(index/cols);
      const cx=x+col*(cellW+gap),cy=y-row*(cellH+gap);
      pdfFillRect(page,cx,cy-cellH,cellW,cellH,.965,.973,.98);
      pdfStrokeRect(page,cx,cy-cellH,cellW,cellH,.84,.88,.91,.55);
      pdfText(page,cx+7,cy-11,pdfSafeText(item[0]),6.8,fontBold,.40,.48,.56);
      const wrapped=pdfWrapText(item[1],cellW-14,8.2,fontBold).slice(0,2);
      wrapped.forEach((line,i)=>pdfText(page,cx+7,cy-23-i*9,pdfSafeText(line),8.2,fontBold,.10,.16,.22));
    });
    return y-rows*(cellH+gap)+gap;
  }

  function pdfDrawTableHeader(page,{columns,widths,xPositions,y,fontBold}) {
    const h=24;
    pdfFillRect(page,xPositions[0],y-h,widths.reduce((a,b)=>a+b,0),h,.075,.13,.19);
    columns.forEach((col,i)=>{
      pdfText(page,xPositions[i]+5,y-15,pdfSafeText(col.label),7.4,fontBold,1,1,1);
      if(i) pdfLine(page,xPositions[i],y-h,xPositions[i],y,.16,.23,.30,.8);
    });
    return y-h;
  }

  function pdfLayoutTableRow(row,columns,widths,fontSize,lineGap) {
    const cells=columns.map((col,i)=>pdfWrapText(row?.[col.key]??"",Math.max(18,widths[i]-10),fontSize,"F1"));
    const maxLines=Math.max(1,...cells.map(lines=>lines.length));
    const lineHeight=fontSize+lineGap;
    const height=Math.max(24,maxLines*lineHeight+10);
    return {cells,height,lineHeight,fontSize};
  }

  function pdfDrawTableRow(page,{layout,widths,xPositions,y,fontBody}) {
    const rowIndex=page.ops.filter(op=>op.startsWith("%ROW")).length;
    page.ops.push(`%ROW${rowIndex}`);
    if(rowIndex%2===1) pdfFillRect(page,xPositions[0],y-layout.height,widths.reduce((a,b)=>a+b,0),layout.height,.975,.98,.984);
    pdfLine(page,xPositions[0],y-layout.height,xPositions[0]+widths.reduce((a,b)=>a+b,0),y-layout.height,.85,.88,.91,.55);
    layout.cells.forEach((lines,i)=>{
      lines.forEach((line,lineIndex)=>{
        const ty=y-10-lineIndex*layout.lineHeight;
        pdfText(page,xPositions[i]+5,ty,pdfSafeText(line),layout.fontSize,fontBody,.12,.18,.24);
      });
      if(i) pdfLine(page,xPositions[i],y-layout.height,xPositions[i],y,.90,.92,.94,.45);
    });
    return y-layout.height;
  }

  function pdfDrawFooter(page,{pageW,margin,pageNumber,pageCount,fontBody}) {
    const y=22;
    pdfLine(page,margin,y+10,pageW-margin,y+10,.82,.86,.90,.55);
    pdfText(page,margin,y,"FuelTrack+ | PDF Export",7.3,fontBody,.43,.50,.57);
    const text=`Page ${pageNumber} of ${pageCount}`;
    pdfText(page,pageW-margin-pdfApproxTextWidth(text,7.3),y,text,7.3,fontBody,.43,.50,.57);
  }

  function pdfWrapText(value,maxWidth,fontSize,fontName) {
    const text=pdfSafeText(value);
    if(!text) return [""];
    const words=text.split(/\s+/);
    const lines=[];
    let line="";
    for(const word of words) {
      const candidate=line?`${line} ${word}`:word;
      if(pdfApproxTextWidth(candidate,fontSize)<=maxWidth) {
        line=candidate;
      } else if(!line) {
        const chunks=pdfBreakLongWord(word,maxWidth,fontSize);
        lines.push(...chunks.slice(0,-1));
        line=chunks[chunks.length-1]||"";
      } else {
        lines.push(line);
        if(pdfApproxTextWidth(word,fontSize)<=maxWidth) line=word;
        else {
          const chunks=pdfBreakLongWord(word,maxWidth,fontSize);
          lines.push(...chunks.slice(0,-1));
          line=chunks[chunks.length-1]||"";
        }
      }
    }
    if(line||!lines.length) lines.push(line);
    return lines;
  }

  function pdfBreakLongWord(word,maxWidth,fontSize) {
    const out=[]; let part="";
    for(const ch of word) {
      if(part && pdfApproxTextWidth(part+ch,fontSize)>maxWidth) {
        out.push(part); part=ch;
      } else part+=ch;
    }
    if(part) out.push(part);
    return out.length?out:[""];
  }

  function pdfApproxTextWidth(text,fontSize) {
    let units=0;
    for(const ch of String(text??"")) {
      if("ilI.,'`!|:;".includes(ch)) units+=.28;
      else if("MW@#%&".includes(ch)) units+=.88;
      else if(ch===" ") units+=.28;
      else units+=.54;
    }
    return units*fontSize;
  }

  function pdfSafeText(value) {
    return String(value??"")
      .replaceAll("₱","PHP ")
      .replaceAll("→","->")
      .replaceAll("↗","->")
      .replaceAll("•","-")
      .replaceAll("·","-")
      .replaceAll("–","-")
      .replaceAll("—","-")
      .replaceAll("“",'"').replaceAll("”",'"')
      .replaceAll("’","'")
      .replace(/[^\x20-\x7E\xA0-\xFF]/g,"?");
  }

  function pdfEscapeLiteral(value) {
    return pdfSafeText(value).replaceAll("\\","\\\\").replaceAll("(","\\(").replaceAll(")","\\)");
  }

  function pdfText(page,x,y,text,size,font="F1",r=0,g=0,b=0) {
    page.ops.push(`BT /${font} ${size.toFixed(2)} Tf ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEscapeLiteral(text)}) Tj ET`);
  }

  function pdfFillRect(page,x,y,w,h,r,g,b) {
    page.ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }

  function pdfStrokeRect(page,x,y,w,h,r,g,b,lineWidth=1) {
    page.ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG ${lineWidth.toFixed(2)} w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S`);
  }

  function pdfLine(page,x1,y1,x2,y2,r,g,b,lineWidth=1) {
    page.ops.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG ${lineWidth.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  function pdfAssemble(pages,{pageW,pageH,title}) {
    const objects=[];
    const add=obj=>{objects.push(obj);return objects.length;};
    const fontRegular=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const fontBold=add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const pageRefs=[];
    const contentRefs=[];

    pages.forEach(page=>{
      const stream=page.ops.join("\n");
      contentRefs.push(add(`<< /Length ${pdfByteLength(stream)} >>\nstream\n${stream}\nendstream`));
      pageRefs.push(0);
    });

    const pagesObjIndex=objects.length+1;
    objects.push(""); // placeholder /Pages

    pages.forEach((page,index)=>{
      pageRefs[index]=add(`<< /Type /Page /Parent ${pagesObjIndex} 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontBold} 0 R >> >> /Contents ${contentRefs[index]} 0 R >>`);
    });

    objects[pagesObjIndex-1]=`<< /Type /Pages /Kids [${pageRefs.map(ref=>`${ref} 0 R`).join(" ")}] /Count ${pageRefs.length} >>`;
    const catalog=add(`<< /Type /Catalog /Pages ${pagesObjIndex} 0 R >>`);
    const info=add(`<< /Title (${pdfEscapeLiteral(title)}) /Creator (FuelTrack+ v3) /Producer (FuelTrack+ Local PDF Engine) >>`);

    let out="%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets=[0];
    objects.forEach((obj,index)=>{
      offsets[index+1]=pdfByteLength(out);
      out+=`${index+1} 0 obj\n${obj}\nendobj\n`;
    });
    const xrefOffset=pdfByteLength(out);
    out+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
    for(let i=1;i<=objects.length;i++) out+=`${String(offsets[i]).padStart(10,"0")} 00000 n \n`;
    out+=`trailer\n<< /Size ${objects.length+1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return pdfBinaryBytes(out);
  }

  function pdfByteLength(binaryString) {
    return binaryString.length;
  }

  function pdfBinaryBytes(binaryString) {
    const bytes=new Uint8Array(binaryString.length);
    for(let i=0;i<binaryString.length;i++) bytes[i]=binaryString.charCodeAt(i)&255;
    return bytes;
  }

  function nextRequestId(){
    const d=new Date(),ym=`${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,"0")}`;
    const nums=state.requests.map(r=>Number(String(r.id).split("-").pop())).filter(Number.isFinite);
    return `FTR-${ym}-${String(Math.max(1000,...nums)+1)}`;
  }

  function uniqueValues(key, includeInventory=false){
    const values=new Set();
    state.requests.forEach(r=>{const v=String(r?.[key]||"").trim(); if(v) values.add(v);});
    if(includeInventory) state.inventory.forEach(r=>{const v=String(r?.[key]||"").trim(); if(v) values.add(v);});
    return [...values].sort((a,b)=>a.localeCompare(b));
  }
  function currentActor(){return AUTHENTICATED_NAME;}
  function normalizeText(v){return String(v||"").trim().toLocaleLowerCase();}
  function formatOptionalMoney(n){return Number.isFinite(Number(n)) && n!==null && n!=="" ? money(Number(n)) : "Unavailable";}
  function priorityRank(p){return {High:3,Medium:2,Low:1}[p]||0;}
  function round2(n){return Math.round((Number(n)+Number.EPSILON)*100)/100;}
  function money(n){return new Intl.NumberFormat(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);}
  function formatLiters(n){return `${new Intl.NumberFormat(undefined,{maximumFractionDigits:0}).format(Number(n)||0)} L`;}
  function formatOptionalLiters(n){return Number.isFinite(Number(n)) && Number(n)>0 ? formatLiters(Number(n)) : "Unavailable";}
  function formatCompact(n){return new Intl.NumberFormat(undefined,{notation:"compact",maximumFractionDigits:1}).format(Number(n)||0);}
  function localDateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
  function shortDate(v){if(!v)return"—";const d=new Date(`${v}T00:00:00`);return new Intl.DateTimeFormat(undefined,{month:"short",day:"2-digit"}).format(d);}
  function formatDateTime(d){if(Number.isNaN(d.getTime()))return"—";return new Intl.DateTimeFormat(undefined,{month:"short",day:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(d);}
  function relativeTime(iso){
    const ms=Date.now()-new Date(iso).getTime(),min=Math.max(0,Math.floor(ms/60000));
    if(min<1)return"just now"; if(min<60)return`${min} min ago`; const h=Math.floor(min/60); if(h<24)return`${h} hr ago`; return`${Math.floor(h/24)} d ago`;
  }
  function escapeHtml(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
  function escapeAttr(v){return escapeHtml(v).replaceAll("`","&#096;");}

  function toast(title,message,type="success"){
    const node=document.createElement("div");node.className=`toast ${type}`;
    node.innerHTML=`<div class="toast-title">${escapeHtml(title)}</div><div class="toast-message">${escapeHtml(message)}</div>`;
    els.toastRegion.appendChild(node);
    setTimeout(()=>{node.style.opacity="0";node.style.translate="16px 0";setTimeout(()=>node.remove(),180);},3200);
  }

  initialize();
})();
