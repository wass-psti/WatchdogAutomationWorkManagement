import fs from 'node:fs';
import assert from 'node:assert/strict';
import { applicationManifest, validateApplicationManifest } from './config/application-manifest.ts';
import { createQueryClient } from './assets/js/platform/data/query-client.ts';
import { createDiagnostics } from './assets/js/platform/observability/diagnostics.ts';
import { CAPABILITIES, hasPlatformCapability, hasBoardCapability, canAccessModuleByPolicy } from './assets/js/platform/auth/permissions.ts';
import { getBoardColumnType, boardColumnTypes, normalizeBoardCellValue, registerBoardColumnType } from './assets/js/features/boards/grid/column-type-registry.ts';

const read=(path)=>fs.readFileSync(path,'utf8');
const exists=(path)=>fs.existsSync(path);

assert.equal(applicationManifest.version,'1.43.2','application manifest version mismatch');
assert.equal(applicationManifest.architectureVersion,15,'architecture version mismatch');
assert.equal(applicationManifest.architecture?.style,'modular-platform','platform architecture metadata missing');
assert.equal(validateApplicationManifest(applicationManifest).valid,true,'application manifest should validate');
assert.equal(exists('supabase/migrations/v1.35.0-platform-modernization.sql'),false,'architecture-only v1.35 must not invent a database migration');

// Server-state cache: in-flight dedupe, fresh-cache reuse, targeted invalidation.
const diagnostics=createDiagnostics({limit:40});
const queries=createQueryClient({diagnostics,defaultStaleTime:30_000});
let calls=0;
let release;
const gate=new Promise((resolve)=>{release=resolve;});
const queryFn=async()=>{calls+=1;await gate;return {value:calls};};
const first=queries.fetchQuery({key:['boards-user','u1','board','b1'],queryFn});
const second=queries.fetchQuery({key:['boards-user','u1','board','b1'],queryFn});
await Promise.resolve();
assert.equal(calls,1,'query client should deduplicate an in-flight request');
release();
assert.deepEqual(await first,{value:1});
assert.deepEqual(await second,{value:1});
const cached=await queries.fetchQuery({key:['boards-user','u1','board','b1'],queryFn:async()=>{calls+=1;return {value:calls};}});
assert.deepEqual(cached,{value:1},'fresh cached server state should be reused');
assert.equal(calls,1,'fresh cache should avoid another request');
assert.equal(queries.invalidateQueries(['boards-user','u1','board']),1,'prefix invalidation should target the board query');
const refreshed=await queries.fetchQuery({key:['boards-user','u1','board','b1'],queryFn:async()=>{calls+=1;return {value:calls};}});
assert.deepEqual(refreshed,{value:2},'invalidated query should refresh');

// Capability policy retains existing role behavior without requiring UI role comparisons.
assert.equal(hasPlatformCapability('admin_general_manager',CAPABILITIES.ROLE_MANAGE),true,'admin role should manage roles');
assert.equal(hasPlatformCapability('employee',CAPABILITIES.ROLE_MANAGE),false,'employee must not manage roles');
assert.equal(hasBoardCapability('owner',CAPABILITIES.BOARD_MANAGE),true,'board owner should manage board');
assert.equal(hasBoardCapability('editor',CAPABILITIES.BOARD_EDIT),true,'board editor should edit board');
assert.equal(hasBoardCapability('editor',CAPABILITIES.BOARD_MANAGE),false,'board editor should not inherit owner management');
assert.equal(canAccessModuleByPolicy({authenticated:true,accountActive:true,platformRole:'employee',assignments:[{module_id:'time-tracker',enabled:true}],moduleId:'time-tracker'}),true,'enabled module assignment should grant module access');
assert.equal(canAccessModuleByPolicy({authenticated:false,accountActive:true,platformRole:'admin_general_manager',moduleId:'time-tracker'}),false,'authentication remains required');

// Board column registry provides the extension seam and primitive trust-boundary normalization.
for(const type of ['text','long_text','number','status','dropdown','date','people','checkbox','timeline','email','url']) assert.ok(getBoardColumnType(type),`missing column type ${type}`);
assert.ok(boardColumnTypes().length>=11,'column registry should expose current types');
assert.equal(normalizeBoardCellValue('number','12.5'),12.5);
assert.equal(normalizeBoardCellValue('email',' Person@Example.COM '),'person@example.com');
assert.equal(normalizeBoardCellValue('url','https://example.com/a'),'https://example.com/a');
assert.throws(()=>normalizeBoardCellValue('number','not-a-number'),/valid number/);
assert.throws(()=>registerBoardColumnType({id:'text'}),/already registered/,'duplicate column type registration must fail');

