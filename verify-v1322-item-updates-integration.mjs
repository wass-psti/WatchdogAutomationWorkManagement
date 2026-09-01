import assert from 'node:assert/strict';
import fs from 'node:fs';

const view=fs.readFileSync('assets/js/features/boards/views/item-workspace-view.ts','utf8');
const controller=fs.readFileSync('assets/js/features/boards/controllers/item-workspace-controller.ts','utf8');
const css=fs.readFileSync('assets/css/app.css','utf8');
const motion=fs.readFileSync('assets/css/motion-design.css','utf8');
const manifest=fs.readFileSync('config/application-manifest.ts','utf8');
const platform=fs.readFileSync('assets/js/core/platform.ts','utf8');
const sw=fs.readFileSync('service-worker.js','utf8');

assert.ok(manifest.includes("version: '1.43.2'"),'manifest release mismatch');
assert.ok(platform.includes("PLATFORM_VERSION = '1.43.2'"),'platform release mismatch');
assert.ok(sw.includes('work-management-v1.43.2'),'service-worker cache mismatch');
assert.ok(view.includes('item-update-typebar')&&view.includes('data-clear-update-draft'),'compact composer controls missing');
assert.ok(view.includes('item-update-kind')&&view.includes('function updateType'),'typed timeline treatment missing');
assert.ok(controller.includes('syncUpdateComposer')&&controller.includes("[data-clear-update-draft]"),'composer state synchronization missing');
assert.ok(controller.includes("setAttribute('aria-pressed'"),'update type pressed state missing');
assert.ok(css.includes('v1.32.2 — Item Workspace Updates visual integration and density pass'),'v1.32.2 style layer missing');
assert.ok(css.includes('.item-update-empty{display:grid!important')&&css.includes('min-height:92px'),'density refinements missing');
assert.ok(motion.includes('v1.32.2 — Updates integration'),'motion integration guard missing');
assert.ok(!fs.existsSync('supabase/migrations/v1.32.2.sql')&&!fs.existsSync('supabase/migrations/v1.32.2-item-updates.sql'),'UI patch must not add migration');
console.log('v1.32.2 Item Workspace Updates integration verification: PASS');
