import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css=readFileSync('assets/css/app.css','utf8');
const view=readFileSync('assets/js/features/boards/views/board-workspace-view.ts','utf8');
const controller=readFileSync('assets/js/features/boards/controllers/board-menu-controller.ts','utf8');
const itemView=readFileSync('assets/js/features/boards/views/item-workspace-view.ts','utf8');

assert.ok(css.includes('.item-panel-meta .status-pill,\n.item-panel-meta .item-panel-due'),'shared item metadata geometry missing');
assert.ok(css.includes('height:34px;\n  min-height:34px'),'balanced desktop metadata height missing');
assert.ok(css.includes('.item-panel-meta .status-pill{padding:0 11px}'),'status pill compact padding missing');
assert.ok(css.includes('.item-panel-meta .item-panel-due{padding:0 13px}'),'due-date pill related padding missing');
assert.ok(itemView.includes('class="item-empty-icon" aria-hidden="true">↗</span>'),'Updates empty-state icon contract missing');
assert.ok(css.includes('grid-template-columns:50px minmax(0,1fr) auto!important'),'empty-state grid track must match enlarged icon');
assert.ok(css.includes('column-gap:20px!important'),'empty-state icon/content separation missing');
assert.ok(view.includes('<summary aria-label="${esc(column.name)} column actions" aria-haspopup="menu" aria-expanded="false" data-board-menu-trigger="column">•••</summary>'),'column summary trigger semantics missing');
assert.ok(view.includes('<template data-board-menu-template>'),'column menu must be templated for portal rendering');
assert.ok(controller.includes("overlayLayer.className = 'board-overlay-layer'"),'column menu portal layer missing');
assert.ok(css.includes('.board-floating-menu[data-menu-kind="column"]'),'column portal menu presentation missing');
console.log('v1.33.0 board detail/menu balance verification: PASS');
