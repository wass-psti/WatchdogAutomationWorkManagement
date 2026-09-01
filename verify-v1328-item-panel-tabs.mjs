import fs from 'node:fs';
const css=fs.readFileSync('assets/css/app.css','utf8');
const motion=fs.readFileSync('assets/css/motion-design.css','utf8');
const view=fs.readFileSync('assets/js/features/boards/views/item-workspace-view.ts','utf8');
const sw=fs.readFileSync('service-worker.js','utf8');
const platform=fs.readFileSync('assets/js/core/platform.ts','utf8');
const assertions = [
  ['three semantic tabs retained', /tabButton\('updates', 'Updates'/.test(view) && /tabButton\('files', 'Files'/.test(view) && /tabButton\('activity', 'Activity'/.test(view)],
  ['tablist semantics retained', /role="tablist"/.test(view) && /role="tab"/.test(view)],
  ['desktop tab label remains at least as readable as v1.32.8', /font-size:18px/.test(motion.slice(motion.lastIndexOf('v1.32.10')))],
  ['desktop tab target remains at least as large as v1.32.8', /min-height:76px/.test(motion.slice(motion.lastIndexOf('v1.32.10')))],
  ['desktop rail remains at least as large as v1.32.8', /min-height:86px/.test(motion.slice(motion.lastIndexOf('v1.32.10')))],
  ['visible keyboard focus', /item-panel-tabs button:focus-visible/.test(css)],
  ['narrow labels remain readable', /font-size:16px/.test(motion.slice(motion.lastIndexOf('v1.32.10')))],
  ['motion indicator remains proportionate', /item-panel-tabs\.wm-motion-nav \.wm-motion-indicator[\s\S]*height:4px/.test(motion.slice(motion.lastIndexOf('v1.32.10')))],
  ['release cache advanced', /work-management-v1\.43\.2/.test(sw)],
  ['platform advanced', /1\.43\.2/.test(platform)],
];
let failed=0;
for (const [name,ok] of assertions){ console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed++; }
if(failed) process.exit(1);
