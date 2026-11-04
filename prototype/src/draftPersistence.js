// Serialize writes so a slow autosave cannot overwrite a newer draft.
export function createDraftWriter(save){
 let last=Promise.resolve();
 return draft=>{const snapshot=structuredClone(draft);const next=last.catch(()=>{}).then(()=>save(snapshot));last=next;return next;};
}
