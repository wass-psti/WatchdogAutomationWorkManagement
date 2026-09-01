import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const tokens = read('assets/css/foundation/tokens.css');
const themes = read('assets/css/foundation/themes.css');
const primitives = read('assets/css/foundation/primitives.css');
const bridge = read('assets/css/foundation/module-unification.css');
const appCss = read('assets/css/app.css');
const vite = read('vite.config.js');
const runtimeAssets = read('config/runtime-assets.js');

for (const token of [
  '--wm-control-sm','--wm-control-md','--wm-control-lg','--wm-hit-target',
  '--wm-sidebar-width','--wm-content-max','--wm-table-row-default',
  '--wm-motion-duration-standard','--wm-radius-250'
]) assert.ok(tokens.includes(token), `missing design token ${token}`);

for (const role of [
  '--wm-color-canvas','--wm-color-surface-primary','--wm-color-surface-secondary',
  '--wm-color-text-primary','--wm-color-text-secondary','--wm-color-border-primary',
  '--wm-color-accent','--wm-color-positive','--wm-color-negative','--wm-color-warning',
  '--wm-color-info','--wm-color-focus','--wm-color-row-hover','--wm-color-input'
]) assert.ok(themes.includes(role), `missing semantic theme role ${role}`);

assert.match(primitives, /\.wm-page/);
assert.match(primitives, /focus-visible/);
assert.match(primitives, /prefers-reduced-motion/);
assert.match(appCss, /Operational Enterprise presentation foundation/);
assert.match(appCss, /--bg:var\(--wm-color-canvas\)/);
assert.match(appCss, /--wm-sidebar-width/);

for (const [surface, file] of [
  ['time-tracker','apps/time-tracker/index.html'],
  ['fueltrack','apps/fueltrack-plus/runtime.html'],
  ['tradelink','apps/tradelink/runtime.html'],
]) {
  const html = read(file);
  assert.ok(html.includes('../../assets/css/foundation/tokens.css'), `${surface} does not load tokens`);
  assert.ok(html.includes('../../assets/css/foundation/themes.css'), `${surface} does not load themes`);
  assert.ok(html.includes('../../assets/css/foundation/primitives.css'), `${surface} does not load primitives`);
  assert.ok(html.includes('../../assets/css/foundation/module-unification.css'), `${surface} does not load shared module presentation bridge`);
  assert.ok(bridge.includes(`body[data-wm-surface="${surface}"]`), `${surface} has no scoped presentation bridge`);
}

for (const file of [
  'assets/css/foundation/tokens.css',
  'assets/css/foundation/themes.css',
  'assets/css/foundation/primitives.css',
  'assets/css/foundation/module-unification.css',
]) {
  assert.ok(vite.includes(`'${file}'`), `Vite embedded support does not copy ${file}`);
  assert.ok(runtimeAssets.includes(`'./${file}'`), `runtime asset manifest does not include ${file}`);
}

assert.match(bridge, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(bridge, /transition:\s*all/);
assert.doesNotMatch(appCss.slice(appCss.indexOf('Operational Enterprise presentation foundation')), /transition:\s*all/);

console.log('v1.43.2 UI presentation foundation phase-one verification: PASS');
