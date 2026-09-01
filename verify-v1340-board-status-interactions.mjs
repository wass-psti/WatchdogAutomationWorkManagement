import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createStatusLabelEditor } from './assets/js/features/boards/services/status-label-editor.ts';
import {
  STATUS_REFERENCE_POLICY,
  activeStatusLabels,
  normalizeStatusLabels,
  statusConfig,
} from './assets/js/features/boards/status-labels.ts';

const read = (file) => fs.readFileSync(file, 'utf8');
const inline = read('assets/js/features/boards/controllers/inline-edit-controller.ts');
const overlayAdapter = read('assets/js/features/boards/controllers/overlay-coordinator.ts');
const overlay = read('assets/js/platform/ui/overlay-manager.ts');
const status = read('assets/js/features/boards/status-labels.ts');
const ui = read('assets/js/boards-ui.ts');
const itemView = read('assets/js/features/boards/views/item-workspace-view.ts');
const kanban = read('assets/js/features/boards/views/kanban-view.ts');
const core = read('assets/js/features/boards/data/board-repository.ts');
const css = read('assets/css/app.css');
const migration = read('supabase/migrations/v1.34.0-configurable-status-labels.sql');
const schema = read('supabase/schema.sql');
const runtime = read('config/runtime-assets.js');
const manifest = read('config/application-manifest.ts');
const platform = read('assets/js/core/platform.ts');
const sw = read('service-worker.js');

const has = (source, pattern) => pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);

