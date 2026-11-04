import React from 'react';
import {PollTaking} from './PollTaking.jsx';
export function DiscoveryFeed({polls,onOpen,onSave,onInterests,onRefresh,notify,busy,setBusy,preferences,onManage,onWallet}) {
 return <><div className="poll-grid">{polls.map(poll=><div className="poll-grid-item" key={poll.id}><PollTaking poll={poll} compact onOpen={onOpen} onSave={()=>onSave(poll)} onRefresh={onRefresh} notify={notify} busy={busy} setBusy={setBusy} preferences={preferences} onManage={()=>onManage(poll)} onWallet={onWallet}/></div>)}</div><div className="feed-end"><button onClick={onInterests}>Tune your interests</button></div></>;
}
