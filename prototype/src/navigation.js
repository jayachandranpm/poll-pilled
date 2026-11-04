const views = ['discover', 'polls', 'wallet', 'saved', 'settings', 'editor'];
const sections = ['Menu','Interests', 'Profile', 'Notifications', 'Connections', 'Security', 'Data','Appearance','Setup','Voice'];
const circlePolls = {'for-you':'',everyday:'home', design:'bag', food:'breakfast', work:'week',technology:'',entertainment:'',travel:'',wellbeing:''};
export function readRoute(search = location.search) {
  const params = new URLSearchParams(search);
  if(!params.size){params.set('circle','for-you');params.set('layout','feed');}
  const circle = Object.hasOwn(circlePolls, params.get('circle')) ? params.get('circle') : 'for-you';
  return {
    view: views.includes(params.get('view')) ? params.get('view') : 'discover',
    section: sections.find(s => s.toLowerCase() === params.get('section')) || 'Menu',
    tab: params.get('tab') === 'drafts' ? 'Drafts' : 'Live',
    circle,
    poll: params.get('poll') || '',
    response: params.get('response') || '',
    layout: params.get('poll') ? 'question' : 'feed',
    reward: [200,300,400].includes(Number(params.get('reward'))) ? Number(params.get('reward')) : 0,
    sort: ['reward','quick'].includes(params.get('sort')) ? params.get('sort') : 'for-you',
    format: ['classic','visual','audio','slider','rank','ab','video','pairwise','allocation'].includes(params.get('format')) ? params.get('format') : 'all',
    from: ['saved','polls','search'].includes(params.get('from')) ? params.get('from') : '',
    query: params.get('q') || '',
    panel:['Responses','Insights','Follow-ups','Decision','Quality','Delivery'].includes(params.get('panel'))?params.get('panel'):'',
  };
}
export function routeURL(route) {
  const params = new URLSearchParams({view:route.view});
  if (route.view === 'settings') params.set('section', route.section.toLowerCase());
  if (route.view === 'wallet' && route.response) params.set('response',route.response);
  if (route.view === 'polls') params.set('tab', route.tab.toLowerCase());
  if (route.view === 'discover') {
    params.set('circle', route.circle);
    params.set('poll', route.poll);
    if(route.layout === 'feed') params.set('layout','feed');
    if(route.format && route.format !== 'all') params.set('format',route.format);
    if(route.panel) params.set('panel',route.panel);
    if(route.reward) params.set('reward',String(route.reward));
    if(route.sort&&route.sort!=='for-you') params.set('sort',route.sort);
    if (route.from) params.set('from', route.from);
    if (route.query) params.set('q', route.query);
  }
  return `?${params}`;
}

// Discover is one feed; selecting a poll opens its focused answer page.
export function discoveryRoute(route, patch) {
  const next={...route,view:'discover',from:'',panel:'',...patch};
  return {...next,layout:next.poll?'question':'feed'};
}
