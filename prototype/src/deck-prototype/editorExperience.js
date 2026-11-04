// Validation stays next to the field and is also enforced by the server.
export function clearEditorError(input){
 if(!input?.hasAttribute('aria-invalid'))return;
 input.removeAttribute('aria-invalid');
 const id=input.id+'-error';document.getElementById(id)?.remove();
 const described=(input.getAttribute('aria-describedby')||'').split(' ').filter(x=>x&&x!==id);
 if(described.length)input.setAttribute('aria-describedby',described.join(' '));else input.removeAttribute('aria-describedby');
}
export function validateEditorFields(draft){
 const errors=[];
 if(draft.title.trim().length<8)errors.push(['#editor-title','Write a question with at least 8 characters.']);
 draft.options.forEach((option,i)=>{if(!option.trim())errors.push(['#editor-option-'+i,'Add a label for this option.']);});
 document.querySelectorAll('#editor-form [aria-invalid=true]').forEach(clearEditorError);
 for(const [selector,text] of errors){
  const input=document.querySelector(selector);if(!input)continue;
  const error=document.createElement('p');error.id=input.id+'-error';error.className='field-error';error.textContent=text;
  input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',[input.getAttribute('aria-describedby'),error.id].filter(Boolean).join(' '));
  const row=input.closest('.option-input');if(row)row.append(error);else input.insertAdjacentElement('afterend',error);
 }
 if(errors.length){const first=document.querySelector(errors[0][0]);first?.focus({preventScroll:true});first?.scrollIntoView?.({block:'center',behavior:'instant'});return false;}
 return true;
}
