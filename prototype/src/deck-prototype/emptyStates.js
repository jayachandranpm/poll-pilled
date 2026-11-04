// Bespoke companion scenes to the sign-in illustration. Use the same artwork
// in both themes: transparent margins and ivory interiors preserve its style.
export const emptyScenes = ['discover','drafts','saved','rewards','insights','following','notifications','responses'];
const aliases = {'empty-polls':'drafts','no-results':'discover','voice-lounge':'rewards'};
const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function emptyArtworkURL(scene='drafts') {
  const key=aliases[scene]||scene;
  return `/assets/empty-states/poll-pilled-${emptyScenes.includes(key)?key:'drafts'}.png`;
}
export function emptyState({title,description='',actionLabel='',action='',scene='drafts',compact=false},button) {
  const key=aliases[scene]||scene;
  return `<section class="empty-state${compact?' empty-state-compact':''}" data-empty-scene="${emptyScenes.includes(key)?key:'drafts'}"><img class="empty-artwork" src="${emptyArtworkURL(scene)}" alt="" aria-hidden="true" width="1024" height="1024" decoding="async"><h2>${escape(title)}</h2>${description?`<p>${escape(description)}</p>`:''}${actionLabel?button(escape(actionLabel),action,'primary'):''}</section>`;
}
