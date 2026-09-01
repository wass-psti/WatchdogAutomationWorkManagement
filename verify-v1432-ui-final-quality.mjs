import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const exists = (path) => fs.existsSync(path);

const primitives = read('assets/css/foundation/primitives.css');
const components = read('assets/css/foundation/components.css');
const modules = read('assets/css/foundation/module-unification.css');
const migration = read('assets/css/foundation/application-migration.css');
const browser = read('tests/browser/run-cdp.mjs');
const distVerifier = read('scripts/verify-dist.mjs');
const tradeVerify = read('apps/tradelink/verify-ui.sh');
const pkg = JSON.parse(read('package.json'));

// Text scaling and intrinsic sizing must be explicit rather than relying on a
// desktop-only minimum canvas.
assert.match(primitives, /-webkit-text-size-adjust:\s*100%/);
assert.match(primitives, /text-size-adjust:\s*100%/);
assert.match(modules, /body\s*\{\s*min-width:\s*0;\s*max-width:\s*100%/s);
assert.doesNotMatch(modules, /min-width:\s*320px/);

// Shared keyboard focus treatment is the deterministic visual contract. Browser
// integration separately verifies focus ownership/trapping/restoration.
assert.match(components, /:is\(\.wm-button,\.wm-icon-button,\.wm-tab,\.wm-nav-item\):focus-visible\s*\{[^}]*outline:\s*var\(--wm-focus-width\)\s+solid\s+var\(--wm-color-focus\)/s);
assert.match(primitives, /:where\(button,\[role="button"\],a,input,select,textarea,\[tabindex\]\):focus-visible/);

// Viewport containment for overlays and intrinsic content scaling.
assert.match(components, /\.wm-menu\)[^{]*\{[^}]*max-width:min\(360px,calc\(100vw - 16px\)\)[^}]*max-height:min\(70dvh,520px\)[^}]*overflow:auto/s);
assert.match(components, /\.wm-dialog\)[^{]*\{[^}]*max-width:calc\(100vw - 16px\)[^}]*max-height:min\(84dvh,760px\)[^}]*overflow:hidden/s);
assert.match(components, /\.wm-dialog-body\)[^{]*\{[^}]*min-height:0[^}]*overflow:auto[^}]*overscroll-behavior:contain/s);
assert.match(components, /\.wm-data-region\)[^{]*\{[^}]*max-width:100%[^}]*overflow:auto[^}]*overscroll-behavior:contain/s);
assert.match(components, /@media \(max-width:640px\)[\s\S]*\.wm-button\)[^{]*\{[^}]*white-space:normal/s);
assert.match(components, /@media \(pointer:coarse\)[\s\S]*min-height:44px/s);
assert.match(modules, /@media \(pointer:coarse\)[\s\S]*min-height:44px/s);
assert.match(migration, /@media \(pointer:coarse\)[\s\S]*input:not\(\[type=\"checkbox\"\]\):not\(\[type=\"radio\"\]\)[\s\S]*min-height:44px/s);

// Compact shell/Board behavior must avoid sticky overlap and clipped navigation.
assert.match(migration, /@media \(max-width:1120px\)[\s\S]*\.board-list-toolbar\s*\{\s*position:static/s);
assert.match(migration, /@media \(max-width:640px\)[\s\S]*\.sidebar nav\s*\{[^}]*display:flex[^}]*overflow-x:auto/s);
assert.match(migration, /\.workspace\s*\{\s*padding-bottom:calc\(72px \+ env\(safe-area-inset-bottom\)\)/);
assert.match(migration, /\.board-inline-popover,\.board-status-popover,\.column-quick-picker\)[^{]*\{[^}]*max-width:calc\(100vw - 12px\)[^}]*max-height:calc\(100dvh - 12px\)/s);

// Automated viewport contract covers both themes, desktop-to-narrow layouts,
// zoom-equivalent viewport pressure, enlarged text, and coarse-pointer targets.
for (const marker of [
  "name:'wide desktop'",
  "name:'standard desktop'",
  "name:'laptop'",
  "name:'tablet'",
  "name:'narrow viewport'",
  "name:'200% zoom equivalent'",
  "name:'enlarged text scaling'",
  "rootFontSize:'20px'",
  "name:'coarse pointer narrow viewport'",
  "for (const theme of ['light','dark'])",
  'document has no unintended horizontal overflow',
  'menu remains inside the viewport',
  'dialog remains vertically usable',
  'programmatic focus ownership remains stable',
  'mobile shell navigation uses a single horizontal rail',
]) assert.ok(browser.includes(marker), `final browser audit is missing: ${marker}`);
assert.doesNotMatch(browser, /CSS\.forcePseudoState/);

// Legacy cleanup is conservative: obsolete presentation snapshots are gone,
// active feature styles remain, and the TradeLink verifier follows the active file.
for (const path of [
  'apps/fueltrack-plus/styles.css',
  'apps/fueltrack-plus/styles.v3.17.0-wm2.css',
  'apps/fueltrack-plus/styles.v3.17.0-wm3.css',
  'apps/fueltrack-plus/styles.v3.17.0-wm4.css',
  'apps/fueltrack-plus/styles.v3.17.0-wm5.css',
  'apps/tradelink/styles.css',
]) assert.equal(exists(path), false, `obsolete presentation snapshot remains: ${path}`);
for (const path of [
  'apps/time-tracker/styles.css',
  'apps/fueltrack-plus/styles.v3.17.0-wm6.css',
  'apps/tradelink/styles.v1.42.0-wm1.css',
]) assert.equal(exists(path), true, `active presentation stylesheet is missing: ${path}`);
assert.match(tradeVerify, /styles\.v1\.42\.0-wm1\.css/);
assert.doesNotMatch(tradeVerify, /grep[^\n]+styles\.css/);

// The dist gate must prevent obsolete snapshots from returning to production.
assert.match(distVerifier, /obsoletePresentationAssets/);
assert.match(distVerifier, /styles\.v3\.17\.0-wm5\.css/);
assert.match(distVerifier, /apps\/tradelink\/styles\.css/);

for (const source of [primitives, components, modules, migration]) {
  assert.doesNotMatch(source, /transition\s*:\s*all\b/i);
}
assert.match(pkg.scripts['verify:ui'], /verify-v1432-ui-final-quality\.mjs/);

console.log('v1.43.2 final production presentation-quality verification: PASS');
