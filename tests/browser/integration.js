import { createFeatureRegistry } from '../../assets/js/runtime/feature-registry.ts';
import { createRouteController } from '../../assets/js/runtime/route-controller.ts';
import { createWorkManagementClient } from '../../assets/js/runtime/work-management-client.ts';
import { createModuleHost } from '../../assets/js/runtime/module-host.ts';
import { createBoardDialogController } from '../../assets/js/features/boards/controllers/dialog-controller.ts';
import { createBoardDragDropController } from '../../assets/js/features/boards/controllers/drag-drop-controller.ts';
import { createItemWorkspaceController } from '../../assets/js/features/boards/controllers/item-workspace-controller.ts';
import { createItemPanelRenderer } from '../../assets/js/features/boards/controllers/item-panel-renderer.ts';
import { createBoardHistoryController } from '../../assets/js/features/boards/controllers/history-controller.ts';
import { createBoardSelectionController } from '../../assets/js/features/boards/controllers/selection-controller.ts';
import { createBoardInlineEditController } from '../../assets/js/features/boards/controllers/inline-edit-controller.ts';
import { renderItemWorkspace } from '../../assets/js/features/boards/views/item-workspace-view.ts';

const results = document.querySelector('#results');
const log = [];
function failHarness(error) {
  if (results.dataset.status === 'pass') return;
  const message = error?.reason?.message || error?.error?.message || error?.message || String(error?.reason || error?.error || error);
  results.dataset.status = 'fail';
  results.textContent = `FAIL\n${log.join('\n')}\n${message}`;
  document.documentElement.dataset.tests = 'fail';
}
window.addEventListener('error', failHarness);
window.addEventListener('unhandledrejection', failHarness);
const wait = (ms=0) => new Promise((resolve) => setTimeout(resolve, ms));
const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
function assert(condition, message) { if (!condition) throw new Error(message); log.push(`PASS ${message}`); }
async function test(name, fn) { try { await fn(); log.push(`✓ ${name}`); } catch (error) { log.push(`✗ ${name}: ${error.message}`); throw error; } }
function deferred() { let resolve, reject; const promise = new Promise((r,j)=>{resolve=r;reject=j;}); return {promise,resolve,reject}; }

await test('route ownership transitions', async () => {
  const manifest = { features:[{id:'home',state:'active'},{id:'boards',state:'active'},{id:'shell',state:'active'}], routes:[{id:'home',owner:'home'},{id:'boards',owner:'boards'},{id:'board',owner:'boards'}] };
  const registry = createFeatureRegistry(manifest);
  const transitions = [];
  for (const id of ['home','boards','shell']) registry.register(id,{activate:({to})=>transitions.push(`+${id}:${to?.name}`),deactivate:({from})=>transitions.push(`-${id}:${from?.name}`)});
  let route = {name:'home'};
  const runtime = createWorkManagementClient();
  const rendered = [];
  const controller = createRouteController({auth:{isAuthenticated:true,state:{initialized:true,status:'active'}},parseRoute:()=>route,navigate:()=>{},runtimeClient:runtime,featureRegistry:registry,moduleHost:{detach(){}},renderers:{home:()=>rendered.push('home'),boards:()=>rendered.push('boards'),board:()=>rendered.push('board')},deactivateModule(){},rememberReturnRoute(){}});
  controller.render();
  route={name:'boards'};controller.render();
  route={name:'board',boardId:'b1'};controller.render();
  assert(transitions.join('|') === '+home:home|-home:home|+boards:boards', 'same-owner board route does not churn feature lifecycle');
  assert(rendered.join('|') === 'home|boards|board', 'route renderer dispatch remains correct');
  controller.dispose();
  assert(transitions.at(-1)==='-boards:board', 'route controller disposes active feature');
});

await test('modal focus trap and restoration', async () => {
  const trigger=document.querySelector('#returnFocus');trigger.focus();
  const dialogs=createBoardDialogController({toast:()=>{},escapeHtml:(x)=>String(x)});
  const modal=dialogs.open({title:'Focus test',body:'<label>Name<input name="name"></label>',onSubmit:async()=>{}});
  await frame();
  const first=modal.wrap.querySelector('.wm-modal-close');
  const last=modal.wrap.querySelector('button[type="submit"]');
  assert(document.activeElement===first,'dialog gives initial focus to its first control');
  first.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
  assert(document.activeElement===last,'Shift+Tab wraps to last dialog control');
  modal.wrap.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  await wait(180);
  assert(!modal.wrap.isConnected,'Escape dismisses dialog');
  assert(document.activeElement===trigger,'dialog restores focus to the invoking control');
});

