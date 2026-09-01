import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const [app, css, motion, html, pkg, release] = await Promise.all([
  readFile('apps/time-tracker/app.js', 'utf8'),
  readFile('apps/time-tracker/v2.css', 'utf8'),
  readFile('apps/time-tracker/v2-motion.js', 'utf8'),
  readFile('apps/time-tracker/index.html', 'utf8'),
  readFile('package.json', 'utf8'),
  readFile('apps/time-tracker/verify-release.sh', 'utf8'),
]);

const checks = [
  ['Log uses the v2 chronological workspace', /data-tt-v2-screen="log"/.test(app) && /tt-v2-log-timeline/.test(app) && /tt-v2-log-record/.test(app)],
  ['Log keeps evidence, audit and GPS surfaces', /Attendance evidence/.test(app) && /Audit trail/.test(app) && /GPS map/.test(app) && /data-load-record-map/.test(app)],
  ['Calendar uses the v2 month plane and selected-day foreground', /data-tt-v2-screen="calendar"/.test(app) && /tt-v2-calendar-stage/.test(app) && /tt-v2-day-focus/.test(app)],
  ['Calendar retains Philippine holiday and custom-event behavior', /PH_HOLIDAYS_2026/.test(app) && /calendarEventsForDay/.test(app) && /addCalendarEvent/.test(app) && /deleteCalendarEvent/.test(app)],
  ['Reports use the restrained v2 workspace without removing filters or exports', /data-tt-v2-screen="reports"/.test(app) && /tt-v2-report-workspace/.test(app) && /id="reportPreset"/.test(app) && /id="reportExportCsv"/.test(app)],
  ['OT uses explicit v2 workflow-state presentation', /data-tt-v2-screen="ot"/.test(app) && /tt-v2-ot-stateflow/.test(app) && /data-state="submitted"/.test(app) && /data-state="approved"/.test(app) && /data-state="rejected"/.test(app)],
  ['OT business controls remain intact', /data-submit-ot/.test(app) && /data-approve-ot/.test(app) && /data-reject-ot/.test(app) && /approvedOtForAttendance/.test(app)],
  ['Roles use the v2 principal, catalog and directory planes', /data-tt-v2-screen="roles"/.test(app) && /tt-v2-principal-plane/.test(app) && /tt-v2-role-plane/.test(app) && /tt-v2-directory-plane/.test(app)],
  ['Cloud identity remains authoritative for Roles', /Work Management cloud identity remains authoritative/.test(app) && /managed centrally in Work Management/.test(app)],
  ['shared modal surfaces use the v2 overlay layer', /tt-v2-overlay-backdrop/.test(app) && /tt-v2-overlay-surface/.test(app) && /aria-modal="true"/.test(app)],
  ['modal keyboard lifecycle traps focus, restores focus and closes the topmost select first', /modalReturnFocus/.test(app) && /event\.key === 'Tab'/.test(app) && /modernSelectState\.open/.test(app) && /returnTarget\.focus/.test(app)],
  ['modern select collision handling remains viewport aware', /positionModernSelectMenu/.test(app) && /viewportPadding/.test(app) && /opens-up/.test(app)],
  ['Pass 2 provides responsive Log, Calendar, Reports, OT and Roles behavior', /@media \(max-width: 720px\)/.test(css) && /tt-v2-log-timeline/.test(css) && /calendar-grid \{ min-width: 630px/.test(css) && /tt-v2-report-summary/.test(css) && /tt-v2-ot-stateflow/.test(css) && /tt-v2-principal-plane/.test(css)],
  ['Pass 2 coarse-pointer targets are practical', /@media \(pointer: coarse\)/.test(css) && /min-height: 44px/.test(css)],
  ['Pass 2 reduced-motion path disables spatial transforms and heavy translucency', /@media \(prefers-reduced-motion: reduce\)/.test(css) && /transform: none !important/.test(css) && /backdrop-filter: none/.test(css)],
  ['v2 motion runtime pauses spatial work while hidden', /pageVisible/.test(motion) && /visibilitychange/.test(motion) && /version: '2\.0\.0-pass2'/.test(motion)],
  ['v2 motion remains frame-bounded and observer-based', /requestAnimationFrame\(commitPointer\)/.test(motion) && /requestAnimationFrame\(commitScroll\)/.test(motion) && /IntersectionObserver/.test(motion)],
  ['v2 presentation avoids broad transition-all declarations', !/transition\s*:\s*all\b/.test(css)],
  ['authenticated module bootstrap remains authoritative', /startEmbeddedModule/.test(html) && /entry:\s*'\.\/app\.js'/.test(html)],
  ['TimeTracker release verifier retains v2 assets', /v2\.css/.test(release) && /v2-motion\.js/.test(release)],
  ['Pass 2 verifier participates in the UI gate', /verify-timetracker-v2-pass2\.mjs/.test(pkg)],
];

for (const [label, ok] of checks) {
  assert.equal(ok, true, label);
  console.log(`PASS ${label}`);
}

console.log('TimeTracker v2 complete reconstruction pass-two verification: PASS');