// Explicit rename/editor interaction contract: visible save/cancel controls, Enter confirms,
// Escape cancels, and blur is deliberately not wired as an implicit save trigger.
assert.ok(
  has(inline, 'class="inline-confirm"') && has(inline, 'class="inline-cancel"'),
  'inline editors expose explicit save/cancel controls',
);
assert.ok(
  /event\.key\s*===\s*['"]Enter['"][\s\S]{0,180}?(?:finish\(true\)|save\(\))/.test(inline)
    && /event\.key\s*===\s*['"]Escape['"][\s\S]{0,180}?(?:finish\(false\)|cancel\(\))/.test(inline)
    && !/addEventListener\(\s*['"]blur['"]/.test(inline),
  'inline rename uses Enter=confirm, Escape=cancel, and does not save on blur',
);
assert.ok(
  /closest\(['"]\.inline-confirm['"]\)[\s\S]{0,80}?save\(\)/.test(inline)
    && /closest\(['"]\.inline-cancel['"]\)[\s\S]{0,80}?cancel\(\)/.test(inline),
  'explicit check/X controls map to the same confirm/cancel contract as the keyboard',
);

// Configurable Status manager remains reachable and exposes the complete lifecycle.
for (const marker of [
  'data-manage-status-labels',
  'data-status-label-name',
  'data-status-add',
  'data-status-color-toggle',
  'data-status-move',
  'data-status-toggle-active',
  'data-status-delete',
  'data-status-description',
  'data-status-default',
]) {
  assert.ok(has(inline, marker), `Status interaction marker remains implemented: ${marker}`);
}
assert.ok(has(inline, 'createStatusLabelEditor') && has(inline, 'commands.setStatusLabels'), 'Status manager persists through typed editor + command contracts');

// Execute the authoritative Status model rather than only checking source strings.
const legacyColumn = {
  id: 'status-column',
  system_key: 'status',
  data_type: 'status',
  config: { options: ['Not started', 'In progress', 'Blocked', 'Done'] },
};
const legacyLabels = normalizeStatusLabels(legacyColumn);
assert.deepEqual(
  legacyLabels.map((label) => label.id),
  ['not_started', 'in_progress', 'blocked', 'done'],
  'legacy visible-label options normalize to stable historical Status identifiers',
);
assert.equal(statusConfig(legacyColumn).defaultLabelId, 'not_started', 'legacy Status data resolves a stable default identifier');

const typedColumn = {
  id: 'status-column',
  system_key: 'status',
  data_type: 'status',
  config: {
    labels: [
      { id: 'todo_id', name: 'Todo', color: '#7f8a9a', active: true, description: '', position: 0 },
      { id: 'doing_id', name: 'Doing', color: '#4f7df3', active: true, description: '', position: 1 },
      { id: 'done_id', name: 'Done', color: '#23b784', active: true, description: '', position: 2 },
    ],
    default_label_id: 'todo_id',
  },
};
const editor = createStatusLabelEditor(typedColumn);
editor.rename('todo_id', 'Backlog');
assert.equal(editor.label('todo_id')?.name, 'Backlog', 'Status rename preserves stable identifier identity');
editor.recolor('todo_id', '#123abc');
assert.equal(editor.label('todo_id')?.color, '#123abc', 'Status recolor preserves label identity');
editor.move('done_id', 'up');
assert.deepEqual(editor.snapshot().labels.map((label) => label.id), ['todo_id', 'done_id', 'doing_id'], 'Status reorder is ID-based and deterministic');
editor.setDefault('done_id');
assert.equal(editor.snapshot().defaultId, 'done_id', 'Status default is configured by stable ID');
editor.toggleActive('doing_id');
assert.equal(editor.label('doing_id')?.active, false, 'Status labels can be deactivated');
assert.ok(activeStatusLabels({ ...typedColumn, config: editor.serialize() }).every((label) => label.id !== 'doing_id'), 'inactive labels are excluded from normal active selections');
editor.toggleActive('doing_id');
assert.equal(editor.label('doing_id')?.active, true, 'Status labels can be reactivated');
const createdId = editor.add('QA Review');
assert.match(createdId, /^status_/, 'new Status labels receive generated stable identifiers');
assert.equal(editor.label(createdId)?.name, 'QA Review', 'created Status label is addressable by its stable ID');
editor.remove(createdId);
assert.equal(editor.label(createdId), null, 'Status deletion removes the identifier from the typed configuration');
assert.equal(STATUS_REFERENCE_POLICY, 'clear-on-label-delete', 'Status deletion policy explicitly clears persisted references');

// Overlay coordination must keep one active branch and suppress click-through when
// outside dismissal targets a Board action beneath the overlay.
assert.ok(
  has(overlay, 'closeTop')
    && has(overlay, 'closeAll')
    && /event\.key\s*!==\s*['"]Escape['"]/.test(overlay)
    && has(overlay, 'parentId')
    && has(overlayAdapter, 'createOverlayManager'),
  'single-active overlay coordinator owns dismissal and Escape behavior',
);
assert.ok(
  has(overlay, 'underlyingAction')
    && has(overlay, 'stopImmediatePropagation')
    && has(overlayAdapter, 'underlyingAction'),
  'outside dismissal prevents the same click from leaking into underlying Board row actions',
);
assert.ok(
  /else\s*\{[\s\S]{0,160}?for\s*\(const entry of \[\.\.\.stack\]\.reverse\(\)\)[\s\S]{0,120}?invokeClose/.test(overlay),
  'opening an incompatible root overlay closes the existing overlay branch',
);

assert.ok(has(ui, 'createBoardOverlayCoordinator') && has(ui, 'overlayCoordinator.closeAll') && has(ui, 'statusLabelForValue'), 'Board UI coordinates overlays and resolves configurable statuses');
assert.ok(has(itemView, 'normalizeStatusLabels') && has(itemView, 'configurable-status'), 'Item Workspace resolves current configured Status names/colors');
assert.ok(has(kanban, 'configurable-status-dot') && /name\s*:\s*['"]No status['"]/.test(kanban), 'Kanban renders configurable Status colors and neutral empty state');
assert.ok(has(core, 'wm_set_board_status_labels') && has(core, 'setStatusLabels'), 'Board repository exposes Status-label persistence RPC');

// Database compatibility remains behaviorally protected: fixed legacy constraints are
// removed, deleted references are cleared, and capability flags survive the migration.
assert.ok(has(migration, 'drop constraint if exists work_board_items_status_check') && has(migration, 'alter column status drop not null'), 'migration removes fixed Status constraint and permits a neutral empty value');
assert.ok(has(migration, 'wm_set_board_status_labels') && has(migration, "'stable_status_label_ids',true") && has(migration, "'group_accents',true"), 'migration installs configurable Status RPC without dropping prior capability flags');
assert.ok(has(migration, 'set value=to_jsonb(label.id)') && has(migration, 'set status=null') && has(migration, 'delete from public.work_board_item_values'), 'migration normalizes legacy custom values and safely clears references to deleted labels');
assert.ok(has(schema, '-- Work Management v1.34.0 — configurable Status labels and stable label identifiers') && has(schema, 'wm_set_board_status_labels'), 'consolidated schema includes v1.34.0 Status contract');

assert.ok(has(css, 'v1.34.0 — explicit Board editing + configurable status labels') && has(css, '.status-label-manager') && has(css, '.board-inline-editor-shell'), 'editing and Status surfaces remain styled');
assert.ok(has(runtime, 'status-labels.ts') && has(runtime, 'overlay-coordinator.ts'), 'typed Board runtime modules are pre-cached by their authoritative paths');
assert.ok(has(manifest, "version: '1.43.2'") && has(platform, "PLATFORM_VERSION = '1.43.2'") && has(sw, 'work-management-v1.43.2'), 'release/cache metadata is coherent');
console.log('v1.34.0 Board configurable Status + interaction verification: PASS');