await test('same-origin iframe module host lifecycle', async () => {
  const events=[];
  const host=createModuleHost({auth:{moduleIdentityContext:(id)=>({type:'wm:identity-context',version:1,moduleId:id,user:{id:'browser-user',email:'browser@example.test',displayName:'Browser User'},platformRole:'Admin',accountStatus:'active',module:{role:'Admin',enabled:true},updatedAt:'2026-08-30T00:00:00.000Z',allowed:true})},origin:location.origin,onEvent:(event)=>events.push(event.type)});
  const iframe=document.createElement('iframe');iframe.src='./module-fixture.html';document.body.appendChild(iframe);
  host.attach(iframe,{id:'time-tracker'});
  for(let i=0;i<40 && !events.includes('module:ready');i++) await wait(25);
  assert(events.includes('module:attached'),'module host reports attachment');
  assert(events.includes('module:identity-published'),'module host publishes authenticated identity');
  assert(events.includes('module:ready'),'module host accepts ready event only from attached iframe');
  assert(iframe.contentDocument.body.dataset.identity==='browser-user','module iframe receives identity payload');
  host.detach();
  assert(host.moduleId===null,'module host clears active module on detach');
  assert(host.invalidate('host-refresh')===false,'detached host cannot invalidate a stale iframe');
  iframe.remove();
});

await test('board drag/drop has cleanup, live feedback and no-op suppression', async () => {
  const root=document.querySelector('#boardRoot');
  root.innerHTML='<div draggable="true" data-item-id="i1">Item one</div><div data-drop-status="done">Done</div><div data-drop-status="todo">Todo</div>';
  const items=[{id:'i1',group_id:'g1',status:'todo'}];
  const moves=[];
  const api={moveItem:async(...args)=>{moves.push(args);items[0].status=args[3];}};
  const controller=createBoardDragDropController({api,state:{board:{board:{id:'b1'}}},canEdit:()=>true,getItems:()=>items,toast:()=>{},renderBoard:()=>{},history:null});
  controller.bind(root);
  const item=root.querySelector('[data-item-id]');
  const done=root.querySelector('[data-drop-status="done"]');
  const transfer=new DataTransfer();
  item.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  done.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  done.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  await wait();
  assert(moves.length===1 && moves[0][3]==='done',`drag/drop moves item through board service (moves=${JSON.stringify(moves)}, active=${controller.activeItemId})`);
  assert(root.querySelector('[data-board-drag-live]'),'drag/drop creates an aria-live status region');
  item.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}));
  done.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}));
  await wait();
  assert(moves.length===1,'dropping into current group/status does not issue a no-op server move');
  controller.dispose();
  assert(controller.activeItemId===null,'drag/drop controller clears transient state on dispose');
});

await test('board history, range selection and optimistic cell rollback', async () => {
  let value=0; const messages=[];
  const history=createBoardHistoryController({toast:(message)=>messages.push(message),onChange:()=>{}});
  history.push({label:'counter change',undo:async()=>{value=0;},redo:async()=>{value=1;}});
  value=1; await history.undo(); assert(value===0 && history.snapshot().canRedo,'session history undoes and exposes redo state');
  await history.redo(); assert(value===1 && history.snapshot().canUndo,'session history redoes through the registered operation');

  const boardState={board:{items:[{id:'i1',group_id:'g1'},{id:'i2',group_id:'g1'},{id:'i3',group_id:'g2'}],groups:[{id:'g1',title:'One'},{id:'g2',title:'Two'}]},selectedItems:[],selectionAnchor:null};
  const selection=createBoardSelectionController({state:boardState,api:{},toast:()=>{},getVisibleItems:()=>boardState.board.items,reloadBoard:async()=>{},escapeHtml:String,canEdit:()=>true});
  selection.toggle('i1'); selection.toggle('i2',{range:true});
  assert(selection.selectedItems().length===2,'Shift/range-style selection selects contiguous visible items');
  selection.clear(); selection.selectVisible(true,'g2');
  assert(selection.selectedItems().length===1 && selection.selectedItems()[0].id==='i3','group header selection is scoped to that visible group');

  const save=deferred(); const item={id:'i1',title:'Item'}; const column={id:'c1',name:'Done',data_type:'checkbox',system_key:null};
  const cellState={board:{items:[item],columns:[column],values:[],members:[]}}; let renders=0;
  const editor=createBoardInlineEditController({state:cellState,api:{setCell:()=>save.promise},toast:()=>{},canEdit:()=>true,allColumns:()=>[column],getCellValue:()=>cellState.board.values.find((entry)=>entry.item_id==='i1'&&entry.column_id==='c1')?.value??null,optionList:()=>[],renderBoardData:()=>{renders+=1;},history:null,escapeHtml:String});
  const pending=editor.commitCell(item,column,true,{label:'checkbox'});
  assert(cellState.board.values[0]?.value===true && renders>0,'typed cell updates optimistically before server completion');
  save.reject(new Error('simulated persistence failure')); await pending;
  assert(cellState.board.values.length===0,'failed optimistic typed-cell write rolls back local state');
});

