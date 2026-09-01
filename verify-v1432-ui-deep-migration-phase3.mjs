import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const editorContracts = read('src/features/boards/contracts/editor.ts');
const columnContracts = read('src/features/boards/contracts/column-registry.ts');
const registry = read('assets/js/features/boards/grid/column-type-registry.ts');
const inline = read('assets/js/features/boards/controllers/inline-edit-controller.ts');
const statusEditor = read('assets/js/features/boards/services/status-label-editor.ts');
const browser = read('tests/browser/run-cdp.mjs');
const components = read('assets/css/foundation/components.css');
const migration = read('assets/css/foundation/application-migration.css');
const timeTracker = read('apps/time-tracker/app.js');
const fuelTrack = read('apps/fueltrack-plus/app.v3.17.0-wm6.js');
const tradeLink = read('apps/tradelink/app.v1.42.0-wm1.js');
const pkg = JSON.parse(read('package.json'));

const columnTypes = ['text','long_text','number','status','dropdown','date','people','checkbox','timeline','email','url'];
for (const type of columnTypes) {
  assert.match(editorContracts, new RegExp(`\\b${type}\\s*:`), `missing typed editor draft contract for ${type}`);
  assert.match(registry, new RegExp(`\\b${type}\\s*:`), `missing editor registry implementation for ${type}`);
}
for (const marker of ['BoardEditorDraftByColumnType','BoardCellEditorContract','CompleteBoardEditorRegistry','draftFromValue','normalizeDraft','explicitSave','explicitCancel','saveOnEnter','cancelOnEscape','commitOnBlur']) {
  assert.ok(editorContracts.includes(marker), `Board editor contract is missing ${marker}`);
}
assert.match(columnContracts, /editorContract:\s*BoardCellEditorContract/);
assert.match(registry, /getBoardCellEditorContract/);
assert.match(inline, /const unsupported:\s*never\s*=\s*column/);
assert.doesNotMatch(inline, /addEventListener\(\s*['"]blur['"]/);

for (const marker of [
  'data-inline-editor-state', 'aria-invalid', 'Not saved. Review the value and try again.',
  'data-status-manager-dirty', 'Unsaved label changes', 'status-manager-error',
  'data-status-manager-cancel', 'data-status-color-toggle', 'aria-pressed',
]) assert.ok(inline.includes(marker), `Board editor/status migration missing ${marker}`);
assert.match(statusEditor, /reset\(\):\s*void/);
assert.match(statusEditor, /isDirty\(\):\s*boolean/);
assert.match(browser, /failed inline rename preserves the draft/);
assert.match(browser, /invalid duplicate Status names remain in the editor/);
assert.match(browser, /Status manager Cancel discards draft configuration/);

for (const primitive of ['.wm-screen','.wm-page-header','.wm-action-row','.wm-form-grid','.wm-data-region']) {
  assert.ok(components.includes(primitive), `missing concrete phase-three composition primitive ${primitive}`);
}

for (const screen of ['renderOverview','renderClock','renderLog','renderReports','renderCalendar','renderOt','renderRoles']) {
  assert.ok(timeTracker.includes(`function ${screen}(`), `TimeTracker screen migration target missing: ${screen}`);
}
assert.match(timeTracker, /class="nav-tabs wm-tabs"/);
assert.match(timeTracker, /role="tab" aria-controls="timeMain"/);
assert.match(timeTracker, /id="timeMain"[^>]+role="tabpanel"/);
assert.match(timeTracker, /enhanceScreenPresentation\(appRoot\)/);
assert.match(timeTracker, /wm-field-control/);
assert.match(timeTracker, /wm-action-row/);
assert.match(timeTracker, /wm-panel/);

for (const route of ['dashboard','analytics','requests','new','approvals','lightfuels','activity','roles']) {
  assert.match(fuelTrack, new RegExp(`${route}:\\s*render`, 'i'), `FuelTrack+ route is not represented in deep migration: ${route}`);
}
assert.match(fuelTrack, /function enhanceFuelTrackPresentation/);
assert.match(fuelTrack, /dataset\.uiScreen\s*=\s*route/);
assert.match(fuelTrack, /wm-field-control/);
assert.match(fuelTrack, /wm-button/);
assert.match(fuelTrack, /wm-table/);
assert.match(fuelTrack, /aria-controls",\s*"content"/);
assert.match(fuelTrack, /activity-view-tabs wm-tabs/);

for (const type of ['esi','packing','delivery','payment','quotation','po']) {
  assert.ok(tradeLink.includes(`${type}:`) || tradeLink.includes(`'${type}'`) || tradeLink.includes(`"${type}"`), `TradeLink create workflow missing: ${type}`);
}
for (const fn of ['renderCreate','renderDocuments','renderManual','renderRecovery']) {
  assert.ok(tradeLink.includes(`function ${fn}(`), `TradeLink screen migration target missing: ${fn}`);
}
assert.match(tradeLink, /function enhanceTradeLinkPresentation/);
assert.match(tradeLink, /dataset\.uiScreen=ui\.tab/);
assert.match(tradeLink, /class="nav-tabs wm-tabs"/);
assert.match(tradeLink, /role="tab" aria-controls="mainView"/);
assert.match(tradeLink, /create-type-tabs wm-tabs/);
assert.match(tradeLink, /recovery-tabs wm-tabs/);
assert.match(tradeLink, /wm-field-control/);
assert.match(tradeLink, /wm-button/);
assert.match(tradeLink, /wm-table/);

for (const surface of ['time-tracker','fueltrack','tradelink']) {
  assert.ok(migration.includes(`body[data-wm-surface="${surface}"]`), `missing deep migration CSS for ${surface}`);
}
assert.match(migration, /forced-colors:active/);
assert.match(migration, /max-width:840px/);
assert.match(migration, /max-width:640px/);
assert.doesNotMatch(components, /transition:\s*all/);
assert.doesNotMatch(migration, /transition:\s*all/);
assert.match(pkg.scripts['verify:ui'], /verify-v1432-ui-deep-migration-phase3\.mjs/);

console.log('v1.43.2 Boards editor + embedded deep-screen phase-three verification: PASS');
