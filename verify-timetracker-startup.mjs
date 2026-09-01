import fs from 'node:fs';

const runtime = fs.readFileSync('apps/time-tracker/app.js', 'utf8');
const html = fs.readFileSync('apps/time-tracker/index.html', 'utf8');
const bootstrap = fs.readFileSync('assets/js/runtime/module-bootstrap.ts', 'utf8');
const fail = (message) => { throw new Error(message); };

if (!runtime.includes('requiredWorkingMs: requiredWorkMs')) {
  fail('Auto clock-out required-work duration is not mapped to the declared requiredWorkMs variable.');
}
if (/\brequiredWorkingMs,\s*\n\s*baseRequiredWorkingMs/.test(runtime)) {
  fail('Regression: undeclared requiredWorkingMs shorthand remains in auto-clockout metadata.');
}
if (!runtime.includes("try {\n    enforced = await enforceAutoClockOut")) {
  fail('Launch-time attendance enforcement is not awaited/isolated from UI startup.');
}
if (!runtime.includes('globalThis.__TIMETRACKER_BOOTED__ = true')) {
  fail('TimeTracker boot-completion marker is missing.');
}
if (!runtime.includes("initializeLaunchAttendanceEnforcement().catch")) {
  fail('Top-level TimeTracker startup rejection handler is missing.');
}
if (!html.includes('startEmbeddedModule')) {
  fail('TimeTracker does not use the shared module bootstrap boundary.');
}
if (!bootstrap.includes("window.addEventListener('unhandledrejection'")) {
  fail('Shared module bootstrap does not capture asynchronous startup rejections.');
}
if (!bootstrap.includes("window.addEventListener('error'")) {
  fail('Shared module bootstrap does not capture synchronous startup errors.');
}
if (!bootstrap.includes('renderFailure(config')) {
  fail('Shared module bootstrap does not render an actionable startup failure state.');
}

console.log('timetracker-startup-verification: PASS');
