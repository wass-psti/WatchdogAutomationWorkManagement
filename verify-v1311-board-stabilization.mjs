import fs from 'node:fs';
import assert from 'node:assert/strict';

const read=(path)=>fs.readFileSync(path,'utf8');
const manifest=read('config/application-manifest.ts');
const platform=read('assets/js/core/platform.ts');
const sw=read('service-worker.js');
const boards=read('assets/js/boards-ui.ts');
const css=read('assets/css/app.css');
const inline=read('assets/js/features/boards/controllers/inline-edit-controller.ts');
const workspace=read('assets/js/features/boards/views/item-workspace-view.ts');
const browser=read('tests/browser/run-cdp.mjs');
const docs=read('docs/architecture/BOARD-STABILIZATION-v1.31.1.md');
const readme=read('README.md');

assert.ok(manifest.includes("version: '1.43.2'") && manifest.includes('architectureVersion: 15'),'manifest version/architecture mismatch');
assert.ok(platform.includes("PLATFORM_VERSION = '1.43.2'"),'platform version mismatch');
assert.ok(sw.includes('work-management-v1.43.2'),'service-worker cache mismatch');

const menuController=read('assets/js/features/boards/controllers/board-menu-controller.ts');
for(const token of ['createBoardMenuController','data-board-menu-trigger','boardMenuController?.handleTrigger','boardMenuController?.close'])
  assert.ok(`${boards}\n${menuController}`.includes(token),`Board row-menu lifecycle missing ${token}`);
assert.ok(css.includes('.board-floating-menu{position:fixed'),'item menu is not fixed-position outside table clipping');
assert.ok(css.includes('.interactive-board-table .actions-head,') && css.includes('position:sticky;right:0'),'row action utility column is not sticky');
assert.ok(css.includes('th.selection-cell') && css.includes('th.drag-cell'),'selection/drag utility columns lack stable sticky geometry');

assert.ok(inline.includes('deferRender = false') && inline.includes('if (!deferRender) renderBoardData()'),'recoverable inline persistence boundary missing');
assert.ok(inline.includes("setFormPending(form, true, 'Saving…')"),'inline editor lacks pending save feedback');
assert.ok(inline.includes("setFormPending(form, false, 'Not saved')"),'inline editor lacks failed save state');
assert.ok(inline.includes('Your draft is still here—review it and try again.'),'inline editor does not preserve/recover failed draft UX');
assert.ok(inline.includes("form.setAttribute('aria-busy'"),'inline editor pending state is not exposed accessibly');
assert.ok(inline.includes('const form = event.target instanceof HTMLFormElement ? event.target : null;'),'inline form submit must resolve the submitted form instead of the popover listener currentTarget');

assert.ok(workspace.includes('function humanActivityLabel') && workspace.includes('function compactItemActivity'),'Item Activity translation/compaction boundary missing');
assert.ok(workspace.includes("payload.column_name || 'Field'"),'Item Activity does not name changed fields');
assert.ok(workspace.includes('related changes'),'Item Activity does not expose compacted count');
assert.ok(!workspace.includes('<code>${esc(event.event_type)}</code>'),'raw activity event code is still rendered');

for(const token of ['recorded Board menu geometry, editor recovery and activity compaction','row context menu escapes the horizontally clipped table','failed long-text save keeps the entered draft available for retry','consecutive repetitive cell updates are compacted'])
  assert.ok(browser.includes(token),`Chromium regression coverage missing ${token}`);
assert.ok(docs.includes('Row context-menu clipping') && docs.includes('Long Text / Timeline persistence ambiguity') && docs.includes('Item Activity noise'),'v1.31.1 architecture note incomplete');
assert.ok(readme.includes('No `v1.31.1` Supabase migration is required'),'README compatibility note missing');
assert.ok(!fs.existsSync('supabase/migrations/v1.31.1-board-stabilization.sql') && !fs.existsSync('supabase/migrations/v1.31.1.sql'),'client-only stabilization must not add a v1.31.1 database migration');

console.log('v1.31.1 Work Boards stabilization verification: PASS');
