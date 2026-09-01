/* TradeLink v1.37.0 — CSS3 icon-button enhancement layer.
   Keeps original controls/listeners intact and only enhances their presentation. */
(()=>{
  'use strict';
  const SELECTOR=[
    '.button','.toolbar button','.modal-actions button','.icon-button','.icon-action','.item-remove',
    '.line-actions button','.document-menu-trigger','.document-action-menu button','.nav-tabs button',
    '.create-type-tabs button','.recovery-tabs button','.esi-section-nav button','.modal-close'
  ].join(',');
  const ICONS={
    plus:'<path d="M12 5v14M5 12h14"/>',
    documents:'<path d="M8 6h11M8 12h11M8 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    manual:'<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h5M9 13h7M9 17h7"/>',
    recovery:'<path d="M20 11a8 8 0 1 1-2.34-5.66L20 8"/><path d="M20 3v5h-5"/>',
    invoice:'<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h5M9 12h6M9 16h6"/>',
    package:'<path d="m4 8 8-4 8 4-8 4z"/><path d="m4 8v8l8 4 8-4V8M12 12v8"/>',
    truck:'<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    receipt:'<path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    quote:'<path d="M5 5h14v10H9l-4 4z"/><path d="M9 9h6M9 12h4"/>',
    cart:'<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.4 10.5h10.8L21 8H7"/>',
    save:'<path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h7V4M8 20v-6h8v6"/>',
    template:'<rect x="4" y="4" width="12" height="14" rx="2"/><path d="M8 8h4M8 12h4M9 21h9a2 2 0 0 0 2-2V7"/>',
    import:'<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 14v6h14v-6"/>',
    export:'<path d="M12 21V9M8 13l4-4 4 4"/><path d="M5 10V4h14v6"/>',
    snapshot:'<path d="M4 7h4l2-2h4l2 2h4v12H4z"/><circle cx="12" cy="13" r="3"/>',
    reset:'<path d="M4 10a8 8 0 1 1 2 7"/><path d="M4 4v6h6"/>',
    delete:'<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
    eye:'<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.5"/>',
    edit:'<path d="M4 20h4l11-11-4-4L4 16zM13 7l4 4"/>',
    comment:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    print:'<path d="M7 8V3h10v5M7 17H4v-7h16v7h-3"/><path d="M7 14h10v7H7z"/>',
    excel:'<path d="M5 4h14v16H5zM5 9h14M5 14h14M10 4v16M15 4v16"/>',
    duplicate:'<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    history:'<path d="M4 10a8 8 0 1 1 2 7"/><path d="M4 4v6h6M12 7v5l3 2"/>',
    more:'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    expand:'<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
    collapse:'<path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5"/>',
    arrowup:'<path d="M12 19V5M7 10l5-5 5 5"/>',
    arrowdown:'<path d="M12 5v14M7 14l5 5 5-5"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    activity:'<path d="M4 12h4l2-5 4 10 2-5h4"/>'
  };
  const svg=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.plus}</svg>`;
  const clean=s=>String(s||'').replace(/^[^\p{L}\p{N}]+/u,'').trim();
  function meta(el){
    const text=clean(el.textContent);
    if(el.dataset.tab)return ({create:['Create New','plus','fill'],documents:['All Documents','documents','enter'],manual:['User Manual','manual','collapse'],recovery:['Recovery','recovery','rotate']})[el.dataset.tab]||[text,'documents','fill'];
    if(el.dataset.createType)return ({esi:['Electronic SI','invoice','fill'],packing:['Packing List','package','enter'],delivery:['Delivery Receipt','truck','collapse'],payment:['Payment AR','receipt','rotate'],quotation:['Quotations','quote','fill'],po:['PO to Suppliers','cart','enter']})[el.dataset.createType];
    if(el.dataset.recoveryPane)return el.dataset.recoveryPane==='activity'?['Activity','activity','rotate']:['Recovery Tools','recovery','collapse'];
    if(el.dataset.scrollSection)return ({esiDocumentInfo:['Document','invoice','fill'],esiClientInfo:['Client','documents','enter'],esiItems:['Items','package','collapse'],esiFinancial:['Adjustments','receipt','rotate'],esiTerms:['Terms','manual','enter'],esiApprovalWorkflow:['Approval','check','fill']})[el.dataset.scrollSection]||[text,'documents','fill'];
    if(el.dataset.documentAction)return ({preview:['Preview','eye','fill'],edit:[text.includes('Approved')?'Edit/Approved':'Edit','edit','enter'],comment:['Comment','comment','collapse'],print:['Print PDF','print','fill'],excel:['Export to Excel','excel','enter'],duplicate:['Duplicate','duplicate','collapse'],history:['Change History','history','rotate'],delete:['Delete','delete','expand']})[el.dataset.documentAction];
    if(el.dataset.documentMenu)return ['', 'more','rotate'];
    const label=el.getAttribute('aria-label')||text, low=label.toLowerCase();
    if(/delete|remove|clear all|reset application/.test(low))return [text,'delete','expand'];
    if(/save|submit|approve|complete|create document|add comment/.test(low))return [text,'save','fill'];
    if(/snapshot/.test(low))return [text,'snapshot','fill'];
    if(/history|reset|restore|refresh/.test(low))return [text,/history/.test(low)?'history':'reset','rotate'];
    if(/expand/.test(low))return [text,'expand','collapse'];
    if(/collapse/.test(low))return [text,'collapse','collapse'];
    if(/print|pdf/.test(low))return [text,'print','fill'];
    if(/template/.test(low))return [text,'template','enter'];
    if(/import|upload/.test(low))return [text,'import','enter'];
    if(/export|download/.test(low))return [text,'export','enter'];
    if(/duplicate|copy/.test(low))return [text,'duplicate','collapse'];
    if(/comment|note/.test(low))return [text,'comment','collapse'];
    if(/preview|view|open/.test(low))return [text,'eye','fill'];
    if(/edit/.test(low))return [text,'edit','enter'];
    if(/move.*up|previous|first/.test(low))return [text,'arrowup','collapse'];
    if(/move.*down|next|last/.test(low))return [text,'arrowdown','collapse'];
    if(/close|cancel/.test(low))return [text,'close','expand'];
    if(/add|new/.test(low))return [text,'plus','fill'];
    return [text,'documents','fill'];
  }
  function tone(el,effect){
    if(el.matches('.danger,.button.danger,.button.danger-text,.icon-button.danger,.icon-action.danger,.item-remove')||effect==='expand')return 'red';
    if(el.matches('.warning-outline,.warning-text')||effect==='enter')return 'orange';
    if(effect==='rotate')return 'purple';
    if(effect==='collapse')return 'green-light';
    return 'green';
  }
  function enhance(el,force=false){
    if(!el||!el.matches?.(SELECTOR))return;
    if(!force&&el.dataset.css3IconButton==='true'&&el.querySelector('.css3-button-icon'))return;
    const [raw,icon,effect]=meta(el), label=raw||clean(el.textContent);
    const input=el.matches('.file-button')?el.querySelector('input[type="file"]'):null;
    if(input)input.remove();
    const iconOnly=el.matches('.icon-button,.icon-action,.item-remove,.line-actions button,.document-menu-trigger,.modal-close')||(!label&&Boolean(el.getAttribute('aria-label')));
    [...el.classList].filter(c=>c.startsWith('css3-effect-')||c.startsWith('css3-tone-')).forEach(c=>el.classList.remove(c));
    el.classList.add('css3-icon-control',`css3-effect-${effect}`,`css3-tone-${tone(el,effect)}`);
    el.classList.toggle('css3-icon-only',iconOnly);
    el.innerHTML=`<span class="css3-button-icon" aria-hidden="true">${svg(icon)}</span>${iconOnly?'':`<span class="css3-button-label"></span>`}`;
    if(!iconOnly)el.querySelector('.css3-button-label').textContent=label;
    if(input)el.appendChild(input);
    el.dataset.css3IconButton='true';
  }
  function enhanceTree(root=document){
    if(root.nodeType===1&&root.matches?.(SELECTOR))enhance(root);
    root.querySelectorAll?.(SELECTOR).forEach(el=>enhance(el));
  }
  enhanceTree(document);
  const observer=new MutationObserver(records=>{
    for(const rec of records){
      const owner=rec.target.nodeType===1?rec.target.closest?.(SELECTOR):rec.target.parentElement?.closest?.(SELECTOR);
      if(owner&&owner.dataset.css3IconButton==='true'&&!owner.querySelector('.css3-button-icon'))enhance(owner,true);
      rec.addedNodes.forEach(node=>{if(node.nodeType===1)enhanceTree(node)});
    }
  });
  observer.observe(document.documentElement,{subtree:true,childList:true});
})();