// Diagnostics are bounded and redact sensitive object keys.
diagnostics.info('TEST','diagnostic',{token:'secret',nested:{authorization:'Bearer secret',safe:'ok'}});
const diagnostic=diagnostics.snapshot().at(-1);
assert.equal(diagnostic.context.token,'[redacted]');
assert.equal(diagnostic.context.nested.authorization,'[redacted]');
assert.equal(diagnostic.context.nested.safe,'ok');

const coreBoards=read('assets/js/core/boards.ts');
const repo=read('assets/js/features/boards/data/board-repository.ts');
const backend=read('assets/js/platform/data/backend-client.ts');
const boardUi=read('assets/js/boards-ui.ts');
const boardController=read('assets/js/features/boards/boards-controller.ts');
const auth=read('assets/js/core/auth.ts');
const overlayAdapter=read('assets/js/features/boards/controllers/overlay-coordinator.ts');
const overlay=read('assets/js/platform/ui/overlay-manager.ts');
const app=read('assets/js/app.ts');
const runtime=read('assets/js/runtime/index.ts');
const cache=read('config/runtime-assets.js');
const sw=read('service-worker.js');
const architecture=read('docs/architecture/PLATFORM-MODERNIZATION-v1.35.md');

assert.ok(coreBoards.includes('createBoardRepository')&&!coreBoards.includes('/rest/v1/rpc/'),'core Boards path should be a transport-free compatibility facade');
assert.ok(repo.includes("rpc('wm_list_boards'")&&repo.includes('createBackendClient')&&repo.includes('queries.fetchQuery'),'Board repository should own RPC semantics and query state');
assert.ok(backend.includes('/rest/v1/rpc/${name}')&&backend.includes('/storage/v1/object/'),'backend client should own Supabase transport construction');
assert.equal(boardUi.includes('/rest/v1/rpc/'),false,'Board UI must not construct backend RPC URLs');
assert.ok(boardController.includes('createService')&&boardController.includes('createView'),'Boards controller should consume an injected domain-service factory');
assert.ok(auth.includes('CAPABILITIES')&&auth.includes('canAccessModuleByPolicy'),'authentication service should delegate capability policy');
assert.ok(overlayAdapter.includes('createOverlayManager'),'Boards should adapt the shared overlay lifecycle');
for(const token of ['parentId','closeTop','closeAll','pointerdown','Escape']) assert.ok(overlay.includes(token),`shared overlay manager missing ${token}`);
assert.ok(app.includes('createPlatformServices')&&app.includes('createRuntimeErrorBoundary')&&app.includes('renderRouteFailure'),'shell should compose platform services and route recovery');
for(const token of ['createQueryClient','createBackendClient','createOverlayManager','CAPABILITIES','createPlatformServices']) assert.ok(runtime.includes(token),`runtime gateway missing ${token}`);
for(const asset of [
  './assets/js/runtime/error-boundary.ts',
  './assets/js/runtime/platform-services.ts',
  './assets/js/platform/errors/app-error.ts',
  './assets/js/platform/observability/diagnostics.ts',
  './assets/js/platform/data/query-client.ts',
  './assets/js/platform/data/backend-client.ts',
  './assets/js/platform/auth/permissions.ts',
  './assets/js/platform/ui/overlay-manager.ts',
  './assets/js/features/boards/data/board-contracts.ts',
  './assets/js/features/boards/data/board-repository.ts',
  './assets/js/features/boards/grid/column-type-registry.ts',
]) assert.ok(cache.includes(asset),`runtime cache manifest missing ${asset}`);
assert.ok(sw.includes('work-management-v1.43.2'),'service worker cache not advanced');
for(const topic of ['Server state','Framework/library evaluation','Module boundaries','TypeScript','Vite','Playwright','TanStack Table','Floating UI']) assert.ok(architecture.includes(topic),`architecture evaluation missing ${topic}`);

// Guard the strongest business-module boundary: native Boards must not import implementation files from embedded domains.
for(const path of fs.readdirSync('assets/js/features/boards',{recursive:true}).filter((entry)=>String(entry).endsWith('.js'))){
  const source=read(`assets/js/features/boards/${path}`);
  assert.equal(/apps\/(time-tracker|fueltrack-plus|tradelink)/.test(source),false,`Boards has a forbidden embedded-domain dependency: ${path}`);
}

console.log('v1.35.0 platform architecture verification: PASS');
