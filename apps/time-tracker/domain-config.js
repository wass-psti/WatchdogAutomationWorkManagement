/* TimeTracker domain policy/configuration boundary — Work Management v1.27.0. */
(() => {
'use strict';
const LOCATIONS = [
  'Office-Base Duty',
  'Offsite (Home)',
  'Local Field Works',
  'Out of Town Assignment',
  'International Field Assignments',
];

const DEPARTMENTS = [
  'HR',
  'Materials and Logistics',
  'Engineering',
  'Finance and Accounting',
  'Sales and Marketing',
  'Information Technology',
];

const ROLES = ['System Admin', 'HR', 'Supervisor', 'Finance', 'IT Administrator', 'OJT', 'Employee'];
const DEFAULT_ROLE = 'Employee';
const RBAC_KEY = 'timetracker.rbac.v1';
const RBAC_BACKUP_KEY = 'timetracker.rbac.v1.backup';
const PERMISSIONS = {
  CLOCK_USE: 'clock.use',
  LOG_VIEW_SELF: 'log.view.self',
  LOG_VIEW_TEAM: 'log.view.team',
  LOG_VIEW_ALL: 'log.view.all',
  GPS_VIEW_EXACT: 'gps.view.exact',
  AUDIT_VIEW: 'audit.view',
  ATTENDANCE_EDIT: 'attendance.edit',
  ATTENDANCE_DELETE: 'attendance.delete',
  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',
  CALENDAR_VIEW: 'calendar.view',
  CALENDAR_MANAGE: 'calendar.manage',
  ROLES_VIEW: 'roles.view',
  USERS_MANAGE: 'users.manage',
  ROLE_ASSIGN_STANDARD: 'roles.assign.standard',
  ROLE_ASSIGN_ADMIN: 'roles.assign.admin',
  ATTENDANCE_EXPORT: 'attendance.export',
  AUDIT_EXPORT: 'audit.export',
  BACKUP_EXPORT: 'backup.export',
  OT_VIEW: 'ot.view',
  OT_CREATE: 'ot.create',
  OT_APPROVE: 'ot.approve',
  OT_ACTIVITY_VIEW: 'ot.activity.view',
  OT_ACTIVITY_EXPORT: 'ot.activity.export',
};
const ROLE_DEFINITIONS = {
  'System Admin': { level: 100, scope: 'all', summary: 'Full application administration, security, attendance, OT approval/activity, audit, GPS, reporting, calendar, export, and role-management authority.', permissions: Object.values(PERMISSIONS) },
  'IT Administrator': { level: 100, scope: 'all', summary: 'Equivalent to System Admin. Full technical and authorization control across attendance and OT workflows.', permissions: Object.values(PERMISSIONS) },
  'HR': { level: 80, scope: 'all', summary: 'Organization-wide attendance administration, corrections, GPS/audit review, reporting, calendar management, and non-administrator role administration.', permissions: [PERMISSIONS.CLOCK_USE,PERMISSIONS.LOG_VIEW_SELF,PERMISSIONS.LOG_VIEW_ALL,PERMISSIONS.GPS_VIEW_EXACT,PERMISSIONS.AUDIT_VIEW,PERMISSIONS.ATTENDANCE_EDIT,PERMISSIONS.REPORTS_VIEW,PERMISSIONS.REPORTS_EXPORT,PERMISSIONS.CALENDAR_VIEW,PERMISSIONS.CALENDAR_MANAGE,PERMISSIONS.ROLES_VIEW,PERMISSIONS.USERS_MANAGE,PERMISSIONS.ROLE_ASSIGN_STANDARD,PERMISSIONS.ATTENDANCE_EXPORT,PERMISSIONS.AUDIT_EXPORT,PERMISSIONS.OT_VIEW,PERMISSIONS.OT_CREATE] },
  'Supervisor': { level: 60, scope: 'team', summary: 'Department-level attendance oversight with audit/GPS review and reporting, without record modification or role administration.', permissions: [PERMISSIONS.CLOCK_USE,PERMISSIONS.LOG_VIEW_SELF,PERMISSIONS.LOG_VIEW_TEAM,PERMISSIONS.GPS_VIEW_EXACT,PERMISSIONS.AUDIT_VIEW,PERMISSIONS.REPORTS_VIEW,PERMISSIONS.REPORTS_EXPORT,PERMISSIONS.CALENDAR_VIEW,PERMISSIONS.ROLES_VIEW,PERMISSIONS.ATTENDANCE_EXPORT,PERMISSIONS.OT_VIEW,PERMISSIONS.OT_CREATE,PERMISSIONS.OT_APPROVE] },
  'Finance': { level: 50, scope: 'all', summary: 'Organization-wide attendance totals and reporting for payroll/finance purposes; exact GPS, audit payloads, record edits, and role administration are restricted.', permissions: [PERMISSIONS.CLOCK_USE,PERMISSIONS.LOG_VIEW_SELF,PERMISSIONS.LOG_VIEW_ALL,PERMISSIONS.REPORTS_VIEW,PERMISSIONS.REPORTS_EXPORT,PERMISSIONS.CALENDAR_VIEW,PERMISSIONS.ROLES_VIEW,PERMISSIONS.ATTENDANCE_EXPORT,PERMISSIONS.OT_VIEW,PERMISSIONS.OT_CREATE] },
  'OJT': { level: 20, scope: 'self', summary: 'Personal clocking, own attendance history, own reports, and calendar access. Administrative and sensitive evidence features are restricted.', permissions: [PERMISSIONS.CLOCK_USE,PERMISSIONS.LOG_VIEW_SELF,PERMISSIONS.REPORTS_VIEW,PERMISSIONS.CALENDAR_VIEW,PERMISSIONS.ROLES_VIEW,PERMISSIONS.ATTENDANCE_EXPORT,PERMISSIONS.OT_VIEW,PERMISSIONS.OT_CREATE] },
  'Employee': { level: 20, scope: 'self', summary: 'Default role. Personal clocking, own attendance history, own reports, calendar access, and own attendance export.', permissions: [PERMISSIONS.CLOCK_USE,PERMISSIONS.LOG_VIEW_SELF,PERMISSIONS.REPORTS_VIEW,PERMISSIONS.CALENDAR_VIEW,PERMISSIONS.ROLES_VIEW,PERMISSIONS.ATTENDANCE_EXPORT,PERMISSIONS.OT_VIEW,PERMISSIONS.OT_CREATE] },
};
const ADMIN_ROLES = new Set(['System Admin', 'IT Administrator']);

const ATTENDANCE_POLICY = Object.freeze({
  version: '1.0',
  standardClockInMinutes: 8 * 60,
  unpaidBreakStartMinutes: 12 * 60,
  unpaidBreakEndMinutes: 13 * 60,
  requiredWorkMs: 9 * 60 * 60 * 1000,
});
const AUTO_GPS_CACHE_KEY = 'timetracker.auto-gps-cache.v1';
const AUTO_GPS_FALLBACK_MAX_AGE_MS = 5 * 60 * 1000;
const AUTO_GPS_RETRY_DELAY_MS = 60 * 1000;

const STORAGE_KEY = 'timetracker.attendance.v1';
const BACKUP_KEY = 'timetracker.attendance.v1.backup';
const UI_KEY = 'timetracker.ui.v1';
const AUDIT_KEY = 'timetracker.audit.v1';
const AUDIT_BACKUP_KEY = 'timetracker.audit.v1.backup';
const OT_KEY = 'timetracker.ot.v1';
const OT_BACKUP_KEY = 'timetracker.ot.v1.backup';
const OT_ACTIVITY_KEY = 'timetracker.ot.activity.v1';
const OT_ACTIVITY_BACKUP_KEY = 'timetracker.ot.activity.v1.backup';

const PH_HOLIDAYS_2026 = [
  ['2026-01-01',"New Year's Day",'regular'],
  ['2026-02-17','Chinese New Year','special-nonworking'],
  ['2026-02-25','EDSA People Power Revolution Anniversary','special-working'],
  ['2026-03-20',"Eid'l Fitr",'regular'],
  ['2026-04-02','Maundy Thursday','regular'],['2026-04-03','Good Friday','regular'],['2026-04-04','Black Saturday','special-nonworking'],
  ['2026-04-09','Araw ng Kagitingan','regular'],['2026-05-01','Labor Day','regular'],['2026-05-27',"Eid'l Adha",'regular'],
  ['2026-06-12','Independence Day','regular'],['2026-08-21','Ninoy Aquino Day','special-nonworking'],['2026-08-31','National Heroes Day','regular'],
  ['2026-11-01',"All Saints' Day",'special-nonworking'],['2026-11-02',"All Souls' Day",'special-nonworking'],['2026-11-30','Bonifacio Day','regular'],
  ['2026-12-08','Feast of the Immaculate Conception of Mary','special-nonworking'],['2026-12-24','Christmas Eve','special-nonworking'],['2026-12-25','Christmas Day','regular'],['2026-12-30','Rizal Day','regular'],['2026-12-31','Last Day of the Year','special-nonworking'],
].map(([date,name,type])=>({id:`ph-${date}`,date,name,type,official:true}));
  globalThis.WMTimeTrackerDomain = Object.freeze({LOCATIONS,DEPARTMENTS,ROLES,DEFAULT_ROLE,RBAC_KEY,RBAC_BACKUP_KEY,PERMISSIONS,ROLE_DEFINITIONS,ADMIN_ROLES,ATTENDANCE_POLICY,AUTO_GPS_CACHE_KEY,AUTO_GPS_FALLBACK_MAX_AGE_MS,AUTO_GPS_RETRY_DELAY_MS,STORAGE_KEY,BACKUP_KEY,UI_KEY,AUDIT_KEY,AUDIT_BACKUP_KEY,OT_KEY,OT_BACKUP_KEY,OT_ACTIVITY_KEY,OT_ACTIVITY_BACKUP_KEY,PH_HOLIDAYS_2026});
})();
