import fs from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

const [debugPort] = process.argv.slice(2);
if (!debugPort) throw new Error('Usage: node run-cdp.mjs <debugPort>');

const endpoint = `http://127.0.0.1:${debugPort}`;
let target;
for (let i = 0; i < 300; i++) {
  try {
    const rows = await fetch(`${endpoint}/json/list`).then((response) => response.json());
    target = rows.find((row) => row.type === 'page');
    if (target?.webSocketDebuggerUrl) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 50));
}
if (!target?.webSocketDebuggerUrl) throw new Error(`Chromium DevTools endpoint did not become available at ${endpoint} within 15 seconds.`);

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
let sequence = 0;
const pending = new Map();
ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
});
function call(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression, { awaitPromise = false, returnByValue = true } = {}) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise, returnByValue, userGesture: true });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Browser evaluation failed.';
    throw new Error(detail);
  }
  return result.result?.value;
}

await call('Runtime.enable');
// Keep browser integration geometry deterministic across Linux/macOS/Windows headless Chrome.
// Several Board assertions intentionally exercise desktop-only sticky-column behavior; relying
// on each browser's implicit headless viewport can accidentally activate the <=760px mobile CSS.
await call('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
  screenWidth: 1440,
  screenHeight: 1000,
});
await evaluate(`document.body.dataset.wmSurface='shell'; document.body.innerHTML='<button id="returnFocus">Return focus target</button><div id="overlayRoot"></div><div id="boardRoot"></div><div id="itemHost" data-item-panel-host></div>'; document.title='Work Management browser integration'; true;`);

const motionOrchestratorPath = 'assets/js/runtime/motion-orchestrator.ts';
const motionOrchestratorSource = await fs.readFile(motionOrchestratorPath, 'utf8');
await evaluate(transformModule(transpileBrowserModule(motionOrchestratorPath, motionOrchestratorSource), []));
const motionRuntimePath = 'assets/js/runtime/motion-design.ts';
const motionRuntimeSource = await fs.readFile(motionRuntimePath, 'utf8');
await evaluate(transformModule(transpileBrowserModule(motionRuntimePath, motionRuntimeSource), []));

const finalPresentationCss = [
  await fs.readFile('assets/css/foundation/tokens.css', 'utf8'),
  await fs.readFile('assets/css/foundation/themes.css', 'utf8'),
  await fs.readFile('assets/css/foundation/primitives.css', 'utf8'),
  await fs.readFile('assets/css/app.css', 'utf8'),
  await fs.readFile('assets/css/foundation/components.css', 'utf8'),
  await fs.readFile('assets/css/foundation/application-migration.css', 'utf8'),
].join('\n');
const themeCssSources = {
  app: await fs.readFile('assets/css/app.css', 'utf8'),
  motion: await fs.readFile('assets/css/motion-design.css', 'utf8'),
  timeTracker: await fs.readFile('apps/time-tracker/styles.css', 'utf8'),
  fuelTrack: (await fs.readFile('apps/fueltrack-plus/styles.v3.17.0-wm6.css', 'utf8')).replace(/^@import[^\n]*\n/, ''),
  tradeLink: await fs.readFile('apps/tradelink/styles.v1.42.0-wm1.css', 'utf8'),
  finalPresentation: finalPresentationCss,
};
await evaluate(`globalThis.__wmThemeCss=${JSON.stringify(themeCssSources)}; true;`);

function transpileBrowserModule(path, source) {
  if (!path.endsWith('.ts')) return source;
  try {
    return stripTypeScriptTypes(source, {
      mode: 'strip',
      sourceMap: false,
      sourceUrl: path,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.stack || error.message : String(error);
    throw new Error(`Browser integration TypeScript transpilation failed for ${path}:\n${detail}`, { cause: error });
  }
}

function transformModule(source, globals) {
  let code = source
    .replace(/^import\s+[^;]+;\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:async\s+)?function\b)/g, '')
    .replace(/\bexport\s+(?=const\b)/g, '')
    .replace(/\bexport\s+(?=class\b)/g, '')
    .replace(/^export\s*\{\s*\};?\s*$/gm, '');
  return `(()=>{\n${code}\nObject.assign(globalThis,{${globals.join(',')}});\nreturn true;\n})()`;
}

const modules = [
  ['assets/js/runtime/feature-registry.ts', ['createFeatureRegistry']],
  ['assets/js/runtime/services/route-policy.ts', ['createRoutePolicyService']],
  ['assets/js/runtime/route-controller.ts', ['createRouteController']],
  ['assets/js/runtime/work-management-client.ts', ['createWorkManagementClient']],
  ['assets/js/platform/errors/app-error.ts', ['WorkManagementError','normalizeAppError']],
  ['assets/js/core/cloud-module-data.ts', ['parseModuleDataRequest','parseModuleIdentityRequest','handleCloudModuleDataMessage','handleCloudModuleIdentityMessage','installCloudModuleDataBridge']],
  ['assets/js/runtime/module-lifecycle.ts', ['EmbeddedLifecycleTransitionError','transitionEmbeddedLifecycle']],
  ['assets/js/runtime/module-host.ts', ['createModuleHost']],
  ['assets/js/runtime/authorization-context.ts', ['authorizationFingerprint','reconcileAuthorizationContext']],
  ['assets/js/platform/ui/primitives.ts', ['buttonClass','iconButtonClass','fieldControlClass','navigationItemClass','tabClass','toolbarClass']],
  ['assets/js/features/boards/controllers/dialog-controller.ts', ['createBoardDialogController']],
  ['assets/js/features/boards/controllers/drag-drop-controller.ts', ['createBoardDragDropController']],
  ['assets/js/features/boards/board-state.ts', ['createBoardViewState','resetItemPanel']],
  ['src/features/boards/contracts/status-schema.ts', ['isStatusLabel','parseStatusColumnConfig','assertStatusValue']],
  ['assets/js/features/boards/grid/column-type-registry.ts', ['registerBoardColumnType','getBoardColumnType','boardColumnTypes','boardColumnTypeMap','normalizeBoardCellValue','defaultBoardCellValue','getBoardCellEditorContract']],
  ['assets/js/features/boards/board-schema.ts', ['STATUS_LABELS','BOARD_TABS','COLUMN_TYPES','defaultColumnName','startingColumns']],
  ['assets/js/features/boards/status-labels.ts', ['STATUS_COLOR_PALETTE','DEFAULT_STATUS_LABELS','STATUS_REFERENCE_POLICY','createStatusLabelId','normalizeStatusLabels','statusConfig','statusLabelMap','activeStatusLabels','serializeStatusConfig','renameStatusLabel','recolorStatusLabel','setStatusLabelActive','reorderStatusLabels','addStatusLabel','removeStatusLabel']],
  ['assets/js/platform/ui/overlay-manager.ts', ['createOverlayManager']],
  ['assets/js/features/boards/controllers/overlay-coordinator.ts', ['createBoardOverlayCoordinator']],
  ['assets/js/features/boards/services/board-selection-service.ts', ['createBoardSelectionService']],
  ['assets/js/features/boards/services/status-label-editor.ts', ['createStatusLabelEditor']],
  ['assets/js/features/boards/services/item-workspace-runtime.ts', ['createItemWorkspaceRuntime']],
  ['assets/js/features/boards/controllers/history-controller.ts', ['createBoardHistoryController']],
  ['assets/js/features/boards/controllers/selection-controller.ts', ['createBoardSelectionController']],
  ['assets/js/features/boards/controllers/inline-edit-controller.ts', ['createBoardInlineEditController']],
  ['assets/js/features/boards/views/item-workspace-view.ts', ['renderItemWorkspace']],
  ['assets/js/features/boards/controllers/item-workspace-controller.ts', ['createItemWorkspaceController']],
  ['assets/js/features/boards/controllers/item-panel-renderer.ts', ['createItemPanelRenderer']],
  ['assets/js/features/boards/controllers/board-menu-controller.ts', ['createBoardMenuController']],
];
for (const [path, globals] of modules) {
  const source = await fs.readFile(path, 'utf8');
  await evaluate(transformModule(transpileBrowserModule(path, source), globals));
}

