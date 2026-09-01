import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=(p)=>fs.readFileSync(p,'utf8');
const shell=read('index.html');
const shellEntry=read('src/main.ts');
const tt=read('apps/time-tracker/index.html');
const fuel=read('apps/fueltrack-plus/runtime.html');
const trade=read('apps/tradelink/runtime.html');
const css=read('assets/css/motion-design.css');
const runtime=read('assets/js/runtime/motion-design.ts');
const assets=read('config/runtime-assets.js');
const platform=read('assets/js/core/platform.ts');
const manifest=read('config/application-manifest.ts');
const sw=read('service-worker.js');
const browser=read('tests/browser/integration.js');
const browserRunner=read('tests/browser/run-cdp.mjs');
const doc=read('docs/architecture/MOTION-DESIGN-v1.28.md');

assert.ok(platform.includes("PLATFORM_VERSION = '1.43.2'"),'platform version is not v1.29.1');
assert.ok(manifest.includes("version: '1.43.2'") && manifest.includes('architectureVersion: 15'),'manifest release/architecture mismatch');
assert.ok(sw.includes('work-management-v1.43.2'),'service-worker cache mismatch');

assert.ok(shell.includes('data-wm-surface="shell"'),'shell motion surface marker missing');
assert.ok(shellEntry.includes("import '../assets/css/motion-design.css'"),'shell shared motion stylesheet missing from Vite entry');
assert.ok(shellEntry.includes("import '../assets/js/runtime/motion-design.ts'"),'shell shared motion runtime missing from Vite entry');
for (const [name,src,surface] of [
  ['TimeTracker',tt,'time-tracker'],['FuelTrack+',fuel,'fueltrack'],['TradeLink',trade,'tradelink']
]) {
  assert.ok(src.includes(`data-wm-surface="${surface}"`),`${name} motion surface marker missing`);
  assert.ok(src.includes('motion-design.css'),`${name} shared motion stylesheet missing`);
  assert.ok(src.includes('motion-design.ts'),`${name} shared motion runtime missing`);
}

assert.ok(css.includes('WORK MANAGEMENT SHELL') && css.includes('TIMETRACKER') && css.includes('FUELTRACK+') && css.includes('TRADELINK'),'motion stylesheet does not cover all application surfaces');
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'),'reduced-motion fallback missing');
assert.ok(css.includes('.board-item-panel') && css.includes('.kanban-card') && css.includes('.auth-panel'),'shell/Boards/auth redesign coverage incomplete');
assert.ok(runtime.includes('IntersectionObserver') && runtime.includes('MutationObserver'),'dynamic reveal runtime missing');
assert.ok(runtime.includes("matchMedia('(prefers-reduced-motion: reduce)')"),'motion preference detection missing');
assert.ok(runtime.includes('requestAnimationFrame'),'pointer/reveal motion is not frame-coalesced');
assert.ok(assets.includes("'./assets/css/motion-design.css'") && assets.includes("'./assets/js/runtime/motion-design.ts'"),'motion assets missing from cache manifest');
assert.ok(browser.includes('motion design runtime initializes without blocking interaction'),'browser motion integration fixture assertion missing');
assert.ok(browserRunner.includes('motion design runtime boundary') && browserRunner.includes('motion-design.ts'),'real Chromium release gate does not exercise the motion runtime');
assert.ok(doc.includes('No v1.28.0 Supabase migration is required'),'motion design documentation backend statement missing');
assert.ok(!fs.existsSync('supabase/migrations/v1.28.0.sql') && !fs.existsSync('supabase/migrations/v1.28.0-motion-design.sql'),'UI-only release must not add a Supabase migration');

console.log('v1.28.0 motion design verification: PASS');
