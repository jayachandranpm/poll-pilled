const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
import {icon as glyph} from './icons.js';

export function selectControl({id, label, value, options, field = ''}) {
  const items = options.map(option => typeof option === 'string' ? {value:option,label:option} : option);
  const selected = items.find(option => option.value === value) || items[0];
  return `<div class="select-control" data-select-control>
    <span class="field-label" id="${id}-label">${escape(label)}</span>
    <input type="hidden" id="${id}" value="${escape(selected.value)}" ${field ? `data-editor-field="${field}"` : ''}>
    <button type="button" class="field select-trigger" role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-controls="${id}-options" aria-labelledby="${id}-label ${id}-value">
      <span id="${id}-value" data-select-value>${escape(selected.label)}</span>${glyph('alt-arrow-down-linear')}
    </button>
    <div class="select-options" id="${id}-options" role="listbox" aria-labelledby="${id}-label" popover="manual">
      ${items.map(option => `<button type="button" role="option" class="select-option" tabindex="-1" aria-selected="${option.value === selected.value}" data-value="${escape(option.value)}" data-label="${escape(option.label)}"><span><strong>${escape(option.label)}</strong>${option.description ? `<small>${escape(option.description)}</small>` : ''}</span><span class="select-check">${glyph('check-linear')}</span></button>`).join('')}
    </div>
  </div>`;
}

// Native details retain keyboard and screen-reader behavior; the browser's
// platform-specific marker is replaced by our shared, bundled icon treatment.
export function disclosure({kind, id, label, icon, body, open=false, optional=false}) {
  return `<details class="poll-disclosure ${kind==='reason'?'response-reason':'transcript'}" data-${kind}="${escape(id)}" ${open?'open':''}><summary>${glyph(icon,'sm')}<span>${escape(label)}</span>${optional?'<small>Optional</small>':''}<span class="disclosure-chevron">${glyph(kind==='reason'?'add-linear':'alt-arrow-down-linear','sm')}</span></summary><div class="disclosure-body">${body}</div></details>`;
}
export function rememberDisclosures(root, state) {
  const audience=root.querySelector('.audience-details');if(audience)state.audienceOpen=audience.open;
  for(const kind of ['authorship','targeting','formats']){const el=root.querySelector('details[data-'+kind+']');if(el)(state.editorDisclosures??={})[kind]=el.open;}
  root.querySelectorAll('details[data-transcript],details[data-reason]').forEach(el=>{
    const reason=el.dataset.reason!==undefined,key=reason?'openReasons':'openTranscripts';
    (state[key]??={})[reason?el.dataset.reason:el.dataset.transcript]=el.open;
  });
}

let active = null, search = '', lastTyped = 0;
function close(restore = false) {
  if (!active) return;
  const {menu, trigger} = active;
  if (menu.isConnected) menu.hidePopover();
  trigger.setAttribute('aria-expanded', 'false');
  active = null;
  if (restore && trigger.isConnected) trigger.focus();
}
function open(control, last = false) {
  close();
  search='';lastTyped=0;
  const trigger = control.querySelector('.select-trigger'), menu = control.querySelector('.select-options');
  active = {control, trigger, menu};
  trigger.setAttribute('aria-expanded', 'true');
  const rect = trigger.getBoundingClientRect();
  menu.style.width = `${Math.min(rect.width, innerWidth - 24)}px`;
  menu.style.maxHeight = `${Math.min(320, innerHeight - 24)}px`;
  menu.showPopover();
  const height = menu.getBoundingClientRect().height;
  const top = rect.bottom + height + 8 <= innerHeight - 12 ? rect.bottom + 6 : Math.max(12, rect.top - height - 6);
  menu.style.top = `${top}px`;
  menu.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - menu.offsetWidth - 12))}px`;
  const items = [...menu.querySelectorAll('[role=option]')];
  (last ? items.at(-1) : menu.querySelector('[aria-selected=true]') || items[0]).focus();
}
document.addEventListener('click', event => {
  const trigger = event.target.closest('.select-trigger');
  if (trigger) {
    event.preventDefault();
    if (active?.trigger === trigger) close(true); else open(trigger.closest('[data-select-control]'));
    return;
  }
  const option = event.target.closest('.select-option');
  if (!option || !active || !active.menu.contains(option)) return;
  const {control, menu} = active, input = control.querySelector('input');
  input.value = option.dataset.value;
  control.querySelector('[data-select-value]').textContent = option.dataset.label;
  menu.querySelectorAll('[role=option]').forEach(item => item.setAttribute('aria-selected', String(item === option)));
  close(true);
  input.dispatchEvent(new Event('change', {bubbles:true}));
});
document.addEventListener('pointerdown', event => {
  if (active && !active.control.contains(event.target)) close();
});
document.addEventListener('keydown', event => {
  const trigger = event.target.closest('.select-trigger');
  if (!active && trigger && ['ArrowDown','ArrowUp','Enter',' '].includes(event.key)) {
    event.preventDefault();open(trigger.closest('[data-select-control]'), event.key === 'ArrowUp');return;
  }
  if (!active || !active.control.contains(event.target)) return;
  if (event.key === 'Escape') {event.preventDefault();event.stopImmediatePropagation();close(true);return;}
  if (event.key === 'Tab') {close(true);return;}
  const items = [...active.menu.querySelectorAll('[role=option]')], current = items.indexOf(document.activeElement);
  if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[index].focus();
  } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && event.key !== ' ') {
    search = Date.now() - lastTyped > 600 ? event.key : search + event.key;lastTyped = Date.now();
    const match = items.find(item => item.dataset.label.toLowerCase().startsWith(search.toLowerCase()));
    if (match) {event.preventDefault();match.focus();}
  }
}, true);
window.addEventListener('resize', () => close());
window.addEventListener('hashchange', () => close());
window.addEventListener('poll-navigation', () => close());
document.addEventListener('close', event => {if(event.target.tagName==='DIALOG')close();}, true);
document.addEventListener('poll-dialog-replace', () => close(), true);
document.addEventListener('scroll', event => {if (active && !active.menu.contains(event.target)) close();}, true);
