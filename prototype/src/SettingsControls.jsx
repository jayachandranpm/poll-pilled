import React from 'react';
import {Button,Icon} from './ui.jsx';

export function SettingsLink({icon,title,description,onClick,label}) {
 return <button className="settings-link" aria-label={label||title} onClick={onClick}>
  <Icon name={icon} size={24}/><span className="settings-link-copy"><b>{title}</b>{description&&<small>{description}</small>}</span><Icon name="alt-arrow-right-linear" size={18}/>
 </button>;
}

export function SettingsHeading({title,description,meta}) {
 return <div className="settings-heading"><div><h3>{title}</h3>{description&&<p>{description}</p>}</div>{meta&&<span className="settings-meta">{meta}</span>}</div>;
}

export function PreferencesFooter({dirty,busy,valid=true,onSave,onDiscard}) {
 return dirty?<div className="preferences-footer" role="region" aria-label="Unsaved preferences">
  <span role="status">{valid?'Unsaved changes':'Choose at least one topic, format and language.'}</span>
  <div><Button kind="ghost" onClick={onDiscard} disabled={busy}>Discard</Button><Button onClick={onSave} disabled={busy||!valid}>{busy?'Saving…':'Save preferences'}</Button></div>
 </div>:<p className="preferences-saved"><Icon name="check-circle-linear" size={16}/>Preferences saved</p>;
}
