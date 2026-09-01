import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const motion = read('assets/css/motion-design.css');
const time = read('apps/time-tracker/styles.css');
const fuel = read('apps/fueltrack-plus/styles.v3.17.0-wm6.css');
const fuelJs = read('apps/fueltrack-plus/app.v3.17.0-wm6.js');
const trade = read('apps/tradelink/styles.v1.42.0-wm1.css');
const browser = read('tests/browser/run-cdp.mjs');
const platform = read('assets/js/core/platform.ts');
const manifest = read('config/application-manifest.ts');
const sw = read('service-worker.js');
const doc = read('docs/architecture/THEME-REFINEMENT-v1.29.md');

assert.ok(platform.includes("PLATFORM_VERSION = '1.43.2'"), 'platform release mismatch');
assert.ok(manifest.includes("version: '1.43.2'"), 'manifest release mismatch');
assert.ok(sw.includes("work-management-v1.43.2"), 'service-worker cache mismatch');

assert.ok(!time.includes('#fffaf3') && !time.includes('#fbe9df') && !time.includes('rgba(247,241,231'), 'TimeTracker legacy dropdown/surface palette remains');
assert.ok(time.includes('--dropdown-bg: #ffffff') && time.includes('--dropdown-selected: #fff0eb'), 'TimeTracker modern dropdown palette was not migrated');
assert.ok(motion.includes('--tt-control-bg:rgba(255,255,255,.86)') && motion.includes('body[data-wm-surface="time-tracker"] > .modern-select-menu'), 'TimeTracker portaled dropdown motion integration missing');

assert.ok(fuel.includes('--text-3: #758aa3') && fuel.includes('--text-3: #66788d'), 'FuelTrack tertiary theme text tokens are not contrast-adjusted');
assert.ok(motion.includes('html.light body[data-wm-surface="fueltrack"]') && motion.includes('--fuel-sidebar-bg:linear-gradient(155deg,rgba(255,255,255,.97)'), 'FuelTrack Light Mode motion palette missing');
assert.ok(motion.includes('background-color:var(--fuel-canvas-0)') && motion.includes('background:var(--fuel-card-bg) !important'), 'FuelTrack motion surfaces are not semantic/theme-aware');
assert.ok(fuelJs.includes('function syncThemeUi()') && fuelJs.includes('Switch to ${next} mode') && fuelJs.includes('meta[name="theme-color"]'), 'FuelTrack theme UI synchronization missing');

assert.ok(trade.includes('.brand-copy strong{color:#172033') && trade.includes('.document-heading h1{color:var(--ink)'), 'TradeLink legacy white-on-light typography remains in source layer');
assert.ok(trade.includes('--soft:#667085') && trade.includes('input::placeholder,textarea::placeholder{color:#667085}'), 'TradeLink secondary/placeholder typography tokens are not strengthened');
assert.ok(motion.includes('--tl-placeholder:#667085') && motion.includes('.brand-copy strong { color:var(--tl-chrome-text); }'), 'TradeLink motion-layer contrast guard missing');

assert.ok(browser.includes('embedded application theme and contrast coherence'), 'browser theme/contrast gate missing');
assert.ok(browser.includes("contrast(parse(fuelMutedLight.color),rgb('#ffffff'))>=4.5"), 'FuelTrack Light Mode contrast assertion missing');
assert.ok(browser.includes("TradeLink '+name+' text is readable on light surfaces"), 'TradeLink contrast assertions missing');

assert.ok(doc.includes('No v1.29.0 Supabase migration is required'), 'backend-scope documentation missing');
assert.ok(!fs.existsSync('supabase/migrations/v1.29.1-theme-refinement.sql') && !fs.existsSync('supabase/migrations/v1.29.1.sql'), 'presentation-only release must not add a Supabase migration');

console.log('v1.29.0 embedded theme refinement verification: PASS');
