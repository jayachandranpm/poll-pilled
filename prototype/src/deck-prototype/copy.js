// Default account filler is not a person's identity. Keep custom taglines.
export function personalTagline(value='') {
 const text=String(value||'').trim();
 return ['Here for a fresh perspective.','Small opinions. Better everyday things.'].includes(text)?'':text;
}

export const questionHint = type => ({
 classic:'Which option would you choose?',image:'Which design works better?',
 ab:'Which version works better?',audio:'Which version sounds better?',
 video:'Which clip would you watch?',slider:'How much does this matter to you?',
 ranking:'What should we prioritize?',pairwise:'Which would you pick?',
 allocation:'How would you split the budget?',regions:'Which part stands out?',
}[type]||'Ask your question');