const testProgram = String.raw`(async () => {
  const logs=[];
  const assert=(condition,message)=>{if(!condition)throw new Error(message);logs.push('PASS '+message);};
  const wait=(ms=0)=>new Promise((resolve)=>setTimeout(resolve,ms));
  const frames=()=>new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};};
  const run=async(name,fn)=>{await fn();logs.push('✓ '+name);};

  await run('route ownership transitions', async()=>{
    const manifest={features:[{id:'home',state:'active'},{id:'boards',state:'active'},{id:'shell',state:'active'}],routes:[{id:'home',owner:'home'},{id:'boards',owner:'boards'},{id:'board',owner:'boards'}]};
    const registry=createFeatureRegistry(manifest);const transitions=[];
    for(const id of ['home','boards','shell'])registry.register(id,{activate:({to})=>transitions.push('+'+id+':'+to?.name),deactivate:({from})=>transitions.push('-'+id+':'+from?.name)});
    let route={name:'home'};const runtime=createWorkManagementClient();const rendered=[];
    const controller=createRouteController({auth:{isAuthenticated:true,state:{initialized:true,status:'active'}},parseRoute:()=>route,navigate:()=>{},runtimeClient:runtime,featureRegistry:registry,moduleHost:{detach(){}},renderers:{home:()=>rendered.push('home'),boards:()=>rendered.push('boards'),board:()=>rendered.push('board')},routePolicy:createRoutePolicyService(),deactivateModule(){},rememberReturnRoute(){}});
    controller.render();route={name:'boards'};controller.render();route={name:'board',boardId:'b1'};controller.render();
    assert(transitions.join('|')==='+home:home|-home:home|+boards:boards','same-owner board route does not churn feature lifecycle');
    assert(rendered.join('|')==='home|boards|board','route dispatch remains correct');controller.dispose();
    assert(transitions.at(-1)==='-boards:board','route controller disposes active feature');
  });

  await run('modal focus and restoration', async()=>{
    const trigger=document.querySelector('#returnFocus');trigger.focus();
    const dialogs=createBoardDialogController({toast:()=>{},escapeHtml:(value)=>String(value)});
    const modal=dialogs.open({title:'Focus test',body:'<label>Name<input name="name"></label>',onSubmit:async()=>{}});await frames();
    const first=modal.wrap.querySelector('.wm-modal-close');const last=modal.wrap.querySelector('button[type="submit"]');
    assert(document.activeElement===first,'dialog gives initial focus to first control');
    first.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
    assert(document.activeElement===last,'Shift+Tab wraps to last dialog control');
    modal.wrap.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await wait(190);
    assert(!modal.wrap.isConnected,'Escape dismisses dialog');assert(document.activeElement===trigger,'dialog restores invoking focus');
  });

  await run('iframe module-host lifecycle', async()=>{
    const events=[];const host=createModuleHost({auth:{moduleIdentityContext:(id)=>({type:'wm:identity-context',version:1,moduleId:id,user:{id:'browser-user',email:'browser@example.test',displayName:'Browser User'},platformRole:'Admin',accountStatus:'active',module:{role:'Admin',enabled:true},updatedAt:'2026-08-30T00:00:00.000Z',allowed:true})},origin:location.origin,onEvent:(event)=>events.push(event.type)});
    const iframe=document.createElement('iframe');document.body.appendChild(iframe);host.attach(iframe,{id:'time-tracker'});
    iframe.srcdoc='<body>fixture<script>const o=location.origin===\'null\'?\'*\':location.origin;addEventListener(\'message\',e=>{if(e.data?.type===\'wm:identity-context\'){document.body.dataset.identity=e.data.user?.id||\'received\';parent.postMessage({type:\'wm:host:ready\',detail:{name:\'Fixture\',moduleId:\'time-tracker\'}},o)}});parent.postMessage({type:\'wm:identity:request\',moduleId:\'time-tracker\'},o)<\/script></body>';

    for(let i=0;i<80&&!events.includes('module:ready');i++)await wait(20);
    assert(events.includes('module:attached'),'module host reports attachment');assert(events.includes('module:identity-published'),'module host publishes identity');assert(events.includes('module:ready'),'module host accepts attached iframe ready event');
    assert(iframe.contentDocument.body.dataset.identity==='browser-user','attached iframe receives identity payload');host.detach();
    assert(host.moduleId===null,'module host clears module on detach');assert(host.invalidate('host-refresh')===false,'detached host cannot invalidate a stale iframe');iframe.remove();
  });


  await run('cross-session authorization reconciliation', async()=>{
    const calls={clear:0,detach:0,publish:0,deactivate:0};
    const auth={user:{id:'browser-user'},state:{status:'authenticated'},isAccountActive:true,platformRole:'Admin',assignments:[{module_id:'time-tracker',role:'Admin',enabled:true}],canAccessModule:()=>true};
    let fingerprint=authorizationFingerprint(auth);
    auth.state.status='disabled';auth.isAccountActive=false;auth.assignments=[{module_id:'time-tracker',role:'Employee',enabled:false}];auth.canAccessModule=()=>false;
    let result=reconcileAuthorizationContext({auth,previousFingerprint:fingerprint,serverState:{clear:()=>{calls.clear+=1;}},moduleHost:{detach:()=>{calls.detach+=1;},publishIdentity:()=>{calls.publish+=1;return true;}},activeModuleId:'time-tracker',deactivateModule:()=>{calls.deactivate+=1;}});
    assert(result.changed&&result.moduleAccessRevoked,'authorization downgrade is recognized as a runtime context change');
    assert(calls.clear===1,'authorization downgrade clears stale server-state cache');
    assert(calls.detach===1&&calls.deactivate===1&&calls.publish===0,'revoked module access detaches the active embedded application');
    fingerprint=result.fingerprint;
    auth.state.status='authenticated';auth.isAccountActive=true;auth.platformRole='Employee';auth.assignments=[{module_id:'time-tracker',role:'Employee',enabled:true}];auth.canAccessModule=()=>true;
    result=reconcileAuthorizationContext({auth,previousFingerprint:fingerprint,serverState:{clear:()=>{calls.clear+=1;}},moduleHost:{detach:()=>{calls.detach+=1;},publishIdentity:()=>{calls.publish+=1;return true;}},activeModuleId:'time-tracker',deactivateModule:()=>{calls.deactivate+=1;}});
    assert(result.changed&&!result.moduleAccessRevoked,'authorized role/session refresh remains attached');
    assert(calls.clear===2&&calls.publish===1,'authorized context changes clear cache and republish embedded identity');
  });

  await run('drag/drop interaction boundary', async()=>{
    const root=document.querySelector('#boardRoot');root.innerHTML='<div draggable="true" data-item-id="i1">Item one</div><div data-drop-status="done">Done</div>';
    const items=[{id:'i1',group_id:'g1',position:0,status:'not_started'}],moves=[];const commands={moveItem:async(command)=>{moves.push(command);items[0].status=command.status;}};
    const controller=createBoardDragDropController({commands,state:{board:{board:{id:'b1'}}},canEdit:()=>true,getItems:()=>items,toast:()=>{},renderBoard:()=>{},history:null});controller.bind(root);
    const item=root.querySelector('[data-item-id]'),done=root.querySelector('[data-drop-status="done"]');let transfer=new DataTransfer();
    item.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:transfer}));done.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer}));done.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));await wait();
    assert(moves.length===1&&moves[0].status==='done','drag/drop moves item through command service');assert(root.querySelector('[data-board-drag-live]'),'drag/drop publishes aria-live feedback');
    transfer=new DataTransfer();item.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:transfer}));done.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));await wait();
    assert(moves.length===1,'drop into current status suppresses no-op server move');controller.dispose();assert(controller.activeItemId===null,'drag transient state clears on dispose');
  });

  await run('Board history, scoped selection and optimistic typed cells', async()=>{
    let counter=1;const history=createBoardHistoryController({toast:()=>{},onChange:()=>{}});history.push({label:'counter',undo:async()=>{counter=0;},redo:async()=>{counter=1;}});await history.undo();assert(counter===0&&history.snapshot().canRedo,'Board history exposes undo/redo state');await history.redo();assert(counter===1,'Board history replays registered redo');
    const selectionState={board:{items:[{id:'i1',group_id:'g1'},{id:'i2',group_id:'g1'},{id:'i3',group_id:'g2'}],groups:[{id:'g1',title:'One'},{id:'g2',title:'Two'}]},selectedItems:[],selectionAnchor:null};
    const selection=createBoardSelectionController({state:selectionState,commands:{},toast:()=>{},getVisibleItems:()=>selectionState.board.items,reloadBoard:async()=>{},escapeHtml:String,canEdit:()=>true});selection.toggle('i1');selection.toggle('i2',{range:true});assert(selection.selectedItems().length===2,'range selection selects contiguous items');selection.clear();selection.selectVisible(true,'g2');assert(selection.selectedItems().length===1&&selection.selectedItems()[0].id==='i3','group select-all stays scoped to its group');
    const pendingSave=deferred();const item={id:'i1',title:'Item'},column={id:'c1',name:'Done',data_type:'checkbox',system_key:null};const cellState={board:{items:[item],columns:[column],values:[],members:[]}};let renders=0;const editor=createBoardInlineEditController({state:cellState,commands:{setCell:()=>pendingSave.promise},toast:()=>{},canEdit:()=>true,allColumns:()=>[column],getCellValue:()=>cellState.board.values.find((entry)=>entry.item_id==='i1'&&entry.column_id==='c1')?.value??null,optionList:()=>[],renderBoardData:()=>{renders+=1;},history:null,escapeHtml:String});const commit=editor.commitCell(item,column,true,{label:'checkbox'});assert(cellState.board.values[0]?.value===true&&renders>0,'typed cell is updated optimistically before persistence');pendingSave.reject(new Error('simulated failure'));await commit;assert(cellState.board.values.length===0,'failed typed-cell persistence rolls optimistic state back');
  });

  await run('recorded Board menu geometry, editor recovery and activity compaction', async()=>{
    const style=document.createElement('style');style.dataset.boardStabilization='1';style.textContent=globalThis.__wmThemeCss.app;document.head.appendChild(style);
    const fixture=document.createElement('section');fixture.innerHTML='<div class="board-table-scroll" style="width:420px;overflow:auto"><table class="interactive-board-table" style="min-width:900px"><tbody><tr class="board-item-row"><td class="selection-cell">□</td><td class="drag-cell">↕</td><td class="board-item-name-cell">Item</td><td>Value</td><td class="item-actions"><details class="item-context-menu context-menu" open><summary>•••</summary><div class="context-menu-pop" style="visibility:visible">Open details</div></details></td></tr></tbody></table></div>';document.body.appendChild(fixture);
    const pop=fixture.querySelector('.item-context-menu .context-menu-pop'),action=fixture.querySelector('.item-actions');
    assert(getComputedStyle(pop).position==='fixed','row context menu escapes the horizontally clipped table with fixed positioning');
    assert(getComputedStyle(action).position==='sticky','row action column remains reachable while the table scrolls horizontally');
    fixture.remove();style.remove();

    const longItem={id:'long-item',title:'Draft item'},longColumn={id:'long-col',name:'New Long text',data_type:'long_text',system_key:null};
    const longState={board:{items:[longItem],columns:[longColumn],values:[{item_id:'long-item',column_id:'long-col',value:'original'}],members:[]}};let renderCount=0;
    const longEditor=createBoardInlineEditController({state:longState,commands:{setCell:async()=>{await wait(15);throw new Error('simulated save failure');}},toast:()=>{},canEdit:()=>true,allColumns:()=>[longColumn],getCellValue:()=>longState.board.values.find((entry)=>entry.item_id==='long-item'&&entry.column_id==='long-col')?.value??null,optionList:()=>[],renderBoardData:()=>{renderCount+=1;},history:null,escapeHtml:String});
    const anchor=document.createElement('button');anchor.textContent='Long text';document.body.appendChild(anchor);longEditor.open('long-item','long-col',anchor);await frames();
    const longForm=document.querySelector('.board-inline-popover form'),textarea=longForm?.querySelector('textarea');textarea.value='unsaved draft survives';longForm.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    assert(longForm.dataset.saving==='true'&&longForm.getAttribute('aria-busy')==='true','long-text editor exposes an explicit pending-save state');await wait(35);
    assert(longForm.isConnected&&textarea.value==='unsaved draft survives','failed long-text save keeps the entered draft available for retry');
    assert(longForm.querySelector('.inline-save-error')?.textContent.includes('still here'),'failed long-text save exposes persistent inline recovery guidance');
    assert(longForm.dataset.saving==='false'&&!textarea.disabled,'failed long-text save re-enables the editor instead of silently closing');longEditor.reset();anchor.remove();

    const activityState={board:{groups:[{id:'g',title:'Group'}],items:[{id:'activity-item',group_id:'g',title:'Activity item',status:'in_progress'}],columns:[],values:[],members:[]},itemPanel:{itemId:'activity-item',tab:'activity',loading:false,error:'',data:{updates:[],files:[],activity:[
      {id:'e1',event_type:'item.cell_updated',actor_id:'u1',actor_name:'Lex',created_at:'2026-08-28T02:00:30Z',payload:{column_id:'c-long',column_name:'New Long text'}},
      {id:'e2',event_type:'item.cell_updated',actor_id:'u1',actor_name:'Lex',created_at:'2026-08-28T02:00:20Z',payload:{column_id:'c-long',column_name:'New Long text'}},
      {id:'e3',event_type:'item.cell_updated',actor_id:'u1',actor_name:'Lex',created_at:'2026-08-28T02:00:10Z',payload:{column_id:'c-long',column_name:'New Long text'}}
    ]},uploading:false}};
    const activityHtml=renderItemWorkspace({state:activityState,canEdit:()=>true,escapeHtml:String,formatDate:String,formatDay:String});const activityWrap=document.createElement('div');activityWrap.innerHTML=activityHtml;
    assert(activityWrap.textContent.includes('New Long text updated'),'Item Activity names the field that actually changed');
    assert(activityWrap.textContent.includes('×3'),'consecutive repetitive cell updates are compacted into a useful activity event');
    assert(!activityWrap.textContent.includes('item.cell_updated'),'Item Activity does not expose raw internal event codes');
  });

  await run('Item Workspace stale-response and upload isolation', async()=>{
    const host=document.querySelector('#itemHost'),a=deferred(),b=deferred(),upload=deferred(),calls=[];
    const state={board:{board:{id:'board-1'},groups:[{id:'g',title:'Group'}],items:[{id:'a',group_id:'g',title:'A',status:'in_progress'},{id:'b',group_id:'g',title:'B',status:'done'}],columns:[],values:[],members:[]},itemPanel:{itemId:null,tab:'updates',loading:false,error:'',data:{updates:[],files:[],activity:[]},uploading:false}};
    const api={getItemWorkspace:(id)=>id==='a'?a.promise:b.promise,addItemUpdate:async()=>{},uploadItemFile:async(boardId,itemId,file)=>{calls.push({boardId,itemId,name:file.name});return upload.promise;},deleteItemUpdate:async()=>{},openItemFile:async()=>{},deleteItemFile:async()=>{}};
    const renderPanel=()=>{host.innerHTML=renderItemWorkspace({state,canEdit:()=>true,escapeHtml:(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;'),formatDate:String,formatDay:String});};
    const controller=createItemWorkspaceController({api,state,toast:()=>{},renderBoard:renderPanel,renderPanel,confirmAction:()=>true});
    controller.open('a');controller.open('b');b.resolve({updates:[{id:'b-update',author_name:'B',created_at:'now',body:'B'}],files:[],activity:[]});await wait();a.resolve({updates:[{id:'a-update',author_name:'A',created_at:'now',body:'A'}],files:[],activity:[]});await wait();
    assert(state.itemPanel.itemId==='b'&&state.itemPanel.data.updates[0].id==='b-update','late Item A response cannot overwrite Item B');
    controller.open('a');await wait();const input=document.createElement('input');input.type='file';input.dataset.itemFileInput='1';const dt=new DataTransfer();dt.items.add(new File(['x'],'proof.txt',{type:'text/plain'}));Object.defineProperty(input,'files',{value:dt.files});host.appendChild(input);
    const uploadPromise=controller.uploadFiles({target:input});controller.open('b');upload.resolve({});await uploadPromise;assert(calls[0]?.itemId==='a','upload remains bound to item selected at upload start');controller.reset();
  });



  await run('Board explicit rename, configurable Status and single-overlay interaction', async()=>{
    const root=document.querySelector('#boardRoot');
    root.innerHTML='<div class="board-item-name-cell"><button id="renameProbe" type="button" data-edit-item-title="item-1">Original item</button></div><button id="underlayItem" type="button" data-open-item="item-2">Open underlying item</button><button id="statusProbe" type="button" data-edit-cell="item-1" data-column-id="status-col">Status</button>';
    const statusColumn={id:'status-col',name:'Status',data_type:'status',system_key:'status',config:{labels:[{id:'todo',name:'To do',color:'#7f8a9a',active:true,description:'Ready to begin',position:0},{id:'working',name:'Working on it',color:'#ef8f3c',active:true,description:'In progress',position:1},{id:'done_custom',name:'Done',color:'#23b784',active:true,description:'Completed',position:2}],default_label_id:'todo'}};
    const state={board:{board:{id:'b1'},items:[{id:'item-1',group_id:'g1',title:'Original item',status:'todo'}],groups:[{id:'g1',title:'Main group'}],columns:[statusColumn],values:[],members:[]},boardPrefs:{column_filters:{}},itemStatus:'all'};
    const updates=[],cellSaves=[],statusSaves=[];let failNextRename=false;
    const coordinator=createBoardOverlayCoordinator();
    const controller=createBoardInlineEditController({state,commands:{updateItem:async(command)=>{updates.push(command);if(failNextRename){failNextRename=false;throw new Error('rename persistence failed');}},setCell:async(command)=>cellSaves.push(command),setStatusLabels:async(command)=>statusSaves.push(command),savePreferences:async(_id,prefs)=>prefs,updateColumn:async()=>{},renameGroup:async()=>{}},toast:()=>{},canEdit:()=>true,allColumns:()=>[statusColumn],getCellValue:(item,column)=>column.system_key==='status'?item.status:item.title,optionList:()=>[],renderBoardData:()=>{const cell=root.querySelector('.board-item-name-cell');if(cell)cell.innerHTML='<button id="renameProbe" type="button" data-edit-item-title="item-1">'+state.board.items[0].title+'</button>';},history:null,escapeHtml:String,overlayCoordinator:coordinator,statusLabelsFor:normalizeStatusLabels});
    const rename=root.querySelector('#renameProbe');
    controller.openTitle('item-1',rename);
    assert(root.querySelector('.inline-confirm')&&root.querySelector('.inline-cancel'),'inline rename exposes explicit Save and Cancel controls');
    let input=root.querySelector('.board-inline-input');input.value='Blur must not save';input.dispatchEvent(new FocusEvent('blur',{bubbles:false}));await wait();
    assert(state.board.items[0].title==='Original item'&&updates.length===0&&root.querySelector('.board-inline-input'),'rename blur does not save or implicitly close the explicit editor');
    input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await wait();
    assert(state.board.items[0].title==='Original item'&&root.querySelector('#renameProbe'),'Escape cancels rename and restores the prior item name');
    controller.openTitle('item-1',root.querySelector('#renameProbe'));input=root.querySelector('.board-inline-input');input.value='Cancelled by X';root.querySelector('.inline-cancel').click();await wait();
    assert(state.board.items[0].title==='Original item'&&updates.length===0,'explicit X/cancel control restores the prior item name without persistence');
    controller.openTitle('item-1',root.querySelector('#renameProbe'));input=root.querySelector('.board-inline-input');input.value='Confirmed name';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await wait();
    assert(state.board.items[0].title==='Confirmed name'&&updates.at(-1)?.title==='Confirmed name','Enter confirms rename once through the persistence service');
    controller.openTitle('item-1',root.querySelector('#renameProbe'));input=root.querySelector('.board-inline-input');input.value='Confirmed by check';root.querySelector('.inline-confirm').click();await wait();
    assert(state.board.items[0].title==='Confirmed by check'&&updates.at(-1)?.title==='Confirmed by check','explicit check/confirm control persists the edited item name');
    failNextRename=true;controller.openTitle('item-1',root.querySelector('#renameProbe'));input=root.querySelector('.board-inline-input');input.value='Failed rename remains editable';root.querySelector('.inline-confirm').click();await wait();
    assert(root.querySelector('.board-inline-input')?.value==='Failed rename remains editable'&&root.querySelector('.board-inline-input')?.getAttribute('aria-invalid')==='true','failed inline rename preserves the draft and exposes an actionable error state');
    assert(state.board.items[0].title==='Confirmed by check','failed inline rename restores authoritative Board state without closing the editor');root.querySelector('.inline-cancel').click();await wait();

    const labels=normalizeStatusLabels(statusColumn);
    assert(labels.map((label)=>label.id).join('|')==='todo|working|done_custom','Status labels preserve stable internal IDs independently of visible text');
    controller.open('item-1','status-col',root.querySelector('#statusProbe'));await frames();
    let picker=document.querySelector('.board-status-popover');
    assert(picker&&picker.textContent.includes('Working on it')&&picker.querySelector('[data-manage-status-labels]'),'Status cell opens a compact colored-label picker with an intentional Manage labels action');
    picker.querySelector('[data-status-choice="working"]').click();await wait();
    assert(cellSaves.at(-1)?.value==='working'&&state.board.items[0].status==='working','Status selection persists the stable label ID rather than visible text');
    controller.open('item-1','status-col',root.querySelector('#statusProbe'));await frames();picker=document.querySelector('.board-status-popover');
    picker.querySelector('[data-manage-status-labels]').click();await frames();
    assert(picker.querySelectorAll('[data-status-label-name]').length===3&&picker.querySelector('[data-status-add]')&&picker.querySelector('[data-status-color-toggle]'),'Manage labels exposes inline rename, add, reorder/options and color controls inside one overlay');
    let todoName=picker.querySelector('[data-status-label-name="todo"]');todoName.value='Temporary draft';todoName.dispatchEvent(new Event('input',{bubbles:true}));assert(picker.querySelector('.status-manager-change-note'),'Status manager visibly tracks unsaved label configuration changes');picker.querySelector('[data-status-manager-cancel]').click();await frames();picker.querySelector('[data-manage-status-labels]').click();await frames();
    assert(picker.querySelector('[data-status-label-name="todo"]').value==='To do','Status manager Cancel discards draft configuration without persistence');
    todoName=picker.querySelector('[data-status-label-name="todo"]');todoName.value='Backlog';todoName.dispatchEvent(new Event('input',{bubbles:true}));
    picker.querySelector('[data-status-add]').click();await frames();
    let newInput=[...picker.querySelectorAll('[data-status-label-name]')].find((entry)=>entry.value==='New label');assert(newInput,'Status manager creates a new label row');const newId=newInput.dataset.statusLabelName;newInput.value='Backlog';newInput.dispatchEvent(new Event('input',{bubbles:true}));picker.querySelector('[data-status-apply]').click();await frames();
    assert(picker.querySelector('.status-manager-error')&&statusSaves.length===0,'invalid duplicate Status names remain in the editor with an actionable validation error');newInput=picker.querySelector('[data-status-label-name="'+newId+'"]');newInput.value='QA Review';newInput.dispatchEvent(new Event('input',{bubbles:true}));
    picker.querySelector('[data-status-color-toggle="todo"]').click();await frames();picker.querySelector('[data-status-color="#4f7df3"][data-status-label-id="todo"]').click();await frames();
    picker.querySelector('[data-status-move="up"][data-status-label-id="done_custom"]').click();await frames();
    picker.querySelector('[data-status-more="done_custom"]').click();await frames();picker.querySelector('[data-status-default="done_custom"]').click();await frames();
    picker.querySelector('[data-status-more="working"]').click();await frames();picker.querySelector('[data-status-toggle-active="working"]').click();await frames();assert(picker.querySelector('[data-status-label-row="working"]').classList.contains('is-inactive'),'Status manager deactivates a label');picker.querySelector('[data-status-toggle-active="working"]').click();await frames();assert(!picker.querySelector('[data-status-label-row="working"]').classList.contains('is-inactive'),'Status manager reactivates a label');
    let deletePrompted=false;const originalConfirm=globalThis.confirm;globalThis.confirm=()=>{deletePrompted=true;return true;};try{picker.querySelector('[data-status-delete="working"]').click();await frames();}finally{globalThis.confirm=originalConfirm;}assert(deletePrompted&&!picker.querySelector('[data-status-label-row="working"]'),'deleting an in-use Status label requires confirmation and removes it from the pending configuration');
    picker.querySelector('[data-status-apply]').click();await wait();
    const saved=statusSaves.at(-1);assert(saved&&saved.columnId==='status-col','Status lifecycle changes persist through the typed command service');
    assert(saved.labels.some((label)=>label.id==='todo'&&label.name==='Backlog'&&label.color==='#4f7df3'),'Status rename/recolor preserve stable label identity');
    assert(saved.labels.some((label)=>label.id===newId&&label.name==='QA Review'),'new Status labels persist with generated stable IDs');
    assert(!saved.labels.some((label)=>label.id==='working')&&saved.defaultLabelId==='done_custom','Status deletion and default configuration persist by stable IDs');
    assert(saved.labels.map((label)=>label.id).join('|').startsWith('todo|done_custom|'),'Status reorder persists deterministically');
    const reloadedColumn={...statusColumn,config:{labels:saved.labels,default_label_id:saved.defaultLabelId}};const reloaded=normalizeStatusLabels(reloadedColumn);assert(reloaded.some((label)=>label.id==='todo'&&label.name==='Backlog')&&statusConfig(reloadedColumn).defaultLabelId==='done_custom','Status configuration round-trips through a reload-compatible typed payload');
    const migratedLegacy=normalizeStatusLabels({system_key:'status',config:{options:['Not started','In progress','Blocked','Done']}});assert(migratedLegacy.map((label)=>label.id).join('|')==='not_started|in_progress|blocked|done','historical persisted Status options normalize to stable compatible IDs');
    assert(STATUS_REFERENCE_POLICY==='clear-on-label-delete','Status deletion keeps the explicit persisted-reference clearing policy');
    controller.reset();

    let closedA=0,closedB=0,underlayOpens=0;
    const triggerA=document.createElement('button'),triggerB=document.createElement('button'),overlayA=document.createElement('div'),overlayB=document.createElement('div');
    document.body.append(triggerA,triggerB,overlayA,overlayB);root.querySelector('#underlayItem').addEventListener('click',()=>underlayOpens++);
    coordinator.open({id:'a',element:overlayA,trigger:triggerA,close:()=>{closedA++;overlayA.remove();}});
    coordinator.open({id:'b',element:overlayB,trigger:triggerB,close:()=>{closedB++;overlayB.remove();}});
    assert(closedA===1&&coordinator.topId==='b','opening a new Board overlay replaces the incompatible active overlay');
    const underlay=root.querySelector('#underlayItem');underlay.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));underlay.click();await wait();
    assert(closedB===1&&underlayOpens===0,'outside dismissal does not leak the same click into an underlying item-opening action');
    underlay.click();assert(underlayOpens===1,'the underlying item action remains available after the overlay has been dismissed');
    triggerA.remove();triggerB.remove();overlayA.remove();overlayB.remove();coordinator.dispose();root.innerHTML='';
  });

  await run('Board floating menus and static workspace stability', async()=>{
    const style=document.createElement('style');style.dataset.boardOverhaulTest='1';style.textContent=globalThis.__wmThemeCss.app+'\n'+globalThis.__wmThemeCss.motion;document.head.appendChild(style);
    const root=document.querySelector('#boardRoot');
    root.innerHTML='<div data-wm-motion-static="true"><div class="board-table-scroll" style="width:220px;overflow:auto"><div style="width:700px"><span data-board-menu-host><button id="boardMenuTrigger" data-board-menu-trigger="item" aria-expanded="false">•••</button><template data-board-menu-template><button role="menuitem" data-probe-action>Open details</button><button role="menuitem">Duplicate</button></template></span></div></div><section class="board-group" id="staticBoardGroup">Group</section></div>';
    const menus=createBoardMenuController({root});
    root.addEventListener('click',(event)=>{if(menus.handleTrigger(event.target))event.preventDefault();});
    root.querySelector('#boardMenuTrigger').click();await frames();
    const menu=root.querySelector('.board-floating-menu');
    assert(menu&&!menu.hidden,'Board three-dot trigger opens a floating menu');
    assert(getComputedStyle(menu).position==='fixed','Board menu is outside scroll clipping geometry');
    assert(menu.textContent.includes('Open details'),'Board menu preserves contextual actions');
    assert(root.querySelector('#boardMenuTrigger').getAttribute('aria-expanded')==='true','Board menu exposes expanded state');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await wait();
    assert(menu.hidden&&root.querySelector('#boardMenuTrigger').getAttribute('aria-expanded')==='false','Escape closes Board menu cleanly');
    await frames();
    assert(!root.querySelector('#staticBoardGroup').classList.contains('wm-motion-reveal'),'dynamic Board workspace opts out of repeated reveal motion');
    menus.dispose();root.innerHTML='';style.remove();
  });

  await run('Item Workspace action menu overlays drawer chrome', async()=>{
    const style=document.createElement('style');style.dataset.itemMenuLayerTest='1';style.textContent=globalThis.__wmThemeCss.app+'\n'+globalThis.__wmThemeCss.motion;document.head.appendChild(style);
    const root=document.querySelector('#boardRoot');
    const state={board:{groups:[{id:'g',title:'Main group'}],items:[{id:'menu-item',group_id:'g',title:'Menu item',status:'not_started'}],columns:[],values:[],members:[]},itemPanel:{itemId:'menu-item',tab:'updates',loading:false,error:'',data:{updates:[],files:[],activity:[]},uploading:false}};
    root.innerHTML=renderItemWorkspace({state,canEdit:()=>true,escapeHtml:String,formatDate:String,formatDay:String});
    const menus=createBoardMenuController({root});const trigger=root.querySelector('[data-board-menu-trigger="item-panel"]');
    assert(trigger,'Item Workspace header uses shared floating-menu trigger');
    menus.open(trigger);await frames();
    const layer=root.querySelector('[data-board-overlay-layer]'),menu=root.querySelector('.board-floating-menu'),panel=root.querySelector('[data-item-panel]');
    assert(layer&&menu&&!menu.hidden,'Item Workspace action menu renders in dedicated overlay layer');
    assert(menu.parentElement===layer,'Item Workspace action menu is portaled outside drawer/header stacking context');
    assert(Number.parseInt(getComputedStyle(layer).zIndex,10)>Number.parseInt(getComputedStyle(panel).zIndex,10),'Item Workspace action overlay sits above drawer chrome');
    assert(menu.textContent.includes('Edit item')&&menu.textContent.includes('Archive item'),'Item Workspace menu preserves Edit and Archive actions');
    assert(trigger.getAttribute('aria-expanded')==='true','Item Workspace menu exposes expanded state');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await wait();
    assert(menu.hidden&&trigger.getAttribute('aria-expanded')==='false','Escape closes Item Workspace menu and restores trigger state');
    menus.dispose();root.innerHTML='';style.remove();
  });

  await run('Item Workspace stable tab shell and rapid switching', async()=>{
    const host=document.querySelector('#itemHost');host.innerHTML='';
    const markup=(tab,label)=>'<div class=\"item-panel-scrim\"></div><aside data-item-panel data-item-id=\"stable-item\" data-active-tab=\"'+tab+'\"><header class=\"item-panel-head\">Stable header</header><nav class=\"item-panel-tabs\"><button data-item-panel-tab=\"updates\" aria-selected=\"'+(tab==='updates')+'\" class=\"'+(tab==='updates'?'active':'')+'\">Updates</button><button data-item-panel-tab=\"files\" aria-selected=\"'+(tab==='files')+'\" class=\"'+(tab==='files'?'active':'')+'\">Files</button><button data-item-panel-tab=\"activity\" aria-selected=\"'+(tab==='activity')+'\" class=\"'+(tab==='activity'?'active':'')+'\">Activity</button></nav><div data-item-panel-body style=\"height:120px;overflow:auto\"><div data-item-tab-stage data-item-tab-content=\"'+tab+'\" style=\"height:900px\">'+label+'</div></div></aside>';
    const renderer=createItemPanelRenderer({getHost:()=>host,patchFull:(target,html)=>{target.innerHTML=html;return true;},reducedMotion:()=>false});
    renderer.render(markup('updates','Updates content'));
    const panel=host.querySelector('[data-item-panel]'),head=host.querySelector('.item-panel-head'),tabs=host.querySelector('.item-panel-tabs'),body=host.querySelector('[data-item-panel-body]');
    body.scrollTop=70;
    renderer.render(markup('files','Files content'));
    assert(host.querySelector('[data-item-panel]')===panel,'tab switch keeps Item Workspace drawer shell mounted');
    assert(host.querySelector('.item-panel-head')===head,'tab switch keeps Item Workspace header stationary');
    assert(host.querySelector('.item-panel-tabs')===tabs,'tab switch keeps Item Workspace tablist stationary');
    assert(host.querySelector('[data-item-panel-body]')===body,'tab switch keeps Item Workspace scroll viewport stationary');
    body.scrollTop=105;
    renderer.render(markup('activity','Activity content'));
    renderer.render(markup('updates','Updates return'));
    renderer.render(markup('files','Files return'));
    await frames();
    assert(panel.dataset.activeTab==='files','rapid tab switching settles on latest tab');
    assert(host.querySelector('[data-item-tab-stage]').dataset.itemTabContent==='files','rapid switching cannot leave stale tab content');
    assert(body.scrollTop===105,'returning to Files restores its independent scroll position');
    renderer.reset();host.innerHTML='';
  });

  await run('Item Workspace reduced-motion tab switching', async()=>{
    const host=document.querySelector('#itemHost');host.innerHTML='';
    const markup=(tab)=>'<aside data-item-panel data-item-id=\"reduced-item\" data-active-tab=\"'+tab+'\"><header class=\"item-panel-head\">Header</header><nav class=\"item-panel-tabs\"><button data-item-panel-tab=\"updates\" aria-selected=\"'+(tab==='updates')+'\">Updates</button><button data-item-panel-tab=\"files\" aria-selected=\"'+(tab==='files')+'\">Files</button></nav><div data-item-panel-body><div data-item-tab-stage data-item-tab-content=\"'+tab+'\">'+tab+'</div></div></aside>';
    let animations=0;const original=Element.prototype.animate;Element.prototype.animate=function(...args){animations+=1;return original.call(this,...args);};
    try{const renderer=createItemPanelRenderer({getHost:()=>host,patchFull:(target,html)=>{target.innerHTML=html;return true;},reducedMotion:()=>true});renderer.render(markup('updates'));renderer.render(markup('files'));assert(animations===0,'reduced-motion tab switching starts no content animation');renderer.reset();}finally{Element.prototype.animate=original;host.innerHTML='';}
  });

  await run('Item Workspace accessibility semantics', async()=>{
    const state={board:{groups:[{id:'g',title:'Group'}],items:[{id:'i',group_id:'g',title:'Accessible item',status:'in_progress'}],columns:[],values:[],members:[]},itemPanel:{itemId:'i',tab:'updates',loading:false,error:'',data:{updates:[],files:[],activity:[]},uploading:false}};
    const html=renderItemWorkspace({state,canEdit:()=>true,escapeHtml:String,formatDate:String,formatDay:String});const wrap=document.createElement('div');wrap.innerHTML=html;
    assert(wrap.querySelector('[data-item-panel][role="dialog"][aria-modal="true"]'),'Item Workspace has modal dialog semantics');assert(wrap.querySelector('[role="tablist"]')&&wrap.querySelectorAll('[role="tab"]').length===3,'Item Workspace uses tablist/tab semantics');assert(wrap.querySelector('[role="tabpanel"]'),'Item Workspace exposes a tabpanel');
  });


  await run('motion orchestrator stable-shell and navigation choreography', async()=>{
    assert(globalThis.WorkManagementMotion?.version==='1.30.0','motion orchestrator exposes the v1.30 runtime contract');
    document.body.dataset.wmSurface='shell';
    const fixture=document.createElement('section');fixture.innerHTML='<header id="stableMotionHeader">Stable chrome</header><nav class="board-tabs" id="motionTabs"><button class="active" aria-selected="true">One</button><button aria-selected="false">Two</button></nav><main id="motionRegion"><article id="oldMotionView">Old</article></main>';document.body.appendChild(fixture);
    const header=fixture.querySelector('#stableMotionHeader'),tabs=fixture.querySelector('#motionTabs');
    WorkManagementMotion.enhance(fixture);await frames();
    let indicator=tabs.querySelector('.wm-motion-indicator');assert(indicator,'shared active-navigation indicator is generated');
    const before=indicator.style.getPropertyValue('--wm-ind-x');const buttons=tabs.querySelectorAll('button');buttons[0].classList.remove('active');buttons[0].setAttribute('aria-selected','false');buttons[1].classList.add('active');buttons[1].setAttribute('aria-selected','true');WorkManagementMotion.refreshIndicators(tabs);await frames();
    indicator=tabs.querySelector('.wm-motion-indicator');assert(indicator.style.getPropertyValue('--wm-ind-x')!==before||indicator.style.getPropertyValue('--wm-ind-w')!=='0px','active-navigation indicator follows selection changes');
    const originalHeader=header;await WorkManagementMotion.exitThen(()=>{fixture.querySelector('#motionRegion').innerHTML='<article id="newMotionView">New</article>';},{selector:'#motionRegion > :first-child',duration:12});
    assert(fixture.querySelector('#stableMotionHeader')===originalHeader,'route motion preserves surrounding persistent chrome');assert(fixture.querySelector('#newMotionView'),'route motion commits only the route-owned content');
    tabs.innerHTML='<button aria-selected="false">Three</button><button class="active" aria-selected="true">Four</button>';WorkManagementMotion.refreshIndicators(tabs);await frames();assert(tabs.querySelector('.wm-motion-indicator'),'indicator rebinds after persistent navigation replaces its children');fixture.remove();
  });

  await run('motion design runtime boundary', async()=>{
    await frames();
    assert(['full','reduced'].includes(document.documentElement.dataset.wmMotion),'motion runtime publishes reduced/full preference state');
    assert(document.body.dataset.wmMotionReady==='true','motion runtime publishes ready state');
    const trigger=document.querySelector('#returnFocus');trigger.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    if(document.documentElement.dataset.wmMotion==='full') assert(trigger.classList.contains('wm-motion-press'),'motion runtime adds kinetic press feedback');
  });

  await run('embedded application theme and contrast coherence', async()=>{
    const parse=(value)=>{const m=String(value).match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(',').map(Number);return {r:p[0],g:p[1],b:p[2],a:Number.isFinite(p[3])?p[3]:1};};
    const channel=(n)=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;};
    const luminance=(c)=>.2126*channel(c.r)+.7152*channel(c.g)+.0722*channel(c.b);
    const contrast=(a,b)=>{const A=luminance(a),B=luminance(b);return (Math.max(A,B)+.05)/(Math.min(A,B)+.05);};
    const rgb=(hex)=>{const h=hex.replace('#','');return {r:parseInt(h.slice(0,2),16),g:parseInt(h.slice(2,4),16),b:parseInt(h.slice(4,6),16),a:1};};
    const mount=(surface,css,markup,{light=false}={})=>{
      document.querySelectorAll('style[data-theme-audit]').forEach((node)=>node.remove());
      const style=document.createElement('style');style.dataset.themeAudit='1';style.textContent=css+'\n'+globalThis.__wmThemeCss.motion;document.head.appendChild(style);
      document.documentElement.classList.toggle('light',light);document.body.dataset.wmSurface=surface;document.body.innerHTML=markup;
    };

    mount('time-tracker',globalThis.__wmThemeCss.timeTracker,'<div class="overview-control-dock"><input class="overview-search" value="Search"><div class="modern-select"><button class="modern-select-trigger"><span class="modern-select-value">Information Technology</span></button></div><div class="overview-rule-chip"><span>Policy</span><strong>Late after 08:00</strong></div></div><section class="overview-section"><div class="overview-record-kpis"><div><strong>0</strong><span>Active</span></div></div><div class="overview-table-wrap"><table class="overview-table"><thead><tr><th>Name</th><th>Status</th></tr></thead><tbody><tr><td>No records</td><td>—</td></tr></tbody></table></div></section><div class="modern-select-menu is-portaled"><button class="modern-select-option selected"><span>Information Technology</span><span class="modern-select-check">✓</span></button><button class="modern-select-option"><span>HR</span></button></div>');
    const ttTrigger=getComputedStyle(document.querySelector('.modern-select-trigger')),ttMenu=getComputedStyle(document.querySelector('.modern-select-menu')),ttSelected=getComputedStyle(document.querySelector('.modern-select-option.selected'));
    const ttDock=getComputedStyle(document.querySelector('.overview-control-dock')),ttHeader=getComputedStyle(document.querySelector('.overview-table th')),ttRecords=getComputedStyle(document.querySelector('.overview-record-kpis'));
    assert(ttMenu.backgroundColor==='rgb(255, 255, 255)','TimeTracker portaled dropdown uses the current neutral surface');
    assert(ttTrigger.backgroundColor!=='rgb(247, 241, 231)','TimeTracker trigger no longer exposes the legacy warm control background');
    assert(ttSelected.backgroundColor!=='rgb(251, 233, 223)','TimeTracker selected option no longer uses the old legacy selection token');
    assert(contrast(parse(ttTrigger.color),rgb('#ffffff'))>=4.5,'TimeTracker dropdown text maintains readable contrast');
    assert(ttDock.backgroundColor!=='rgba(252, 248, 241, 0.92)' && ttDock.backgroundColor!=='rgb(252, 248, 241)','TimeTracker Overview filter dock no longer uses the legacy beige surface');
    assert(ttHeader.backgroundColor==='rgb(238, 242, 247)','TimeTracker Attendance Records header uses the current cool muted surface');
    assert(ttRecords.backgroundColor!=='rgb(248, 243, 235)','TimeTracker Attendance Records summary no longer inherits the legacy cream palette');

    const fuelMarkup='<aside class="sidebar"><button class="nav-item active">Dashboard</button></aside><main><header class="topbar"><h1>Dashboard</h1></header><section class="kpi-card"><div class="kpi-top">TOTAL SPENT</div><div class="kpi-foot">Available after refueling completion</div></section></main>';
    mount('fueltrack',globalThis.__wmThemeCss.fuelTrack,fuelMarkup,{light:true});
    const fuelBodyLight=getComputedStyle(document.body),fuelTitleLight=getComputedStyle(document.querySelector('.topbar h1')),fuelMutedLight=getComputedStyle(document.querySelector('.kpi-foot'));
    assert(fuelBodyLight.backgroundColor==='rgb(247, 249, 252)','FuelTrack+ Light Mode uses a light canvas instead of a dark motion override');
    assert(getComputedStyle(document.querySelector('.sidebar')).backgroundImage.includes('255, 255, 255'),'FuelTrack+ Light Mode sidebar uses light chrome');
    assert(contrast(parse(fuelTitleLight.color),rgb('#f7f9fc'))>=7,'FuelTrack+ Light Mode primary text has strong contrast');
    assert(contrast(parse(fuelMutedLight.color),rgb('#ffffff'))>=4.5,'FuelTrack+ Light Mode tertiary text remains readable');
    mount('fueltrack',globalThis.__wmThemeCss.fuelTrack,fuelMarkup,{light:false});
    const fuelTitleDark=getComputedStyle(document.querySelector('.topbar h1')),fuelMutedDark=getComputedStyle(document.querySelector('.kpi-foot'));
    assert(contrast(parse(fuelTitleDark.color),rgb('#101e2f'))>=7,'FuelTrack+ Dark Mode primary text remains strongly readable');
    assert(contrast(parse(fuelMutedDark.color),rgb('#101e2f'))>=4.5,'FuelTrack+ Dark Mode tertiary text remains readable');

    const tradeMarkup='<header class="topbar"><a class="brand-lockup"><span class="brand-copy"><strong>TradeLink</strong><small>PORTAL</small></span></a><nav class="nav-tabs"><button>All Documents</button><button class="active">Create New</button></nav><div class="vendor-pill"><span class="vendor-pill-name">Watchdog</span></div></header><section class="create-commandbar"><div class="document-heading"><div class="document-icon">□</div><div><h1>Quotations</h1><small>Draft autosave enabled</small></div></div></section><label class="field"><span>Client</span><input placeholder="Search saved clients by name..."></label><input id="disabledTrade" value="Q-[Will be assigned on save]" disabled>';
    mount('tradelink',globalThis.__wmThemeCss.tradeLink,tradeMarkup);
    const tradeStyles=[['brand',getComputedStyle(document.querySelector('.brand-copy strong'))],['navigation',getComputedStyle(document.querySelector('.nav-tabs button:not(.active)'))],['document heading',getComputedStyle(document.querySelector('.document-heading h1'))],['document status',getComputedStyle(document.querySelector('.document-heading small'))],['placeholder',getComputedStyle(document.querySelector('.field input'),'::placeholder')],['disabled field',getComputedStyle(document.querySelector('#disabledTrade'))]];
    for(const [name,style] of tradeStyles) assert(contrast(parse(style.color),rgb('#ffffff'))>=4.5,'TradeLink '+name+' text is readable on light surfaces');
  });

  return {status:'pass',text:'PASS\\n'+logs.join('\\n')};
})().catch((error)=>({status:'fail',text:'FAIL\\n'+(error?.stack||error?.message||String(error))}));`;

