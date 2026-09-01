import fs from 'node:fs'; import assert from 'node:assert/strict'; const read=(p)=>fs.readFileSync(p,'utf8');
const runtime=read('apps/tradelink/app.v1.42.0-wm1.js'); const domain=read('apps/tradelink/domain-config.js'); const html=read('apps/tradelink/runtime.html'); const modules=read('config/modules.ts'); const sw=read('service-worker.js'); const bootstrap=read('assets/js/runtime/module-bootstrap.ts');
for(const marker of ['work-management-cloud','currentUser']) assert.ok(runtime.includes(marker),`TradeLink runtime integration missing ${marker}`);
assert.ok(domain.includes('tradelink_state_v1'),'TradeLink domain persistence key missing');
assert.ok(html.includes('./domain-config.js'),'TradeLink domain configuration boot missing');
assert.ok(html.includes('module-bootstrap.ts'),'TradeLink cloud store boot missing'); assert.ok(html.includes('startEmbeddedModule') && bootstrap.includes('cloud.store.ready()'),'TradeLink cloud hydration missing');
assert.ok(modules.includes("id: 'tradelink'"),'TradeLink registry missing'); assert.ok(sw.includes("work-management-v1.43.2"),'service worker release mismatch');
assert.ok(!runtime.includes('localStorage')&&!runtime.includes('sessionStorage'),'TradeLink local persistence returned');
console.log('tradelink-integration-verification: PASS');
