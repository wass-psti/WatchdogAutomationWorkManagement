import fs from 'node:fs'; import assert from 'node:assert/strict'; const read=(p)=>fs.readFileSync(p,'utf8');
const runtime=read('apps/fueltrack-plus/app.v3.17.0-wm6.js'); const html=read('apps/fueltrack-plus/runtime.html'); const bootstrap=read('assets/js/runtime/module-bootstrap.ts'); const css=read('apps/fueltrack-plus/styles.v3.17.0-wm6.css'); const cfg=JSON.parse(read('apps/fueltrack-plus/fueltrack.config.json')); const modules=read('config/modules.ts');
assert.equal(cfg.version,'3.17.0'); assert.ok(html.includes('startEmbeddedModule')); assert.ok(html.includes('optionalActivityReady: true')); assert.ok(bootstrap.includes('cloud.store.ready()') && bootstrap.includes('globalThis.WMModuleActivity?.ready()'));
for(const marker of ['Dashboard','Analytics','All Requests','New Fuel Request','Approvals','LightFuels','Activity','Roles']) assert.ok(html.includes(marker),`missing UI module ${marker}`);
for(const marker of ['AUTHENTICATED_ROLE','createdByUserId','commitRequestsWithActivity','cloudRoleDirectory']) assert.ok(runtime.includes(marker),`missing integration marker ${marker}`);
assert.ok(css.length>1000,'FuelTrack CSS unexpectedly empty'); assert.ok(modules.includes("id: 'fueltrack-plus'"),'module registry missing FuelTrack');
assert.ok(!runtime.includes('localStorage')&&!runtime.includes('sessionStorage'),'browser-local persistence returned');
console.log('fueltrack-integration-verification: PASS');
