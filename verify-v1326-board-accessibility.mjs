import fs from 'node:fs';
const css=fs.readFileSync('assets/css/app.css','utf8');
const sw=fs.readFileSync('service-worker.js','utf8');
const checks=[
  ['release block', css.includes('v1.32.6 — Board accessibility and readability pass')],
  ['board title scale', css.includes('font-size:clamp(30px,2.5vw,38px)')],
  ['readable item title', css.includes('.item-title-link,.item-inline-title{font-size:13px')],
  ['larger table rows', css.includes('.board-data-table .board-item-row td{height:58px}')],
  ['larger menu targets', css.includes('.board-floating-menu button{min-height:42px')],
  ['larger workspace tabs', css.includes('.item-panel-tabs button,.item-panel-tabs.wm-motion-nav button{min-height:44px')],
  ['responsive tab scrolling', css.includes('.item-panel-tabs{overflow-x:auto')],
  ['forced colors support', css.includes('@media(forced-colors:active)')],
  ['cache bump', sw.includes("work-management-v1.43.2")],
];
let failed=0; for(const [name,ok] of checks){console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed++;}
if(failed) process.exit(1);