await test('item workspace rejects stale item and upload completions', async () => {
  const host=document.createElement('div');host.dataset.itemPanelHost='1';document.body.appendChild(host);
  const a=deferred(), b=deferred(), upload=deferred();
  const calls=[];
  const state={board:{board:{id:'board-1'},groups:[{id:'g',title:'Group'}],items:[{id:'a',group_id:'g',title:'A',status:'working'},{id:'b',group_id:'g',title:'B',status:'done'}],columns:[],values:[],members:[]},itemPanel:{itemId:null,tab:'updates',loading:false,error:'',data:{updates:[],files:[],activity:[]},uploading:false}};
  const api={getItemWorkspace:(id)=>id==='a'?a.promise:b.promise,addItemUpdate:async()=>{},uploadItemFile:async(boardId,itemId,file)=>{calls.push({boardId,itemId,name:file.name});return upload.promise;},deleteItemUpdate:async()=>{},openItemFile:async()=>{},deleteItemFile:async()=>{}};
  const renderPanel=()=>{host.innerHTML=renderItemWorkspace({state,canEdit:()=>true,escapeHtml:(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;'),formatDate:String,formatDay:String});};
  const renderBoard=renderPanel;
  const controller=createItemWorkspaceController({api,state,toast:()=>{},renderBoard,renderPanel,confirmAction:()=>true});
  controller.open('a');
  controller.open('b');
  b.resolve({updates:[{id:'b-update',author_name:'B',created_at:'now',body:'B data'}],files:[],activity:[]});await wait();
  a.resolve({updates:[{id:'a-update',author_name:'A',created_at:'now',body:'A data'}],files:[],activity:[]});await wait();
  assert(state.itemPanel.itemId==='b' && state.itemPanel.data.updates[0].id==='b-update','late Item A response cannot overwrite Item B workspace');
  // Upload selected while A is active must remain targeted at A even if the user switches to B before completion.
  controller.open('a');a.resolve?.({updates:[],files:[],activity:[]});
  const input=document.createElement('input');input.type='file';input.dataset.itemFileInput='1';
  const dt=new DataTransfer();dt.items.add(new File(['x'],'proof.txt',{type:'text/plain'}));Object.defineProperty(input,'files',{value:dt.files});host.appendChild(input);
  const change={target:input};const uploadPromise=controller.uploadFiles(change);controller.open('b');upload.resolve({});await uploadPromise;
  assert(calls[0]?.itemId==='a','attachment upload remains bound to item selected when upload began');
  controller.reset();host.remove();
});

await test('item workspace exposes modal/tab semantics', async () => {
  const state={board:{groups:[{id:'g',title:'Group'}],items:[{id:'i',group_id:'g',title:'Accessible item',status:'working'}],columns:[],values:[],members:[]},itemPanel:{itemId:'i',tab:'updates',loading:false,error:'',data:{updates:[],files:[],activity:[]},uploading:false}};
  const html=renderItemWorkspace({state,canEdit:()=>true,escapeHtml:(x)=>String(x),formatDate:String,formatDay:String});
  const wrap=document.createElement('div');wrap.innerHTML=html;
  assert(wrap.querySelector('[data-item-panel][role="dialog"][aria-modal="true"]'),'Item Workspace is exposed as an accessible modal dialog');
  assert(wrap.querySelector('[role="tablist"]') && wrap.querySelectorAll('[role="tab"]').length===3,'Item Workspace tabs use tablist/tab semantics');
  assert(wrap.querySelector('[role="tabpanel"]'),'Item Workspace content uses tabpanel semantics');
});



await test('motion orchestrator scopes transitions and maintains moving navigation indicators', async () => {
  assert(globalThis.WorkManagementMotion?.version === '1.30.0','motion orchestrator exposes the v1.30 runtime contract');
  const fixture=document.createElement('section');
  fixture.innerHTML=`<header id="stableMotionHeader">Stable</header><nav class="board-tabs" id="motionTabs"><button class="active" aria-selected="true">One</button><button aria-selected="false">Two</button></nav><main id="motionRegion"><article id="oldMotionView">Old view</article></main>`;
  document.body.appendChild(fixture);
  const stableHeader=fixture.querySelector('#stableMotionHeader');
  const tabs=fixture.querySelector('#motionTabs');
  globalThis.WorkManagementMotion.enhance(fixture);
  await frame();
  const indicator=tabs.querySelector('.wm-motion-indicator');
  assert(indicator && indicator.style.opacity === '1','active navigation receives a shared moving indicator');
  const firstPosition=indicator.style.getPropertyValue('--wm-ind-x');
  const buttons=tabs.querySelectorAll('button');
  buttons[0].classList.remove('active');buttons[0].setAttribute('aria-selected','false');
  buttons[1].classList.add('active');buttons[1].setAttribute('aria-selected','true');
  globalThis.WorkManagementMotion.refreshIndicators(tabs);
  await frame();
  assert(indicator.style.getPropertyValue('--wm-ind-x') !== firstPosition || indicator.style.getPropertyValue('--wm-ind-w') !== '0px','navigation indicator tracks active selection changes');
  const originalHeader=stableHeader;
  await globalThis.WorkManagementMotion.exitThen(()=>{fixture.querySelector('#motionRegion').innerHTML='<article id="newMotionView">New view</article>';},{selector:'#motionRegion > :first-child',duration:12});
  assert(fixture.querySelector('#stableMotionHeader')===originalHeader,'content transition leaves persistent surrounding chrome mounted');
  assert(fixture.querySelector('#newMotionView'),'content transition commits the new route-owned view');
  fixture.remove();
});

await test('motion indicator rebinds after persistent navigation replaces children', async () => {
  const nav=document.createElement('nav');nav.className='board-tabs';nav.innerHTML='<button class="active" aria-selected="true">A</button><button aria-selected="false">B</button>';document.body.appendChild(nav);
  globalThis.WorkManagementMotion.enhance(nav);await frame();
  assert(nav.querySelector('.wm-motion-indicator'),'initial persistent navigation gets an indicator');
  nav.innerHTML='<button aria-selected="false">C</button><button class="active" aria-selected="true">D</button>';
  globalThis.WorkManagementMotion.refreshIndicators(nav);await frame();
  assert(nav.querySelector('.wm-motion-indicator'),'indicator is recreated when persistent navigation children are replaced');
  nav.remove();
});

await test('Item Workspace tab renderer keeps shell stable across rapid tab changes', async () => {
  const host=document.createElement('div');
  host.dataset.itemPanelHost='1';
  document.body.appendChild(host);
  const markup=(tab,label)=>`<div class="item-panel-scrim"></div><aside data-item-panel data-item-id="i1" data-active-tab="${tab}"><header class="item-panel-head"><strong>Stable header</strong></header><nav class="item-panel-tabs" role="tablist"><button data-item-panel-tab="updates" aria-selected="${tab==='updates'}" class="${tab==='updates'?'active':''}">Updates</button><button data-item-panel-tab="files" aria-selected="${tab==='files'}" class="${tab==='files'?'active':''}">Files</button><button data-item-panel-tab="activity" aria-selected="${tab==='activity'}" class="${tab==='activity'?'active':''}">Activity</button></nav><div data-item-panel-body style="height:120px;overflow:auto"><div data-item-tab-stage data-item-tab-content="${tab}" style="height:900px">${label}</div></div></aside>`;
  const renderer=createItemPanelRenderer({getHost:()=>host,patchFull:(target,html)=>{target.innerHTML=html;return true;},reducedMotion:()=>false});
  renderer.render(markup('updates','Updates content'));
  globalThis.WorkManagementMotion?.enhance(host);
  await frame();
  const panel=host.querySelector('[data-item-panel]');
  const head=host.querySelector('.item-panel-head');
  const tabs=host.querySelector('.item-panel-tabs');
  const body=host.querySelector('[data-item-panel-body]');
  body.scrollTop=80;
  renderer.render(markup('files','Files content'));
  assert(host.querySelector('[data-item-panel]')===panel,'tab change keeps Item Workspace drawer shell mounted');
  assert(host.querySelector('.item-panel-head')===head,'tab change keeps Item Workspace header stationary');
  assert(host.querySelector('.item-panel-tabs')===tabs,'tab change keeps Item Workspace tablist stationary');
  assert(host.querySelector('[data-item-panel-body]')===body,'tab change keeps Item Workspace scroll viewport mounted');
  body.scrollTop=110;
  renderer.render(markup('activity','Activity content'));
  renderer.render(markup('updates','Updates return'));
  renderer.render(markup('files','Files return'));
  await frame();
  assert(host.querySelector('[data-item-panel]').dataset.activeTab==='files','rapid tab changes settle on the latest requested tab');
  assert(host.querySelector('[data-item-tab-stage]').dataset.itemTabContent==='files','stale tab content cannot overwrite the latest tab');
  assert(body.scrollTop===110,'returning to a visited tab restores its independent scroll position');
  const stableStage=host.querySelector('[data-item-tab-stage]');
  renderer.render(markup('files','Files refreshed'));
  assert(host.querySelector('[data-item-panel]')===panel && host.querySelector('[data-item-panel-body]')===body,'same-tab refresh does not remount drawer or scroll viewport');
  assert(host.querySelector('[data-item-tab-stage]')!==stableStage,'same-tab data refresh replaces only the internal stage');
  renderer.reset();host.remove();
});

await test('Item Workspace reduced-motion tab renderer skips transition animation', async () => {
  const host=document.createElement('div');document.body.appendChild(host);
  const markup=(tab)=>`<aside data-item-panel data-item-id="i1" data-active-tab="${tab}"><header class="item-panel-head">Header</header><nav class="item-panel-tabs"><button data-item-panel-tab="updates" aria-selected="${tab==='updates'}">Updates</button><button data-item-panel-tab="files" aria-selected="${tab==='files'}">Files</button></nav><div data-item-panel-body><div data-item-tab-stage data-item-tab-content="${tab}">${tab}</div></div></aside>`;
  let animations=0;
  const originalAnimate=Element.prototype.animate;
  Element.prototype.animate=function(...args){animations+=1;return originalAnimate.call(this,...args);};
  try {
    const renderer=createItemPanelRenderer({getHost:()=>host,patchFull:(target,html)=>{target.innerHTML=html;return true;},reducedMotion:()=>true});
    renderer.render(markup('updates'));
    renderer.render(markup('files'));
    assert(animations===0,'reduced-motion tab switching does not start content transition animations');
  } finally {
    Element.prototype.animate=originalAnimate;
    host.remove();
  }
});

await test('Item Workspace tabs render one active indicator without underline collision', async () => {
  const tabs=document.createElement('nav');
  tabs.className='item-panel-tabs';
  tabs.setAttribute('role','tablist');
  tabs.innerHTML='<button class="active" aria-selected="true" role="tab">Updates</button><button aria-selected="false" role="tab">Files</button><button aria-selected="false" role="tab">Activity</button>';
  document.body.appendChild(tabs);
  globalThis.WorkManagementMotion.enhance(tabs);
  await frame();
  const active=tabs.querySelector('button.active');
  const indicator=tabs.querySelector('.wm-motion-indicator');
  const after=getComputedStyle(active,'::after');
  const indicatorStyle=getComputedStyle(indicator);
  assert(after.content==='none' || after.display==='none','legacy active pseudo-underline is suppressed when shared motion navigation is active');
  assert(indicator && indicatorStyle.height==='2px','Item Workspace uses one two-pixel shared active indicator');
  assert(indicatorStyle.bottom==='3px','active indicator is separated from the tab divider');
  tabs.remove();
});

await test('motion design runtime initializes without blocking interaction', async () => {
  await frame();
  assert(['full','reduced'].includes(document.documentElement.dataset.wmMotion),'motion runtime publishes current motion preference');
  assert(document.body.dataset.wmMotionReady==='true','motion runtime initializes document enhancement boundary');
  const button=document.querySelector('#returnFocus');
  button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
  if (document.documentElement.dataset.wmMotion==='full') assert(button.classList.contains('wm-motion-press'),'interactive controls receive kinetic press feedback');
});

results.dataset.status='pass';results.textContent=`PASS\n${log.join('\n')}`;
document.documentElement.dataset.tests='pass';
