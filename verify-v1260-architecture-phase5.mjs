import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createCommandRegistry } from './assets/js/features/commands/command-registry.ts';
import { renderBoardHeader, renderBoardControls, renderBoardItemRow, renderBoardColumnHeader } from './assets/js/features/boards/views/board-workspace-view.ts';

const read = (path) => fs.readFileSync(path, 'utf8');
const app = read('assets/js/app.ts');
const runtime = read('assets/js/runtime/index.ts');
const manifest = read('config/application-manifest.ts');
const assets = read('config/runtime-assets.js');
const platform = read('assets/js/core/platform.ts');
const sw = read('service-worker.js');
const home = read('assets/js/features/home/index.ts');
const commands = read('assets/js/features/commands/index.ts');
const registrySource = read('assets/js/features/commands/command-registry.ts');
const boardsUi = read('assets/js/boards-ui.ts');
const boardsFeature = read('assets/js/features/boards/index.ts');
const boardWorkspace = read('assets/js/features/boards/views/board-workspace-view.ts');
const groups = read('assets/js/features/boards/controllers/group-workflows.ts');
const items = read('assets/js/features/boards/controllers/item-workflows.ts');
const members = read('assets/js/features/boards/controllers/member-workflows.ts');
const activity = read('assets/js/features/boards/controllers/activity-workflows.ts');
const activityRuntime = read('assets/js/features/boards/services/board-activity-runtime.ts');
const docs = read('docs/architecture/PHASE-5.md');
const checklist = read('docs/architecture/RESTRUCTURE-CHECKLIST.md');

assert.ok(platform.includes("PLATFORM_VERSION = '1.43.2'"), 'platform version is not v1.27.0');
assert.ok(sw.includes('work-management-v1.43.2'), 'service-worker cache is not v1.27.0');
assert.ok(manifest.includes("version: '1.43.2'") && manifest.includes('architectureVersion: 15'), 'manifest version/architecture mismatch');
assert.ok(manifest.includes("{ id: 'home', pattern: '#/', owner: 'home' }"), 'Home route is not independently owned');
assert.ok(manifest.includes("id: 'commands'"), 'Commands feature is not declared');

assert.ok(runtime.includes('createHomeFeature') && runtime.includes('createCommandPaletteFeature') && runtime.includes('createCommandRegistry'), 'runtime gateway is missing Home/Commands boundaries');
assert.ok(app.includes('const homeFeature = createHomeFeature(') && app.includes("featureRegistry.register('home', homeFeature"), 'Home feature is not instantiated/registered');
assert.ok(app.includes('const commandFeature = createCommandPaletteFeature(') && app.includes("featureRegistry.register('commands', commandFeature"), 'Command feature is not instantiated/registered');
assert.ok(app.includes('home: () => homeFeature.render()'), 'Home route rendering is not delegated');
assert.ok(app.includes('homeFeature.handleAction(action)') && app.includes('homeFeature.handleInput(event.target)') && app.includes('homeFeature.handleKeydown(event)'), 'Home interactions are not delegated');
assert.ok(app.includes('commandFeature.handleAction(action)') && app.includes('commandFeature.handleInput(event.target)') && app.includes('commandFeature.handleKeydown(event)'), 'Command interactions are not delegated');
for (const legacy of ['let commandSelection', 'let commandItems', 'let lastFocused', 'let appFilter', 'let favoritesOnly', 'function renderHome()', 'function commandMarkup()', 'function openCommand()', 'function updateCommandResults(']) {
  assert.ok(!app.includes(legacy), `shell still owns legacy Home/Command implementation: ${legacy}`);
}
for (const token of ['moduleCard(', 'recentSection(', 'data-toggle-favorites', 'recordRecent', 'syncPreferences', 'resetFilters', 'function activate()']) {
  assert.ok(home.includes(token), `Home feature missing ${token}`);
}
for (const token of ['createCommandRegistry', 'Mod+K', 'data-command-index', 'handleKeydown', 'workspace:backup', 'navigate:boards']) {
  assert.ok(commands.includes(token), `Command feature missing ${token}`);
}
for (const token of ['commands.has(id)', 'requires a run function', 'when:', 'snapshot']) {
  assert.ok(registrySource.includes(token), `Command registry missing ${token}`);
}

const registry = createCommandRegistry();
let ran = 0;
registry.register({ id:'visible', title:'Visible', run:()=>{ ran += 1; } });
registry.register({ id:'hidden', title:'Hidden', when:()=>false, run:()=>{ ran += 10; } });
assert.deepEqual(registry.list().map((x)=>x.id), ['visible'], 'command visibility predicate failed');
registry.execute('visible');
assert.equal(ran, 1, 'command execution failed');
assert.throws(()=>registry.register({ id:'visible', run(){} }), /already registered/, 'duplicate command registration is not rejected');

