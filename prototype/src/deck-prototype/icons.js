// Trusted, locally licensed SVGs are bundled with the UI. Rendering an icon
// never waits for a separate image request or third-party icon service.
const files = import.meta.glob([
  '../../public/assets/icons/*.svg',
  '../../public/assets/threads/{home,home-outline,search,heart,profile,insights,more,post-more,create,back}.svg',
], {query:'?raw', import:'default', eager:true});
const sources = {'home-smile-linear':'home','home-outline':'home-outline','magnifer-linear':'search','heart-linear':'heart','users-group-rounded-linear':'profile','chart-square-linear':'insights','hamburger-menu-linear':'more','menu-dots-linear':'post-more','add-linear':'create','arrow-left-linear':'back'};
export function icon(name, cls='') {
  const path = sources[name] ? `threads/${sources[name]}` : `icons/${name}`;
  const raw = files[`../../public/assets/${path}.svg`];
  if (!raw) throw new Error(`Missing bundled icon: ${name}`);
  const svg = raw.replace(/<title>[\s\S]*?<\/title>/g, '').replace(/<svg\b([^>]*)>/, (_, attrs) =>
    `<svg${attrs.replace(/\s(?:role|width|height)="[^"]*"/g, '')}${/\bfill=/.test(attrs)?'':' fill="currentColor"'} aria-hidden="true" focusable="false">`);
  return `<span class="icon ${cls}" aria-hidden="true">${svg}</span>`;
}
