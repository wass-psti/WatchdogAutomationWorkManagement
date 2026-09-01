import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const time = read('apps/time-tracker/styles.css');
const motion = read('assets/css/motion-design.css');
const browser = read('tests/browser/run-cdp.mjs');
const platform = read('assets/js/core/platform.ts');
const manifest = read('config/application-manifest.ts');
const sw = read('service-worker.js');
const doc = read('docs/architecture/TIMETRACKER-PALETTE-v1.29.1.md');

assert.ok(platform.includes("PLATFORM_VERSION = '1.43.2'"), 'platform release mismatch');
assert.ok(manifest.includes("version: '1.43.2'"), 'manifest release mismatch');
assert.ok(sw.includes('work-management-v1.43.2'), 'service-worker cache mismatch');

const legacy = [
  '#f8f3eb','#9d968d','#aaa39a','#c7d0b8','#686259','#625d55','#6c665e','#8e887f','#5f5a52',
  'rgba(252,248,241','rgba(60,48,36','rgba(42,38,32','rgba(32,31,27','rgba(76,62,45','rgba(80,76,69','rgba(64,48,30',
  'rgba(238,116,69','rgba(238, 116, 69'
];
for (const token of legacy) assert.ok(!time.includes(token), `legacy TimeTracker color remains: ${token}`);

assert.ok(time.includes('--surface-muted: #eef2f7') && time.includes('--tt-surface-muted: #eef2f7'), 'TimeTracker cool neutral semantic surface tokens missing');
assert.ok(time.includes('.overview-table th') && time.includes('background:var(--surface-muted)'), 'Attendance Records header source layer is not cool-neutral');
assert.ok(time.includes('.overview-control-dock') && time.includes('background:rgba(255,255,255,.88)'), 'Overview control dock source layer is not neutralized');
assert.ok(time.includes('v1.29.1 — TimeTracker neutral-palette completion'), 'TimeTracker source-layer completion guard missing');
assert.ok(motion.includes('v1.29.1 — TimeTracker palette completion') && motion.includes('--tt-overview-muted:#eef2f7'), 'TimeTracker final motion-layer palette guard missing');

assert.ok(browser.includes('TimeTracker Overview filter dock no longer uses the legacy beige surface'), 'browser Overview dock regression assertion missing');
assert.ok(browser.includes('TimeTracker Attendance Records header uses the current cool muted surface'), 'browser Attendance Records header assertion missing');
assert.ok(browser.includes('TimeTracker Attendance Records summary no longer inherits the legacy cream palette'), 'browser Attendance Records summary assertion missing');

assert.ok(doc.includes('No v1.29.1 Supabase migration is required'), 'backend scope documentation missing');
assert.ok(!fs.existsSync('supabase/migrations/v1.29.1.sql') && !fs.existsSync('supabase/migrations/v1.29.1-timetracker-palette.sql'), 'presentation-only patch must not add a Supabase migration');

console.log('v1.29.1 TimeTracker palette completion verification: PASS');
