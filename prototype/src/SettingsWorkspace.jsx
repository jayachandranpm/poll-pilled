import React from 'react';
import {Button,Icon,Toggle} from './ui.jsx';
import {Avatar,Connections} from './Features.jsx';
import {InterestsSettings} from './InterestsSettings.jsx';
import {AppearanceSettings,SettingsHome} from './AppearanceSettings.jsx';
import {CloudflareSettings} from './CloudflareSettings.jsx';
import {PreferencesFooter,SettingsHeading,SettingsLink} from './SettingsControls.jsx';
import {DEMO_MODE} from './api.js';

const operator=[
 ['Connections','Meta & budget','stars-linear','Model connections and daily spending'],
 ['Voice','AI voice','microphone-3-linear','Cloudflare voice generation'],
 ['Security','Bot protection','shield-check-linear','Turnstile and workspace protection']
];

export function SettingsWorkspace({section,state,pref,setPref,dirty,onSave,busy,appearance,setAppearance,nav,notify,refresh,onReset,onExport}){
 const onSection=section=>nav('settings',{section});
 const valid=Boolean(pref.interests.length&&pref.formats.length&&pref.languages.length);
 const personal=['Profile','Notifications','Interests'].includes(section);
 const privacy=[
  ['What is collected?','Polls, answers, explanations, uploaded media, preferences, participation and reward activity.'],
  ['Who sees my response?','The publisher can see your answer and optional explanation. Other participants see aggregate results after answering, not your private explanation.'],
  ['How are free polls reused?','Publishing a free public poll grants platform reuse of that poll and its responses under publishing terms. Paid campaigns do not grant that additional reuse.'],
  ['When does AI receive data?','Only requested AI work sends the relevant prompt or media to Meta. Generated voice sends your script to Cloudflare Workers AI.'],
  ['Storage and retention',DEMO_MODE?'Marketplace examples are stored in this browser until reset. Uploaded media and encrypted connection data are held on the local server; saved AI results expire after 24 hours. Resetting examples does not delete server uploads or connections.':'Marketplace data and uploads are held on the server. Saved AI results expire after 24 hours. Contact the operator for account-data retention and removal.']
 ];
 return <div className={`settings-workspace ${section==='Menu'?'is-index':''}`}><div className={`page-body settings ${section==='Menu'?'settings-index':''}`}>
  {section==='Menu'?<SettingsHome identity={{...state.identity,tagline:pref.tagline}} preferences={pref} appearance={appearance} onSection={onSection}/>
   :section==='Interests'?<InterestsSettings value={pref} onChange={setPref} polls={state.polls}/>
   :section==='Appearance'?<AppearanceSettings value={appearance} onChange={setAppearance}/>
   :['Profile','Notifications'].includes(section)?<div className="account-settings">
    <section className="settings-block"><SettingsHeading title="Public identity" description="Polls and responses use your anonymous name and tagline."/>
     <div className="settings-identity"><Avatar size={48}/><div><b>{state.identity.author}</b><small>Anonymous name</small></div><Icon name="shield-check-linear" size={20}/></div>
     <label className="settings-field" htmlFor="settings-tagline">Tagline<textarea id="settings-tagline" aria-describedby="settings-tagline-help" maxLength={70} rows={2} value={pref.tagline} onChange={e=>setPref({...pref,tagline:e.target.value})}/></label>
     <div className="settings-field-help" id="settings-tagline-help"><span>Shown with your polls and responses.</span><span>{pref.tagline.length}/70</span></div>
    </section>
    <section className="settings-block"><SettingsHeading title="Updates"/><div className="settings-toggle-row"><div><b>Decision updates</b><small>See what your answers helped shape in Wallet.</small></div><Toggle label="Decision updates" checked={pref.notifications} onChange={notifications=>setPref({...pref,notifications})}/></div><p className="settings-help">Reward reviews and paid invitations are always available in Wallet.</p></section>
   </div>
   :section==='Setup'?<div className="settings-directory"><div className="settings-block"><SettingsHeading title="Connected services" description="Configure AI and protection for this workspace. Participants don’t need to set these up."/></div><nav className="settings-link-group" aria-label="Platform services">{operator.map(([id,title,icon,description])=><SettingsLink key={id} icon={icon} title={title} description={description} onClick={()=>onSection(id)}/>)}</nav></div>
   :section==='Connections'?<Connections state={state} refresh={refresh} notify={notify}/>
   :['Voice','Security'].includes(section)?<CloudflareSettings kind={section==='Voice'?'voice':'security'} notify={notify} refresh={refresh}/>
   :<div className="settings-privacy">
    <section className="settings-block"><SettingsHeading title="Your data, explained" description="Public activity uses an anonymous name. Your voice or images may still identify you."/>
     <div className="settings-disclosures">{privacy.map(([title,body])=><details className="settings-disclosure" key={title}><summary>{title}<Icon name="alt-arrow-down-linear" size={18}/></summary><p>{body}</p></details>)}</div>
    </section>
    <section className="settings-block settings-action-row"><div><h3>Export your activity</h3><p>Download a copy of your polls and responses.</p></div><Button kind="secondary" onClick={onExport} icon="download-linear">Export</Button></section>
    {DEMO_MODE&&<section className="settings-block"><details className="settings-disclosure"><summary>Demo tools<Icon name="alt-arrow-down-linear" size={18}/></summary><p>Reset sample polls and marketplace activity in this browser. Server connections and uploads are separate.</p><Button kind="secondary" onClick={onReset}>Reset example data</Button></details></section>}
   </div>}
  {(personal||dirty)&&<PreferencesFooter dirty={dirty} busy={busy} valid={valid} onSave={onSave} onDiscard={()=>setPref({...state.preferences})}/>}
 </div></div>;
}
