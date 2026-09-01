import fs from 'node:fs'; import assert from 'node:assert/strict';
const read=(p)=>fs.readFileSync(p,'utf8'); const cfg=JSON.parse(read('apps/fueltrack-plus/fueltrack.config.json'));
assert.equal(cfg.version,'3.17.0','FuelTrack runtime version changed');
const runtime=read('apps/fueltrack-plus/app.v3.17.0-wm6.js');
for(const marker of ['VEHICLE_DIRECTORY','VALID_TRANSITIONS','renderApprovals','renderLightFuels','renderActivity','AUTHENTICATED_ROLE']) assert.ok(runtime.includes(marker),`FuelTrack capability missing ${marker}`);
assert.ok(!runtime.includes('Local Workspace'),'local workspace implementation returned');
console.log('fueltrack-current-package-adaptation-verification: PASS');
