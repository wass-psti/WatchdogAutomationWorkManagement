import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const components = read('assets/css/foundation/components.css');
const migration = read('assets/css/foundation/application-migration.css');
const contracts = read('src/platform/contracts/presentation-system.ts');
const primitives = read('assets/js/platform/ui/primitives.ts');
const main = read('src/main.ts');
const app = read('assets/js/app.ts');
const boardList = read('assets/js/features/boards/views/board-list-view.ts');
const boardWorkspace = read('assets/js/features/boards/views/board-workspace-view.ts');
const itemWorkspace = read('assets/js/features/boards/views/item-workspace-view.ts');
const dialog = read('assets/js/features/boards/controllers/dialog-controller.ts');
const vite = read('vite.config.js');
const runtimeAssets = read('config/runtime-assets.js');
const pkg = JSON.parse(read('package.json'));

for (const contract of ['UiControlTone','UiControlSize','UiControlState','UiFieldKind','UiNavigationLevel']) {
  assert.ok(contracts.includes(contract), `missing presentation contract ${contract}`);
}
for (const helper of ['buttonClass','iconButtonClass','fieldControlClass','navigationItemClass','tabClass','toolbarClass']) {
  assert.ok(primitives.includes(`function ${helper}`), `missing typed primitive helper ${helper}`);
}
for (const primitive of [
  '.wm-button','.wm-icon-button','.wm-field-control','.wm-search','.wm-toolbar','.wm-tabs','.wm-tab',
  '.wm-segmented','.wm-badge','.wm-panel','.wm-empty-state','.wm-alert','.wm-menu','.wm-dialog','.wm-table','.wm-checkbox'
]) assert.ok(components.includes(primitive), `missing shared component primitive ${primitive}`);

for (const state of [':hover',':focus-visible',':disabled','aria-busy','is-selected','is-invalid','prefers-reduced-motion']) {
  assert.ok(components.includes(state), `component state coverage missing ${state}`);
}
assert.doesNotMatch(components, /transition:\s*all/);
assert.doesNotMatch(migration, /transition:\s*all/);
assert.match(main, /foundation\/components\.css/);
assert.match(main, /foundation\/application-migration\.css/);
assert.match(app, /navigationItemClass/);
assert.match(app, /toolbarClass\('top-actions'\)/);

for (const [name, source] of [
  ['board list', boardList],
  ['board workspace', boardWorkspace],
  ['item workspace', itemWorkspace],
  ['board dialog', dialog],
]) {
  assert.match(source, /platform\/ui\/primitives\.ts/, `${name} does not consume the typed presentation primitives`);
}
assert.match(boardList, /wm-search board-search/);
assert.match(boardWorkspace, /wm-segmented view-switch/);
assert.match(boardWorkspace, /wm-checkbox/);
assert.match(itemWorkspace, /wm-tabs item-panel-tabs/);
assert.match(dialog, /wm-dialog wm-modal/);

for (const [surface, file] of [
  ['time-tracker','apps/time-tracker/index.html'],
  ['fueltrack','apps/fueltrack-plus/runtime.html'],
  ['tradelink','apps/tradelink/runtime.html'],
]) {
  const html = read(file);
  assert.ok(html.includes('../../assets/css/foundation/components.css'), `${surface} does not load shared components`);
  assert.ok(html.includes('../../assets/css/foundation/application-migration.css'), `${surface} does not load screen migration layer`);
  assert.ok(migration.includes(`body[data-wm-surface="${surface}"]`), `${surface} has no phase-two screen migration rules`);
}

for (const file of ['assets/css/foundation/components.css','assets/css/foundation/application-migration.css']) {
  assert.ok(vite.includes(`'${file}'`), `Vite embedded support does not copy ${file}`);
  assert.ok(runtimeAssets.includes(`'./${file}'`), `runtime asset manifest does not include ${file}`);
}

assert.match(migration, /board-list-toolbar/);
assert.match(migration, /board-table-scroll/);
assert.match(migration, /item-panel-tabs/);
assert.match(migration, /wm-modal/);
assert.match(migration, /max-width:1120px/);
assert.match(migration, /max-width:840px/);
assert.match(migration, /max-width:640px/);
assert.match(pkg.scripts['verify:ui'], /verify-v1432-ui-foundation-phase1\.mjs/);
assert.match(pkg.scripts['verify:ui'], /verify-v1432-ui-components-phase2\.mjs/);

console.log('v1.43.2 UI shared components/navigation/forms/Boards phase-two verification: PASS');
