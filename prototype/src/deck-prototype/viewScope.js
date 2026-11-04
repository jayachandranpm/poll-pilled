// Scope UI callbacks to the screen/dialog that requested them. Server mutations
// may complete after dismissal, but they must not reopen or replace another view.
export function createViewScope(dialog){
 let version=0;
 const invalidate=()=>{version++;};
 for(const event of ['poll-navigation','popstate','pagehide'])window.addEventListener(event,invalidate);
 for(const event of ['close','poll-dialog-replace'])dialog.addEventListener(event,invalidate);
 return ()=>{const started=version;return ()=>started===version;};
}