const result = await evaluate(testProgram, { awaitPromise: true });
console.log(result?.text || 'Browser integration test returned no result.');
if (result?.status !== 'pass') {
  ws.close();
  process.exit(1);
}

// Final presentation-quality audit. This deliberately exercises responsive media
// queries, enlarged root text, viewport containment, focus ownership, theme
// switching, and the mobile shell navigation against the same CSS ordering used
// by the Vite entry. Focus-ring geometry itself is verified statically by the
// final UI verifier because Chromium CDP cannot reliably force :focus-visible.
await evaluate(`globalThis.__wmFinalPresentationCss=${JSON.stringify(finalPresentationCss)}; true;`);
const auditMarkup = String.raw`
  <div class="shell">
    <aside class="sidebar">
      <button class="brand"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><span class="brand-copy"><strong>Work Management</strong><small>Operations</small></span></button>
      <nav aria-label="Primary">
        <button class="nav-item active"><span>◻</span><b>Applications</b></button>
        <button class="nav-item"><span>▦</span><b>Boards</b></button>
        <button class="nav-item"><span>◌</span><b>Activity</b></button>
        <button class="nav-item"><span>⚙</span><b>Settings</b></button>
        <button class="nav-item"><span>◎</span><b>Account</b></button>
        <button class="nav-item"><span>♙</span><b>Users</b></button>
      </nav>
    </aside>
    <section class="workspace">
      <header class="topbar"><div><span class="top-eyebrow">WORK MANAGEMENT</span><h1>Responsive presentation audit with intentionally long heading text</h1><p>Long supporting copy verifies text scaling without relying on a fixed header height.</p></div><div class="top-actions"><button class="wm-button wm-button--secondary">Secondary action</button><button class="wm-button wm-button--primary">Primary action with a deliberately longer label</button></div></header>
      <main class="page">
        <section class="board-list-toolbar"><div class="wm-toolbar" data-wrap="true"><label class="wm-field" style="flex:1 1 260px"><span class="wm-field-label">Search boards and operational records</span><input class="wm-field-control" value="Expanded text scaling audit"></label><button id="longAuditButton" class="wm-button wm-button--primary">Create a new operational work board</button></div></section>
        <section class="board-controls"><div class="board-controls-query"><div class="wm-search"><input class="wm-field-control" value="Search"></div></div><div class="wm-action-row"><button class="wm-button wm-button--secondary">Filter</button><button class="wm-button wm-button--secondary">Add group</button></div></section>
        <div class="wm-data-region" style="margin-top:16px"><table class="wm-table" style="min-width:760px"><thead><tr><th>Item</th><th>Status</th><th>Owner</th><th>Due date</th></tr></thead><tbody><tr><td>Long operational item remains navigable inside its own horizontal scroll region</td><td>In progress</td><td>Operations team</td><td>2026-08-31</td></tr></tbody></table></div>
      </main>
    </section>
  </div>
  <div id="auditMenu" class="wm-menu" style="position:fixed;right:4px;top:4px"><button role="menuitem">A menu action with an intentionally long accessible label that must remain inside the viewport</button></div>
  <section id="auditDialog" class="wm-dialog" style="position:fixed;left:6px;bottom:6px"><header class="wm-dialog-header"><strong>Dialog title that can wrap safely</strong><button class="wm-icon-button" aria-label="Close">×</button></header><div class="wm-dialog-body"><p>${'Scrollable dialog content. '.repeat(80)}</p><label class="wm-field"><span class="wm-field-label">Long form label for text scaling</span><input class="wm-field-control" value="Value"></label></div><footer class="wm-dialog-footer"><button class="wm-button wm-button--secondary">Cancel</button><button id="auditFocus" class="wm-button wm-button--primary">Save changes</button></footer></section>
`;

