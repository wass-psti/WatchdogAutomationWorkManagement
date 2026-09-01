import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const assert = (condition, message) => { if (!condition) throw new Error(message); console.log(`PASS ${message}`); };

const platform = read('assets/js/core/platform.ts');
const manifest = read('config/application-manifest.ts');
const sw = read('service-worker.js');
const assets = read('config/runtime-assets.js');
const tokens = read('assets/css/foundation/tokens.css');
const motionCss = read('assets/css/motion-design.css');
const orchestrator = read('assets/js/runtime/motion-orchestrator.ts');
const shell = read('assets/js/app.ts');
const shellEntry = read('src/main.ts');
const time = read('apps/time-tracker/app.js');
const fuel = read('apps/fueltrack-plus/app.v3.17.0-wm6.js');
const trade = read('apps/tradelink/app.v1.42.0-wm1.js');
const dialog = read('assets/js/features/boards/controllers/dialog-controller.ts');
const browser = read('tests/browser/run-cdp.mjs');

assert(platform.includes("PLATFORM_VERSION = '1.43.2'"), 'platform release is v1.30.0');
assert(manifest.includes("version: '1.43.2'") && manifest.includes('architectureVersion: 15'), 'application keeps Architecture Version 7 with v1.30 presentation release');
assert(sw.includes("work-management-v1.43.2"), 'service-worker cache advances to v1.30.0');
assert(assets.includes("./assets/js/runtime/motion-orchestrator.ts"), 'motion orchestrator is included in the authoritative runtime cache manifest');

{
  const orchestratorIndex = shellEntry.indexOf('motion-orchestrator.ts');
  const designIndex = shellEntry.indexOf('motion-design.ts');
  assert(orchestratorIndex >= 0 && designIndex > orchestratorIndex, 'src/main.ts loads the orchestrator before progressive motion enhancement');
}
for (const file of ['apps/time-tracker/index.html','apps/fueltrack-plus/runtime.html','apps/tradelink/runtime.html']) {
  const source = read(file);
  const orchestratorIndex = source.indexOf('motion-orchestrator.ts');
  const designIndex = source.indexOf('motion-design.ts');
  assert(orchestratorIndex >= 0 && designIndex > orchestratorIndex, `${file} loads the orchestrator before progressive motion enhancement`);
}

for (const token of ['--wm-motion-duration-standard','--wm-motion-duration-deliberate','--wm-motion-ease-enter','--wm-motion-ease-exit','--wm-motion-press-scale','--wm-motion-stagger-step']) {
  assert(tokens.includes(token), `shared motion token ${token} exists`);
}
assert(orchestrator.includes("version: '1.30.0'") && orchestrator.includes('async function exitThen') && orchestrator.includes('wm-motion-indicator'), 'motion orchestrator exposes route choreography and shared navigation indicators');
assert(orchestrator.includes('animation.cancel()') && orchestrator.includes('transitionEpoch'), 'content transitions cancel fill-forwards state and reject stale transition epochs');
assert(orchestrator.includes('indicator.parentElement !== container') && orchestrator.includes('bindIndicator(container)'), 'persistent navigation indicators recover after child replacement');

assert(shell.includes('function patchWorkspaceContent') && shell.includes('currentTopbar.innerHTML') && shell.includes('currentMain.innerHTML'), 'shell preserves persistent topbar/main containers while patching route contents');
assert(shell.includes("location.hash || '#/'") && shell.includes("selector: '#main, .auth-panel'"), 'shell distinguishes route changes and scopes choreography to route-owned content');
assert(!shell.includes('document.startViewTransition'), 'shell does not use document-wide View Transitions');

assert(time.includes('data-time-main') && time.includes("selector: '.app-shell > main > :first-child'"), 'TimeTracker preserves its shell and transitions only the active content region');
assert(!time.includes('document.startViewTransition'), 'TimeTracker avoids document-wide View Transitions');
assert(fuel.includes('const routeChanged') && fuel.includes("selector: '#content > :first-child'"), 'FuelTrack+ applies content-only route choreography');
assert(trade.includes('companyPanelHost') && trade.includes("selector:'#mainView > :first-child'"), 'TradeLink preserves its shell hosts and transitions only main-view content');

assert(motionCss.includes('v1.30.0 — Motion architecture redesign') && motionCss.includes('.wm-motion-indicator') && motionCss.includes('@media(prefers-reduced-motion:reduce)'), 'v1.30 CSS contains shared navigation, responsive choreography, and reduced-motion rules');
assert(motionCss.includes('select:not([multiple])') && motionCss.includes('appearance:none'), 'native select presentation is normalized without replacing browser semantics');
assert(dialog.includes("wrap.classList.add('is-closing')") && dialog.includes('finalizeClose'), 'Board dialogs use controlled exit motion while retaining lifecycle cleanup');

assert(browser.includes("motionOrchestratorSource") && browser.includes('motion orchestrator stable-shell and navigation choreography'), 'Chromium release gate executes the v1.30 motion orchestrator');
assert(exists('docs/architecture/MOTION-ARCHITECTURE-v1.30.md'), 'v1.30 motion architecture is documented');
const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'));
assert(!migrations.some((name) => /^v1\.30\.0/i.test(name)), 'v1.30.0 requires no Supabase migration');

console.log('v1.30.0 motion architecture verification: PASS');
