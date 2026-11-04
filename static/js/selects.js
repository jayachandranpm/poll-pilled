/* Ant Trial's anchored, keyboard-operated select pattern, shared by every form. */
'use strict';
const customSelect={select:null,trigger:null,index:0,type:'',timer:null};
function selectLabel(select){
  if(select.getAttribute('aria-label'))return select.getAttribute('aria-label');
  const label=select.labels?.[0];
  if(label){const copy=label.cloneNode(true);copy.querySelectorAll('select,input,small,.select-control').forEach(e=>e.remove());return copy.textContent.trim();}
  return 'Choose an option';
}
function syncSelects(){
  $$('select:not([multiple])').forEach(select=>{
    let trigger=select.nextElementSibling;
    if(!select.dataset.customSelect){
      select.dataset.customSelect='true';select.classList.add('native-select');select.tabIndex=-1;select.setAttribute('aria-hidden','true');
      const control=document.createElement('span');control.className='select-control';select.before(control);control.append(select);
      trigger=document.createElement('button');trigger.type='button';trigger.className='select-trigger';trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');trigger.innerHTML=`<span class="select-value"></span>${icon('alt-arrow-down-linear')}`;control.append(trigger);
    }
    if(!trigger?.classList.contains('select-trigger'))return;
    const text=select.selectedOptions[0]?.textContent||'Choose an option';if(trigger.firstElementChild.textContent!==text)trigger.firstElementChild.textContent=text;
    if(state.icons['alt-arrow-down-linear']&&!trigger.querySelector('svg').childElementCount)trigger.querySelector('svg').innerHTML=state.icons['alt-arrow-down-linear'];
    if(trigger.disabled!==select.disabled)trigger.disabled=select.disabled;
    trigger.setAttribute('aria-label',selectLabel(select));
  });
}
function closeSelect(refocus=false){
  const trigger=customSelect.trigger;if(trigger){trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-controls');trigger.removeAttribute('aria-activedescendant');}
  $('#select-layer')?.remove();customSelect.select=null;customSelect.trigger=null;customSelect.type='';clearTimeout(customSelect.timer);if(refocus&&trigger?.isConnected)trigger.focus({preventScroll:true});
}
function selectHighlight(index,keyboard=true){
  const select=customSelect.select;if(!select||select.options[index]?.disabled)return;
  customSelect.index=index;$$('#select-layer [role="option"]').forEach((el,i)=>el.classList.toggle('is-active',keyboard&&i===index));
  customSelect.trigger.setAttribute('aria-activedescendant','select-option-'+index);if(keyboard)$('#select-option-'+index)?.scrollIntoView({block:'nearest'});
}
function openSelect(trigger,keyboard=false){
  if(customSelect.trigger===trigger){closeSelect(true);return;}closeSelect();closeAppMenu();
  const select=trigger.previousElementSibling;if(select.disabled)return;trigger.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
  Object.assign(customSelect,{select,trigger,index:select.selectedIndex});trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls','custom-select-options');
  const layer=document.createElement('div');layer.id='select-layer';layer.className='select-menu';layer.innerHTML=`<div class="select-menu-label">${escapeHTML(selectLabel(select))}</div><div id="custom-select-options" role="listbox" aria-label="${escapeHTML(selectLabel(select))}">${[...select.options].map((o,i)=>`<button type="button" id="select-option-${i}" class="select-option" role="option" tabindex="-1" aria-selected="${o.selected}" aria-disabled="${o.disabled}" data-option-index="${i}"><span>${escapeHTML(o.textContent)}</span><span class="select-option-mark" aria-hidden="true">${o.selected?icon('check-linear'):''}</span></button>`).join('')}</div>`;document.body.append(layer);
  const rect=trigger.getBoundingClientRect();customSelect.anchor={top:rect.top,left:rect.left};const width=Math.min(Math.max(205,rect.width),innerWidth-20),below=innerHeight-rect.bottom-12,above=rect.top-12,up=below<180&&above>below;
  layer.style.width=width+'px';layer.style.left=Math.max(10,Math.min(rect.left,innerWidth-width-10))+'px';layer.style.maxHeight=Math.min(320,Math.max(100,up?above:below))+'px';
  if(up)layer.style.bottom=innerHeight-rect.top+5+'px';else layer.style.top=rect.bottom+5+'px';selectHighlight(select.selectedIndex,keyboard);trigger.focus({preventScroll:true});
}
function chooseSelect(index){
  const select=customSelect.select;if(!select||select.options[index]?.disabled)return;
  select.selectedIndex=index;closeSelect(true);syncSelects();select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));syncSelects();
}
document.addEventListener('click',event=>{
  const trigger=event.target.closest('.select-trigger'),option=event.target.closest('[data-option-index]');
  if(trigger){event.preventDefault();event.stopImmediatePropagation();openSelect(trigger);return;}
  if(option){event.preventDefault();event.stopImmediatePropagation();chooseSelect(Number(option.dataset.optionIndex));return;}
  if(customSelect.select&&!event.target.closest('#select-layer'))closeSelect();
},true);
document.addEventListener('pointermove',event=>{const option=event.target.closest('[data-option-index]');if(option&&customSelect.select)selectHighlight(Number(option.dataset.optionIndex),false);});
document.addEventListener('keydown',event=>{
  const trigger=event.target.closest('.select-trigger');if(!trigger&&!customSelect.select)return;
  if(event.key==='Tab'){closeSelect();return;}
  if(event.key==='Escape'&&customSelect.select){event.preventDefault();event.stopImmediatePropagation();closeSelect(true);return;}
  if(!customSelect.select){if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();openSelect(trigger,true);}else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();event.stopImmediatePropagation();openSelect(trigger,true);customSelect.type=event.key.toLowerCase();const match=[...customSelect.select.options].findIndex(o=>!o.disabled&&o.textContent.toLowerCase().startsWith(customSelect.type));if(match>=0)selectHighlight(match);customSelect.timer=setTimeout(()=>customSelect.type='',650);}return;}
  const select=customSelect.select,enabled=[...select.options].map((o,i)=>o.disabled?-1:i).filter(i=>i>=0),pos=enabled.indexOf(customSelect.index);
  if(['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)){
    event.preventDefault();event.stopImmediatePropagation();if(event.key==='Enter'||event.key===' '){chooseSelect(customSelect.index);return;}
    selectHighlight(event.key==='Home'?enabled[0]:event.key==='End'?enabled.at(-1):enabled[(pos+(event.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length]);
  }else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey){event.preventDefault();event.stopImmediatePropagation();customSelect.type+=event.key.toLowerCase();clearTimeout(customSelect.timer);customSelect.timer=setTimeout(()=>customSelect.type='',650);const match=enabled.find(i=>select.options[i].textContent.toLowerCase().startsWith(customSelect.type));if(match!==undefined)selectHighlight(match);}
},true);
window.addEventListener('resize',()=>closeSelect());document.addEventListener('scroll',event=>{if(customSelect.select&&!event.target.closest?.('#select-layer')){const r=customSelect.trigger.getBoundingClientRect(),a=customSelect.anchor;if(!a||Math.abs(r.top-a.top)>1||Math.abs(r.left-a.left)>1)closeSelect();}},true);
document.addEventListener('change',event=>{if(event.target.matches('select'))syncSelects();});
new MutationObserver(()=>{if(customSelect.trigger&&!customSelect.trigger.isConnected)closeSelect();syncSelects();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
syncSelects();
/* Ant Trial's workspace and account menu share the select menu surface. */
let appMenuTrigger=null;
function closeAppMenu(restore=false){const trigger=appMenuTrigger;$('#app-menu-layer')?.remove();appMenuTrigger=null;if(trigger){trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-controls');if(restore&&trigger.isConnected)trigger.focus({preventScroll:true});}}
function appMenuItem(label,ico,attributes){return `<button type="button" role="menuitem" tabindex="-1" ${attributes}>${icon(ico)}<span>${label}</span></button>`;}
function openAppMenu(trigger,workspace=false){
  if(trigger===appMenuTrigger){closeAppMenu(true);return;}closeAppMenu();closeSelect();appMenuTrigger=trigger;trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-controls','app-menu');
  const identity=`<div class="app-menu-identity">${avatar(workspace?'PP':initials(state.profile.name),'blue')}<div><strong>${escapeHTML(workspace?'Poll Pilled':state.profile.name)}</strong><small>${workspace?'One community. Two ways to join.':'Your personal workspace'}</small></div></div>`;
  const roles=['participant','publisher'].map(role=>`<button type="button" role="menuitemradio" tabindex="-1" aria-checked="${state.workspace===role}" data-workspace="${role}">${icon(role==='participant'?'hand-money-linear':'target-linear')}<span>${role==='participant'?'Take polls & earn':'Publisher studio'}</span><span class="app-menu-mark">${state.workspace===role?icon('check-linear'):''}</span></button>`).join('');
  const body=workspace?`${identity}<div class="app-menu-divider"></div><div class="app-menu-caption">Choose your workspace</div>${roles}<div class="app-menu-divider"></div>${appMenuItem('Workspace settings','settings-linear','data-setting-page="profile"')}${appMenuItem('Rewards & credit rules','wallet-money-linear','data-setting-page="rewards"')}`:`${identity}<div class="app-menu-divider"></div>${appMenuItem('Profile & settings','settings-linear','data-setting-page="profile"')}${appMenuItem('Appearance','sun-2-linear','data-setting-page="appearance"')}${appMenuItem('Your interests','heart-linear','data-setting-page="interests"')}<div class="app-menu-divider"></div>${appMenuItem('My reward wallet','wallet-money-linear','data-view="wallet"')}${appMenuItem('Keyboard shortcuts','text-field-linear','data-setting-page="shortcuts"')}`;
  const layer=document.createElement('div');layer.id='app-menu-layer';layer.innerHTML=`<div class="app-menu" role="menu" id="app-menu" aria-label="${workspace?'Workspace menu':'Your account'}">${body}</div>`;document.body.append(layer);
  const menu=layer.firstElementChild,rect=trigger.getBoundingClientRect(),width=Math.min(285,innerWidth-20);menu.style.width=width+'px';menu.style.left=Math.max(10,Math.min(rect.left,innerWidth-width-10))+'px';menu.style.maxHeight=innerHeight-24+'px';menu.style.top=Math.max(10,Math.min(rect.bottom+6,innerHeight-menu.getBoundingClientRect().height-10))+'px';menu.querySelector('button')?.focus({preventScroll:true});
}
document.addEventListener('click',event=>{
  const trigger=event.target.closest('.brand[data-action="workspace"],.profile-button[data-action="settings"]');
  if(trigger){event.preventDefault();event.stopImmediatePropagation();openAppMenu(trigger,trigger.classList.contains('brand'));return;}
  if(appMenuTrigger&&!event.target.closest('.app-menu-identity'))closeAppMenu();
},true);
document.addEventListener('keydown',event=>{
  if(!appMenuTrigger)return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeAppMenu(true);return;}
  if(event.key==='Tab'){closeAppMenu(true);return;}
  if(event.key.length===1&&![' ','Enter'].includes(event.key)&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();event.stopImmediatePropagation();$$('#app-menu button').find(b=>b.textContent.trim().toLowerCase().startsWith(event.key.toLowerCase()))?.focus();return;}
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();const items=$$('#app-menu button'),i=items.indexOf(document.activeElement);items[event.key==='Home'?0:event.key==='End'?items.length-1:(i+(event.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
},true);
window.addEventListener('resize',()=>closeAppMenu());document.addEventListener('scroll',event=>{if(appMenuTrigger&&!event.target.closest?.('#app-menu-layer'))closeAppMenu();},true);
const sharedControlModal=modal;
modal=function(...args){closeSelect();closeAppMenu();return sharedControlModal(...args);};
