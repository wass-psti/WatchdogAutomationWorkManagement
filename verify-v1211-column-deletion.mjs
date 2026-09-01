import fs from 'node:fs';
const workspaceView=fs.readFileSync(new URL('./assets/js/features/boards/views/board-workspace-view.ts',import.meta.url),'utf8');
const workflows=fs.readFileSync(new URL('./assets/js/features/boards/controllers/column-workflows.ts',import.meta.url),'utf8');
const svc=fs.readFileSync(new URL('./assets/js/features/boards/data/board-repository.ts',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('./supabase/schema.sql',import.meta.url),'utf8');
const originalMigration=fs.readFileSync(new URL('./supabase/migrations/v1.20.0-board-columns.sql',import.meta.url),'utf8');
const currentMigration=fs.readFileSync(new URL('./supabase/migrations/v1.31.0-board-interaction-engine.sql',import.meta.url),'utf8');
const must=(ok,msg)=>{if(!ok)throw new Error(msg)};
must(workspaceView.includes('data-column-delete="${column.id}"'),'Column context menu exposes Delete column.');
must(workflows.includes('function openDelete'),'Column deletion uses a dedicated confirmation workflow.');
must(workflows.includes('populatedColumnValueCount'),'Deletion dialog discloses populated-cell impact.');
must(workflows.includes('removeColumnPreferenceReferences'),'Deletion removes stale filter/sort/wrap/width preferences.');
must(workflows.includes('confirm_delete') && workflows.includes('required'),'Destructive populated-column deletion requires acknowledgement.');
must(!workflows.includes('cannot be hidden or deleted') && workflows.includes("column?.system_key === 'title'") && workflows.includes('Removing this column does not remove the item name'),'Current client treats legacy linked presentation columns as removable while preserving Item identity.');
must(svc.includes('wm_delete_board_column'),'Board service calls the protected deletion RPC.');
must(originalMigration.includes('Core board columns cannot be deleted'),'Historical v1.20 migration retains its original core-column protection for migration integrity.');
for(const source of [sql,currentMigration]){
  must(source.includes('create or replace function public.wm_delete_board_column'),'Current database contract defines protected column deletion RPC.');
  must(source.includes('delete from public.work_board_columns where id=c.id'),'Current database contract deletes the selected schema row.');
  must(source.includes("'column.deleted'"),'Current database contract records deletion in board Activity.');
}
must(!currentMigration.includes('Core board columns cannot be deleted'),'v1.31 intentionally removes the legacy presentation-column permanence restriction.');
console.log('v1.21.2/v1.31 column deletion compatibility verification: PASS');
