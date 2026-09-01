import fs from 'node:fs';
const ui=fs.readFileSync('assets/js/boards-ui.ts','utf8');
const workspaceView=fs.readFileSync('assets/js/features/boards/views/item-workspace-view.ts','utf8');
const uiContract=ui+workspaceView;
const api=fs.readFileSync('assets/js/features/boards/data/board-repository.ts','utf8')+fs.readFileSync('assets/js/platform/data/backend-client.ts','utf8');
const sql=fs.readFileSync('supabase/migrations/v1.21.6-item-workspace.sql','utf8');
const css=fs.readFileSync('assets/css/app.css','utf8');
const checks=[
 ['item detail trigger',uiContract.includes('data-open-item')],
 ['updates tab',workspaceView.includes("tabButton('updates'") && workspaceView.includes('data-item-panel-tab="${id}"')],
 ['files tab',workspaceView.includes("tabButton('files'")],
 ['activity tab',workspaceView.includes("tabButton('activity'")],
 ['composer',uiContract.includes('data-item-update-form')],
 ['file input',uiContract.includes('data-item-file-input')],
 ['private signed files',api.includes('/storage/v1/object/sign/${encodeURIComponent(bucket)}/')],
 ['20 MB client limit',/20\s*\*\s*1024\s*\*\s*1024/.test(api)],
 ['workspace rpc client',api.includes("wm_get_board_item_workspace")],
 ['updates table',sql.includes('work_board_item_updates')],
 ['files table',sql.includes('work_board_item_files')],
 ['private bucket',sql.includes("'work-board-files','work-board-files',false")],
 ['storage rls',sql.includes('wm board files read')&&sql.includes('wm board files insert')&&sql.includes('wm board files delete')],
 ['server access checks',sql.includes("work_board_access(bid,'view')")],
 ['postgrest refresh',sql.includes("notify pgrst, 'reload schema'")],
 ['responsive panel',css.includes('.board-item-panel')&&css.includes('@media(max-width:600px)')],
 ['reduced motion',css.includes('.board-item-panel,.item-panel-scrim{animation:none!important}')],
];
let failed=0;for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed++;}if(failed)process.exit(1);
