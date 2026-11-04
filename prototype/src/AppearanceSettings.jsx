import React,{useEffect,useState} from 'react';
import {Icon,Segmented,ChoiceMark} from './ui.jsx';
import {SettingsHeading,SettingsLink} from './SettingsControls.jsx';
const KEY='pollpilled-appearance-v1';
export function useAppearance(){
 const [appearance,setAppearance]=useState(()=>{try{return {mode:'Light',font:'Theme',size:'Default',...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch{return {mode:'Light',font:'Theme',size:'Default'}}});
 const [systemDark,setSystemDark]=useState(()=>matchMedia('(prefers-color-scheme: dark)').matches);
 useEffect(()=>{const q=matchMedia('(prefers-color-scheme: dark)');const update=()=>setSystemDark(q.matches);q.addEventListener('change',update);return()=>q.removeEventListener('change',update)},[]);
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(appearance))}catch{}},[appearance]);
 return {appearance,setAppearance,dark:appearance.mode==='Dark'||appearance.mode==='System'&&systemDark};
}
export function AppearanceSettings({value,onChange}){
 return <div className="appearance-settings">
  <section className="settings-block"><SettingsHeading title="Color mode" description="Use a light, dark or device-matched theme."/>
   <div className="theme-previews" role="group" aria-label="Colour mode">{['Light','Dark','System'].map(mode=><button className="theme-choice" aria-pressed={value.mode===mode} key={mode} onClick={()=>onChange({...value,mode})}><span className={`theme-mini theme-${mode.toLowerCase()}`} aria-hidden="true"><i/><span><b/><em/><em/><strong/><b/><em/></span></span><span>{mode}<ChoiceMark selected={value.mode===mode} size={18}/></span></button>)}</div>
  </section>
  <section className="settings-block appearance-type">
   <SettingsHeading title="Text" description="Choose what feels comfortable to read."/>
   <div className="appearance-control"><span id="settings-font-label">Font</span><Segmented label="Font" value={value.font==='Theme'?'Inter':'System'} options={['Inter','System']} onChange={font=>onChange({...value,font:font==='Inter'?'Theme':'System'})}/></div>
   <div className="appearance-control"><span>Size</span><Segmented label="Font size" value={value.size} options={['Smaller','Default','Larger']} onChange={size=>onChange({...value,size})}/></div>
   <div className="settings-text-preview"><span className="settings-group-label">Preview</span><h3>What would make your day better?</h3><p>+300 points · 30 seconds</p><div><ChoiceMark selected/>A little more time outdoors</div></div>
  </section>
  <p className="preferences-saved" role="status"><Icon name="check-circle-linear" size={16}/>Saved automatically on this device</p>
 </div>;
}
export function SettingsHome({identity,preferences,appearance,onSection}){
 const items=[
  ['Interests','hashtag-linear','Interests & formats',`${preferences.interests.length} topics · ${preferences.formats.length} formats · ${preferences.languages.join(', ')}`],
  ['Appearance','paint-linear','Appearance',`${appearance.mode} theme · ${appearance.font==='Theme'?'Inter':'System font'} · ${appearance.size} size`],
  ['Data','shield-check-linear','Privacy & your data','Activity, AI use and data export']
 ];
 return <div className="settings-directory">
  <button className="settings-account-link" aria-label="Account & updates" onClick={()=>onSection('Profile')}><img src="/assets/avatar-otter.png" alt=""/><span><b>{identity.author}</b><small>{identity.tagline||'Your anonymous public identity'}</small><span>Account & updates</span></span><Icon name="alt-arrow-right-linear" size={18}/></button>
  <nav aria-label="Settings sections"><section className="settings-link-group"><h3 className="settings-group-label">Your preferences</h3>{items.map(([section,icon,title,description])=><SettingsLink key={section} icon={icon} title={title} description={description} onClick={()=>onSection(section)}/>)}</section>
   <section className="settings-link-group"><h3 className="settings-group-label">Workspace</h3><SettingsLink icon="tuning-2-linear" title="Platform setup" description="Meta, AI voice and bot protection" onClick={()=>onSection('Setup')}/></section>
  </nav>
 </div>;
}
