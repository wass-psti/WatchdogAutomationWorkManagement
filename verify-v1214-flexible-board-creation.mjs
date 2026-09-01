import fs from 'node:fs';
const ui=fs.readFileSync('assets/js/boards-ui.ts','utf8');
const core=fs.readFileSync('assets/js/features/boards/data/board-repository.ts','utf8');
const tableView=fs.readFileSync('assets/js/features/boards/views/table-view.ts','utf8');
const sql=fs.readFileSync('supabase/migrations/v1.21.4-flexible-board-creation.sql','utf8');
const css=fs.readFileSync('assets/css/app.css','utf8');
const checks=[
  ['empty board option',ui.includes('Start empty')],
  ['custom starting columns option',ui.includes('Choose starting columns')],
  ['no fixed Item setup',!ui.includes('Item (Text)')],
  ['configured create RPC client',core.includes("wm_create_board_configured")],
  ['atomic configured create RPC',sql.includes('wm_create_board_configured')],
  ['legacy create no default seed',!/create or replace function public\.wm_create_board\([\s\S]*?work_board_seed_default_columns\(bid,caller\)/.test(sql)],
  ['duplicate preserves empty schema',!sql.includes('if not exists(select 1 from public.work_board_columns where board_id=new_id) then perform public.work_board_seed_default_columns')],
  ['empty schema remains operable',tableView.includes('No custom columns yet.') && tableView.includes('+ Add column') && tableView.includes('data-inline-add-item')],
  ['setup styling',css.includes('.board-setup-columns')],
];
const failed=checks.filter(([,ok])=>!ok);for(const [name,ok] of checks)console.log(`${ok?'PASS':'FAIL'} ${name}`);if(failed.length)process.exit(1);