async function runPresentationViewportAudit({ width, height, rootFontSize = '16px', touch = false, theme = 'light', name }) {
  await call('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  });
  await call('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
  const outcome = await evaluate(`(()=>{
    document.querySelectorAll('style[data-final-presentation-audit]').forEach((node)=>node.remove());
    const style=document.createElement('style');style.dataset.finalPresentationAudit='1';style.textContent=globalThis.__wmFinalPresentationCss;document.head.appendChild(style);
    document.documentElement.dataset.theme=${JSON.stringify(theme)};document.documentElement.style.fontSize=${JSON.stringify(rootFontSize)};
    document.body.dataset.wmSurface='shell';document.body.innerHTML=${JSON.stringify(auditMarkup)};
    const checks=[];const assert=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
    const layoutWidth=document.documentElement.clientWidth;
    const viewportWidth=innerWidth;
    assert(document.documentElement.scrollWidth<=layoutWidth+1,'document has no unintended horizontal overflow');
    const menu=document.querySelector('#auditMenu').getBoundingClientRect();
    assert(menu.left>=-1&&menu.right<=viewportWidth+1,'menu remains inside the viewport');
    const dialog=document.querySelector('#auditDialog').getBoundingClientRect();
    assert(dialog.left>=-1&&dialog.right<=viewportWidth+1,'dialog remains horizontally contained');
    assert(dialog.height<=innerHeight-10,'dialog remains vertically usable');
    const button=document.querySelector('#longAuditButton');
    assert(button.getBoundingClientRect().right<=viewportWidth+1,'long action label does not escape the viewport');
    const dataRegion=document.querySelector('.wm-data-region');
    assert(dataRegion.scrollWidth>=dataRegion.clientWidth,'wide table remains contained in its intended scroll region');
    const boardControls=getComputedStyle(document.querySelector('.board-controls'));
    if(innerWidth<=1120) assert(boardControls.position!=='sticky','Board toolbar stops sticking before compact/zoom layouts can overlap content');
    if(innerWidth<=640){
      const nav=document.querySelector('.sidebar nav');
      assert(getComputedStyle(nav).display==='flex','mobile shell navigation uses a single horizontal rail');
      assert(nav.scrollWidth>=nav.clientWidth,'mobile navigation remains scrollable instead of clipping additional destinations');
    }
    const focus=document.querySelector('#auditFocus');
    focus.focus();
    assert(document.activeElement===focus,'programmatic focus ownership remains stable for the primary dialog action');
    if(matchMedia('(pointer:coarse)').matches){
      assert(focus.getBoundingClientRect().height>=44,'coarse-pointer button target is at least 44px tall');
      { const field=document.querySelector('.wm-field-control'); const rect=field.getBoundingClientRect(); const style=getComputedStyle(field); assert(rect.height>=44,'coarse-pointer field target is at least 44px tall: '+JSON.stringify({height:rect.height,minHeight:style.minHeight,heightStyle:style.height,pointer:matchMedia('(pointer:coarse)').matches})); }
    }
    return {name:${JSON.stringify(name)},theme:${JSON.stringify(theme)},checks};
  })()`);
  console.log(`PASS final presentation viewport audit: ${name} / ${theme} (${width}x${height}, root ${rootFontSize})`);
  return outcome;
}

const finalPresentationScenarios = [
  { name:'wide desktop', width:1600, height:1000 },
  { name:'standard desktop', width:1366, height:820 },
  { name:'laptop', width:1120, height:760 },
  { name:'tablet', width:820, height:980 },
  { name:'narrow viewport', width:390, height:844 },
  { name:'200% zoom equivalent', width:720, height:650 },
  { name:'enlarged text scaling', width:820, height:980, rootFontSize:'20px' },
  { name:'coarse pointer narrow viewport', width:390, height:844, touch:true },
];
for (const scenario of finalPresentationScenarios) {
  for (const theme of ['light','dark']) {
    await runPresentationViewportAudit({ ...scenario, theme });
  }
}

await call('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 1 });
await call('Emulation.clearDeviceMetricsOverride');
console.log('Final presentation viewport/accessibility contract: PASS');
ws.close();