for (const [path, token] of [
  ['group-workflows.js','commands.deleteGroup'],
  ['item-workflows.js','commands.archiveItem'],
  ['member-workflows.js','commands.removeMember'],
  ['activity-workflows.js','activity.loadRecent'],
]) {
  const source = { 'group-workflows.js':groups, 'item-workflows.js':items, 'member-workflows.js':members, 'activity-workflows.js':activity }[path];
  assert.ok(source.includes(token), `${path} missing ${token}`);
}
assert.ok(members.includes('modal.close()') && !members.includes('overlay.remove()'), 'member removal bypasses shared dialog lifecycle');
assert.ok(activity.includes('Loading board activity') && activityRuntime.includes('state.board?.board?.id !== boardId') && activityRuntime.includes('ticket !== epoch'), 'Activity workflow lacks loading/stale-board safeguards');
assert.ok(items.includes("confirmAction('Archive this item? It will be hidden from the active board until you show archived items or restore it.')"), 'item archive safeguard missing');

assert.ok(boardsUi.includes("createGroupWorkflows") && boardsUi.includes('groupWorkflows.open('), 'Group workflows are not wired');
assert.ok(boardsUi.includes("createItemWorkflows") && boardsUi.includes('itemWorkflows.open('), 'Item workflows are not wired');
assert.ok(boardsUi.includes("createMemberWorkflows") && boardsUi.includes('memberWorkflows.open()'), 'Member workflows are not wired');
assert.ok(boardsUi.includes("createActivityWorkflows") && boardsUi.includes('activityWorkflows.open()'), 'Activity workflows are not wired');
for (const legacy of ['function openGroupDialog(', 'function openItemDialog(', 'function openMembers()', 'async function openActivity()']) assert.ok(!boardsUi.includes(legacy), `boards-ui still owns ${legacy}`);
for (const token of ['groupWorkflows.reset()', 'itemWorkflows.reset()', 'memberWorkflows.reset()', 'activityWorkflows.reset()']) assert.ok(boardsUi.includes(token), `Boards teardown missing ${token}`);

assert.ok(boardsUi.includes("board-workspace-view.ts") && boardsUi.includes('renderBoardHeader({') && boardsUi.includes('renderBoardColumnHeader({'), 'Board workspace presentation is not extracted');
for (const token of ['export function renderBoardHeader', 'export function renderBoardControls', 'export function renderBoardItemRow', 'export function renderBoardColumnHeader']) assert.ok(boardWorkspace.includes(token), `Board workspace view missing ${token}`);
assert.ok(boardsFeature.includes("architecture: 'stable-workspace-controller-state-service-views-workflow-and-interaction-controllers'"), 'Boards architecture metadata is stale');

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const header = renderBoardHeader({ board:{ member_role:'owner', name:'Example', description:'Board' }, canEdit:true, canManage:true, icons:{ back:'←' }, escapeHtml:esc });
assert.ok(header.includes('data-board-members') && header.includes('data-board-columns') && header.includes('Example'), 'Board header renderer lost owner/editor actions');
const controls = renderBoardControls({ state:{ board:{ board:{ view_mode:'table' }, groups:[{id:'g1', title:'Main'}], items:[], columns:[], members:[] }, boardPrefs:{ column_filters:{}, sort_column_id:null, sort_direction:null }, itemSearch:'', itemStatus:'all', showArchived:false }, canEdit:true, icons:{ search:'?' }, escapeHtml:esc });
assert.ok(controls.includes('data-add-group') && controls.includes('data-board-view="kanban"'), 'Board controls renderer lost core actions');
const row = renderBoardItemRow({ state:{ itemPanel:{ itemId:null } }, item:{ id:'i1', title:'Task', archived_at:null }, group:{ id:'g1' }, columns:[], canEdit:true, isWrapped:()=>false, formatCell:()=>'', escapeHtml:esc });
assert.ok(row.includes('data-open-item="i1"') && row.includes('data-edit-item="i1"'), 'Board item-row renderer lost item actions');
const col = renderBoardColumnHeader({ column:{ id:'c1', name:'Status', data_type:'status', system_key:null }, canEdit:true, sort:{id:null,direction:null}, filter:'', wrapped:false, columnTypeLabel:()=> 'Status', escapeHtml:esc });
assert.ok(col.includes('data-column-duplicate="c1"') && col.includes('data-column-delete="c1"'), 'Board column-header renderer lost schema actions');

for (const path of [
  './assets/js/features/home/index.ts', './assets/js/features/commands/index.ts', './assets/js/features/commands/command-registry.ts',
  './assets/js/features/boards/views/board-workspace-view.ts', './assets/js/features/boards/controllers/group-workflows.ts',
  './assets/js/features/boards/controllers/item-workflows.ts', './assets/js/features/boards/controllers/member-workflows.ts',
  './assets/js/features/boards/controllers/activity-workflows.ts',
]) assert.ok(assets.includes(path), `runtime cache manifest missing ${path}`);

assert.ok(docs.includes('Architecture Phase Five') && docs.includes('Remaining optional targets'), 'Phase Five documentation incomplete');
assert.ok(checklist.includes('[x] Extract Home/application launcher') && checklist.includes('[x] Extract command-palette') && checklist.includes('[x] Extract Board group/item/member/activity'), 'restructure checklist does not record Phase Five completion');
assert.ok(!fs.existsSync('supabase/migrations/v1.27.0-architecture.sql'), 'architecture-only release must not introduce a v1.26 database migration');

console.log('v1.27.0 architecture phase-five verification: PASS');
