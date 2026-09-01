/* FuelTrack+ domain policy/configuration boundary — Work Management v1.27.0. */
(() => {
'use strict';
  const VERSION = "3.17.0";
  const KEYS = {
    requests: "fueltrackplus.requests.v3",
    activity: "fueltrackplus.activity.v3",
    prefs: "fueltrackplus.preferences.v3",
    inventory: "fueltrackplus.inventory.v3",
    userRoles: "fueltrackplus.userroles.v3",
    activityWorkspace: "fueltrackplus.activity.workspace.v1",
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

  const AUTO_REFRESH_INTERVAL_MS = 15000;
  const AUTO_REFRESH_MIN_GAP_MS = 2500;
  const ACTIVITY_REFRESH_INTERVAL_MS = 20000;
  function createInitialState({ userName, role }) {
    return {
      route: 'dashboard', dataStatus: 'loading', storageErrors: [], activityError: null, loadedAt: null, requests: [], activity: [],
      prefs: { theme: 'dark', pageSize: 8, userName, role }, inventory: [], userRoles: [], roleFilters: { search: '', role: 'all' },
      filters: { search: '', status: '', department: '', refuelType: '', priority: '', location: '', month: '', sort: 'newest', page: 1 },
      analyticsPeriod: '6m', analyticsFilters: { department: '', status: '', location: '' },
      approvalFilters: { search: '', stage: '', refuelType: '', priority: '', sort: 'oldest' },
      lightFuelFilters: { search: '', fuelType: '', location: '', health: '', requestView: 'all' },
      activityFilters: { search: '', type: 'all', actor: '', period: 'all', linkage: 'all', sort: 'newest' },
      activityWorkspace: { view: 'timeline', archivedIds: [], updatedAt: '' }, activitySelectedIds: [], activityVisibleCount: 30,
      activityFilter: 'all', activitySyncStatus: 'idle', activityLastRefreshAt: null, activityRefreshError: null
    };
  }
  globalThis.WMFuelTrackDomain = Object.freeze({VERSION,KEYS,VEHICLE_DIRECTORY,CONTAINER_DIRECTORY,PRIORITIES,ROLES,DEFAULT_ROLE,PERMISSIONS,STATUSES,VALID_TRANSITIONS,ROUTES,AUTO_REFRESH_INTERVAL_MS,AUTO_REFRESH_MIN_GAP_MS,ACTIVITY_REFRESH_INTERVAL_MS,createInitialState});
})();
