/**
 * FG-04A: read-only offline assessment of a third-party MusicXML fingering
 * candidate against the CURRENT original source, not a learner hint engine.
 *
 * Compatibility requires semantic equivalence of the entire XML document
 * except for <fingering> annotations and now-empty wrapper nodes.
 * A matching note count/pitch ALONE is deliberately insufficient.
 * No network calls, persistent edits, external code, or automatic acceptance.
 */
export function externalFingeringStructuralKey(xml,{parse}={}){
 if(typeof xml!=='string'||xml.length>15e6||/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)||
  typeof parse!=='function')throw Error('Unsupported or unsafe MusicXML');
 const dom=parse(xml);
 if(!dom?.documentElement||dom.documentElement.localName!=='score-partwise'||
  dom.getElementsByTagName('parsererror').length)throw Error('Invalid score-partwise MusicXML');
 let visited=0;
 function nodeValue(node){
  if(++visited>150000)throw Error('MusicXML exceeds safe structural comparison limit');
  if(node.nodeType===3||node.nodeType===4){
   const value=node.nodeValue||'';
   return value.trim()?['text',value.trim().replace(/\s+/g,' ')]:null;
  }
  if(node.nodeType!==1)return null;
  if(node.localName==='fingering')return null;
  const attrs=[...node.attributes].map(a=>[a.namespaceURI||'',a.localName,a.value])
   .filter(a=>a[1]!=='xmlns'&&a[0]!=='http://www.w3.org/2000/xmlns/')
   .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const children=[...node.childNodes].map(nodeValue).filter(x=>x!==null);
  // A generator may need new technical/notations wrapper elements to insert
  // a fingering. Remove ONLY empty wrappers with NO other metadata.
  if(['technical','notations'].includes(node.localName)&&!attrs.length&&!children.length)
   return null;
  return [node.namespaceURI||'',node.localName,attrs,children];
 }
 return JSON.stringify(nodeValue(dom.documentElement));
}
const flatten=song=>(song?.tracks||[]).flatMap(t=>t.notes||[]);
const validFinger=n=>n?.fingeringSource==='musicxml'&&Number.isInteger(n.finger)&&n.finger>=1&&n.finger<=5?n.finger:null;
const sortIds=n=>[n.noteId,...(n.sourceNoteIds||[])].join('|');
export function externalFingeringCompare(source,candidate,{parse,engine='external'}={}){
 const fail=reason=>({status:'rejected',reason,engine,summary:null,notes:[]});
 if(!['MasterPiano','PianoPlayer','PineappleMusicLab','other'].includes(engine))
  return fail('Unsupported engine label');
 if(source?.format!=='MusicXML'||candidate?.format!=='MusicXML'||
  typeof source.notationXML!=='string'||typeof candidate.notationXML!=='string')
  return fail('Original and candidate must both be imported MusicXML');
 let sourceKey,candidateKey;
 try{
  sourceKey=externalFingeringStructuralKey(source.notationXML,{parse});
  candidateKey=externalFingeringStructuralKey(candidate.notationXML,{parse});
 }catch(err){return fail(err?.message||'XML comparison failed')}
 if(sourceKey!==candidateKey)
  return fail('Score XML differs outside fingering annotations (notes, timing, voices or metadata)');
 const original=flatten(source),proposed=flatten(candidate);
 if(!original.length||original.length!==proposed.length||original.length>25000)
  return fail('Source/candidate playable note count differs');
 const originalMap=new Map(),proposedMap=new Map();
 for(const n of original){
  if(!n.noteId||originalMap.has(n.noteId))return fail('Duplicate or absent source note identity');
  originalMap.set(n.noteId,n);
 }
 for(const n of proposed){
  if(!n.noteId||proposedMap.has(n.noteId))return fail('Duplicate or absent candidate note identity');
  proposedMap.set(n.noteId,n);
 }
 const details=[],summary={
  total:original.length,author:0,generated:0,preserved:0,conflicts:0,
  removedAuthor:0,missing:0,handUnknown:0,withProposals:0
 };
 for(const n of original){
  const c=proposedMap.get(n.noteId);
  if(!c||c.pitch!==n.pitch||c.partId!==n.partId||
   c.staff!==n.staff||c.voice!==n.voice||
   Math.abs(c.start-n.start)>0.00001||Math.abs(c.duration-n.duration)>0.00001||
   sortIds(c)!==sortIds(n))
   return fail('Source note ID, pitch, voice, staff, onset, duration or tied segments differ');
  const author=validFinger(n),suggestion=validFinger(c);
  if(author!==null)summary.author++;
  let classification;
  if(author!==null&&suggestion===author){summary.preserved++;classification='preserved'}
  else if(author!==null&&suggestion===null){summary.removedAuthor++;classification='removed-author'}
  else if(author!==null){summary.conflicts++;classification='conflict'}
  else if(suggestion!==null){summary.generated++;classification='generated'}
  else{summary.missing++;classification='missing'}
  if(suggestion!==null){
   summary.withProposals++;
   if(c.hand!=='RH'&&c.hand!=='LH')summary.handUnknown++;
  }
  details.push({id:n.noteId,pitch:n.pitch,start:n.start,part:n.partId,
   voice:n.voice,staff:n.staff,authorFinger:author,candidateFinger:suggestion,
   candidateHand:suggestion!==null?(c.hand||null):null,classification});
 }
 // External algorithms are suggestions, NEVER annotations by the composer.
 // Conflicts require manual review and are never automatically adopted.
 const conflict=summary.conflicts+summary.removedAuthor>0;
 return {status:conflict?'conflicts':'compatible',reason:conflict?
  'Some authoritative finger numbers were changed or removed':null,
  engine,summary,notes:details};
}
