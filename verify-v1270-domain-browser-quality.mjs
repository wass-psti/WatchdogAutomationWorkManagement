import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const platform = read('assets/js/core/platform.ts');
const sw = read('service-worker.js');
const manifest = read('config/application-manifest.ts');
const runtimeAssets = read('config/runtime-assets.js');
const boardsUi = read('assets/js/boards-ui.ts');
const boardsFeature = read('assets/js/features/boards/index.ts');
const itemController = read('assets/js/features/boards/controllers/item-workspace-controller.ts');
const itemRuntime = read('assets/js/features/boards/services/item-workspace-runtime.ts');
const dragController = read('assets/js/features/boards/controllers/drag-drop-controller.ts');
const itemView = read('assets/js/features/boards/views/item-workspace-view.ts');
const moduleHost = read('assets/js/runtime/module-host.ts');
const timeHtml = read('apps/time-tracker/index.html');
const timeConfig = read('apps/time-tracker/domain-config.js');
const timeApp = read('apps/time-tracker/app.js');
const fuelHtml = read('apps/fueltrack-plus/runtime.html');
const fuelConfig = read('apps/fueltrack-plus/domain-config.js');
const fuelApp = read('apps/fueltrack-plus/app.v3.17.0-wm6.js');
const tradeHtml = read('apps/tradelink/runtime.html');
const tradeConfig = read('apps/tradelink/domain-config.js');
const tradeApp = read('apps/tradelink/app.v1.42.0-wm1.js');
const phase = read('docs/architecture/PHASE-6.md');
const profile = read('docs/architecture/QUALITY-PROFILE-v1.27.md');
const checklist = read('docs/architecture/RESTRUCTURE-CHECKLIST.md');
const browserRunner = read('tests/browser/run-browser-tests.sh');
const browserCdp = read('tests/browser/run-cdp.mjs');

assert.ok(platform.includes("PLATFORM_VERSION = '1.43.2'"), 'platform version is not v1.27.0');
assert.ok(sw.includes('work-management-v1.43.2'), 'service-worker cache is not v1.27.0');
assert.ok(manifest.includes("version: '1.43.2'") && manifest.includes('architectureVersion: 15'), 'manifest version/architecture mismatch');
assert.ok(manifest.includes("'item-workspace-controller', 'item-panel-renderer', 'drag-drop-controller'"), 'Boards manifest dependencies do not expose interaction controllers');
assert.ok(boardsFeature.includes("architecture: 'stable-workspace-controller-state-service-views-workflow-and-interaction-controllers'"), 'Boards architecture metadata does not reflect interaction-controller extraction');

const beforeBootstrap = (html, script) => html.indexOf(script) >= 0 && html.indexOf(script) < html.indexOf('module-bootstrap.ts');
assert.ok(beforeBootstrap(timeHtml, './domain-config.js'), 'TimeTracker domain config must load before module bootstrap');
assert.ok(beforeBootstrap(fuelHtml, './domain-config.js'), 'FuelTrack+ domain config must load before module bootstrap');
assert.ok(beforeBootstrap(tradeHtml, './domain-config.js'), 'TradeLink domain config must load before module bootstrap');

assert.ok(timeConfig.includes('globalThis.WMTimeTrackerDomain') && timeConfig.includes('PH_HOLIDAYS_2026') && timeConfig.includes('ATTENDANCE_POLICY'), 'TimeTracker domain config is incomplete');
assert.ok(timeApp.startsWith('const { LOCATIONS') && timeApp.includes('globalThis.WMTimeTrackerDomain'), 'TimeTracker runtime does not consume the domain boundary');
assert.ok(!timeApp.includes('const PH_HOLIDAYS_2026 = ['), 'TimeTracker holiday catalog is still duplicated in the monolith');

assert.ok(fuelConfig.includes('globalThis.WMFuelTrackDomain') && fuelConfig.includes('function createInitialState') && fuelConfig.includes('VALID_TRANSITIONS'), 'FuelTrack+ domain config is incomplete');
assert.ok(fuelApp.includes('globalThis.WMFuelTrackDomain') && fuelApp.includes('createInitialState({ userName: AUTHENTICATED_NAME, role: AUTHENTICATED_ROLE })'), 'FuelTrack+ runtime does not consume the domain boundary/state factory');

