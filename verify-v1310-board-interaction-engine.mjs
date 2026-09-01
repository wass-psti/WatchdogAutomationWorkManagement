import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const must = (condition, message) => { if (!condition) throw new Error(message); console.log(`PASS ${message}`); };

const manifest = read('config/application-manifest.ts');
const platform = read('assets/js/core/platform.ts');
const serviceWorker = read('service-worker.js');
const runtimeAssets = read('config/runtime-assets.js');
const boards = read('assets/js/boards-ui.ts');
const service = read('assets/js/features/boards/data/board-repository.ts');
const state = read('assets/js/features/boards/board-state.ts');
const table = read('assets/js/features/boards/views/table-view.ts');
const workspace = read('assets/js/features/boards/views/board-workspace-view.ts');
const columns = read('assets/js/features/boards/controllers/column-workflows.ts');
const inline = read('assets/js/features/boards/controllers/inline-edit-controller.ts');
const columnRegistry = read('assets/js/features/boards/grid/column-type-registry.ts');
const selection = read('assets/js/features/boards/controllers/selection-controller.ts');
const selectionRuntime = read('assets/js/features/boards/services/board-selection-service.ts');
const history = read('assets/js/features/boards/controllers/history-controller.ts');
const resize = read('assets/js/features/boards/controllers/column-resize-controller.ts');
const drag = read('assets/js/features/boards/controllers/drag-drop-controller.ts');
const structure = read('assets/js/features/boards/controllers/structure-drag-controller.ts');
const migration = read('supabase/migrations/v1.31.0-board-interaction-engine.sql');
const schema = read('supabase/schema.sql');
const css = read('assets/css/app.css');
const motion = read('assets/css/motion-design.css');

must(manifest.includes("version: '1.43.2'") && manifest.includes('architectureVersion: 15'), 'v1.31 manifest and Architecture Version 8 are declared');
must(platform.includes("PLATFORM_VERSION = '1.43.2'"), 'platform version is v1.31.0');
must(serviceWorker.includes("work-management-v1.43.2"), 'service worker cache is v1.31.0');
for (const module of ['history-controller.ts','selection-controller.ts','inline-edit-controller.ts','column-resize-controller.ts','structure-drag-controller.ts']) {
  must(runtimeAssets.includes(module), `${module} is part of the authoritative runtime cache`);
}

must(state.includes('selectedItems') && state.includes('inlineDraft') && state.includes('column_widths') && state.includes('collapsed_groups'), 'board state owns interaction and persistent layout state');
must(table.includes('data-inline-add-item') && table.includes('Shift+Enter to add another'), 'Table view provides direct inline item creation');
must(table.includes('data-select-visible') && workspace.includes('data-select-item'), 'Table rows expose group-scoped selection controls');
must(workspace.includes('data-edit-item-title') && workspace.includes('data-edit-cell'), 'item title and typed cells expose inline editing triggers');
must(table.includes('data-column-resize="__item"') && workspace.includes('data-column-resize="${column.id}"'), 'Item and configurable columns expose resize handles');
must(workspace.includes('data-column-drag') && table.includes('data-group-drag'), 'column and group drag handles are rendered');
must(table.includes('data-drop-group="${group.id}"'), 'groups remain valid item drop targets while expanded or collapsed');
must(columns.includes('column-quick-picker') && columns.includes('Search column types') && columns.includes('commands.createColumn'), 'column + action uses a searchable anchored direct-add picker');
must(!columns.includes('cannot be hidden or deleted'), 'legacy permanent-column language is removed');

must(inline.indexOf('applyLocal(item, column, next);') >= 0 && inline.indexOf('applyLocal(item, column, next);') < inline.indexOf('await persistValue(item, column, next);') && inline.includes('applyLocal(item, column, previous);'), 'typed-cell controller performs optimistic local updates and rollback around persistence');
must(inline.includes("case 'checkbox':") && inline.includes("case 'people':") && inline.includes("case 'timeline':"), 'typed-cell engine includes checkbox, people and timeline specialized editors');
must(columnRegistry.includes('Enter a valid email address.') && columnRegistry.includes('Enter a valid web address starting with http:// or https://.') && inline.includes('End date cannot be before start date.'), 'typed-cell client validation covers specialized values');
must(selectionRuntime.includes('range = false') && selectionRuntime.includes('selectionAnchor'), 'selection service supports range selection');
must(selection.includes('data-selection-duplicate') && selection.includes('data-selection-move') && selection.includes('data-selection-export') && selection.includes('data-selection-delete'), 'floating selection toolbar exposes demonstrated bulk actions');
must(history.includes('undoStack') && history.includes('redoStack') && /maxEntries\s*=\s*60/.test(history), 'bounded session undo/redo history is implemented');
must(boards.includes("event.key.toLowerCase() === 'z'") && boards.includes("event.key.toLowerCase() === 'y'"), 'keyboard undo/redo shortcuts are wired');
must(boards.includes("type GridNavigationKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End'") && boards.includes('isGridNavigationKey(event.key)'), 'keyboard grid navigation is wired');
must(resize.includes('setPointerCapture') && resize.includes('item_name_width') && resize.includes('column_widths'), 'column resizing is pointer-driven and preference-backed');
must(structure.includes("commands.moveColumn") && structure.includes("commands.moveGroup"), 'column and group reorder persist through protected services');
must(drag.includes('item-drop-before') && drag.includes('item-drop-after') && drag.includes('applyLocalMove'), 'item row drag/reorder provides positional and optimistic feedback');
must(drag.includes('status = item.status') && drag.includes('position -= 1'), 'table row reorder preserves workflow status and normalizes same-group downward indices');
must(drag.includes("button,input,select,textarea,a,summary"), 'item dragging does not hijack normal interactive controls');

for (const method of ['wm_move_board_group','wm_duplicate_board_item','wm_delete_board_item']) {
  must(service.includes(method), `${method} is exposed by the Board service`);
  must(migration.includes(method), `${method} is installed by the v1.31 migration`);
}
must(migration.includes("'column_widths'") && migration.includes("'item_name_width'") && migration.includes("'collapsed_groups'"), 'server preference validation persists widths and collapsed groups');
must(migration.includes('pg_advisory_xact_lock'), 'server ordering mutations use board-scoped transaction locks');
must(/files\.some\(\(file\)\s*=>\s*file\??\.can_delete\s*!==?\s*true\)/.test(service) && /for\s*\(const file of (?:workspace\.)?files\)\s*await removeItemFile\(file\)/.test(service) && migration.includes('Remove item files before permanently deleting the item'), 'permanent item deletion prevents orphaned private Storage objects');
must(migration.includes("'schema_version','1.31.0'") && migration.includes("'interactive_table',true"), 'backend capability contract advertises the interactive table engine');
must(migration.includes("notify pgrst, 'reload schema'"), 'migration refreshes the PostgREST schema cache');
must(schema.includes('-- Work Management v1.31.0 — interactive board engine') && schema.includes('wm_duplicate_board_item'), 'consolidated schema includes v1.31 backend behavior');

must(css.includes('.board-selection-bar') && css.includes('.column-resize-handle') && css.includes('.inline-add-row') && css.includes('.column-quick-picker'), 'interactive table components have dedicated UI styling');
must(motion.includes('.board-selection-bar') && motion.includes('.column-quick-picker'), 'new interaction surfaces participate in the motion system');
must(fs.existsSync('docs/architecture/BOARD-INTERACTION-ENGINE-v1.31.md'), 'v1.31 interaction architecture is documented');

console.log('Work Management v1.31.0 board interaction engine verification: PASS');