assert.ok(tradeConfig.includes('globalThis.WMTradeLinkDomain') && tradeConfig.includes("const STORAGE_KEY = 'tradelink_state_v1'") && tradeConfig.includes('QUOTATION_APPROVAL_USERS'), 'TradeLink domain config is incomplete');
assert.ok(tradeApp.includes('globalThis.WMTradeLinkDomain') && tradeApp.includes('const scrollBehavior = () => window.matchMedia') && tradeApp.includes("'(prefers-reduced-motion: reduce)'"), 'TradeLink domain/reduced-motion integration is incomplete');

assert.ok(boardsUi.includes("createItemWorkspaceController") && boardsUi.includes("createBoardDragDropController"), 'Boards compatibility layer does not use extracted interaction controllers');
assert.ok(!boardsUi.includes("root.addEventListener('dragstart'"), 'Low-level dragstart binding still lives in boards-ui');
assert.ok(!boardsUi.includes('let itemPanelEpoch'), 'Item Workspace epoch still leaks into boards-ui');
assert.ok(boardsUi.includes('let itemSearchFrame = 0;') && /itemSearchFrame = requestAnimationFrame\(\(\) => \{[\s\S]*?itemSearchFrame = 0;[\s\S]*?renderBoardViewOnly\(\);[\s\S]*?\}\);/.test(boardsUi), 'Board item search is not animation-frame coalesced');

assert.ok(itemRuntime.includes('let epoch = 0;') && itemRuntime.includes('let uploadEpoch = 0;'), 'Item Workspace runtime lacks independent operation epochs');
assert.ok(itemRuntime.includes('const boardId = state.board?.board?.id as BoardId | undefined;') && itemRuntime.includes('const itemId = activeItemId();'), 'Item Workspace upload does not capture original context');
assert.ok(itemRuntime.includes('service.uploadItemFile(boardId, itemId, file)'), 'Item Workspace upload does not use captured board/item');
assert.ok(itemController.includes("event.key === 'Escape'") && itemController.includes("event.key !== 'Tab'"), 'Item Workspace controller lacks keyboard lifecycle');

assert.ok(dragController.includes('new AbortController()'), 'Drag/drop controller lacks disposable event binding');
assert.ok(dragController.includes("setAttribute('aria-live','polite')") || dragController.includes("setAttribute('aria-live', 'polite')"), 'Drag/drop controller lacks live accessibility feedback');
assert.ok(dragController.includes('String(groupId) === String(item.group_id)') && dragController.includes('String(status) === String(item.status)'), 'Drag/drop no-op suppression missing');
assert.ok(itemView.includes('role="dialog"') && itemView.includes('role="tablist"') && itemView.includes('role="tabpanel"'), 'Item Workspace accessibility semantics incomplete');

assert.ok(moduleHost.includes("origin === 'null' ? '*' : origin") && moduleHost.includes('event.origin !== origin') && moduleHost.includes('event.source !== frame.contentWindow'), 'Module-host testability change weakened or omitted origin/source validation');
for (const path of [
  './assets/js/features/boards/controllers/item-workspace-controller.ts',
  './assets/js/features/boards/controllers/drag-drop-controller.ts',
]) assert.ok(runtimeAssets.includes(path), `runtime cache manifest missing ${path}`);

assert.ok(browserRunner.includes('run-cdp.mjs') && browserRunner.includes('remote-debugging-port'), 'browser test launcher is incomplete');
for (const token of ['route ownership transitions', 'modal focus and restoration', 'iframe module-host lifecycle', 'drag/drop interaction boundary', 'Item Workspace stale-response and upload isolation', 'Item Workspace accessibility semantics']) {
  assert.ok(browserCdp.includes(token), `browser integration suite missing ${token}`);
}

assert.ok(phase.includes('Architecture Phase Six') && phase.includes('Browser-level integration verification') && phase.includes('No `v1.27.0` Supabase migration is required'), 'Phase Six documentation incomplete');
assert.ok(profile.includes('Item Workspace async state') && profile.includes('Board item search') && profile.includes('TradeLink route scrolling'), 'quality profile does not capture the observed fixes');
assert.ok(checklist.includes('[x] Add browser-level integration verification') && checklist.includes('[x] Perform targeted accessibility/performance review'), 'restructure checklist does not record v1.27 completion');
assert.ok(!fs.existsSync('supabase/migrations/v1.27.0-architecture.sql') && !fs.existsSync('supabase/migrations/v1.27.0.sql'), 'v1.27.0 client/runtime release must not add an unnecessary database migration');

console.log('v1.27.0 domain/browser/quality verification: PASS');
