/* Persistent, bounded library accordion layout. Included before legacy runtime. */
const LIBRARY_SECTION_IDS=['catalog','collection','backup','folder','online','quick'];
export function librarySectionLayoutNormalize(value,{strict=false}={}){
 const fallback=()=>({order:[...LIBRARY_SECTION_IDS],collapsed:Object.create(null)});
 if(value===undefined||value===null)return fallback();
 if(typeof value!=='object'||Array.isArray(value)||!value){
  if(strict)throw Error('Некорректная компоновка библиотеки');
  return fallback();
 }
 const rawOrder=value.order,rawCollapsed=value.collapsed;
 const expected=LIBRARY_SECTION_IDS;
 // Accept the previous saved FIVE-panel order as-is and append Quick
 // Actions without disturbing the user's customized sequence. Valid for
 // strict JSON backups as well as existing localStorage settings.
 const oldIds=expected.filter(id=>id!=='quick');
 const validOldOrder=Array.isArray(rawOrder)&&rawOrder.length===oldIds.length&&
  rawOrder.every(x=>typeof x==='string'&&oldIds.includes(x))&&
  new Set(rawOrder).size===oldIds.length;
 const validNewOrder=Array.isArray(rawOrder)&&rawOrder.length===expected.length&&
  rawOrder.every(x=>typeof x==='string'&&expected.includes(x))&&
  new Set(rawOrder).size===expected.length;
 const validOrder=validNewOrder||validOldOrder;
 const validCollapsed=rawCollapsed&&typeof rawCollapsed==='object'&&!Array.isArray(rawCollapsed)&&
  Object.keys(rawCollapsed).length<=expected.length&&
  Object.entries(rawCollapsed).every(([k,v])=>expected.includes(k)&&typeof v==='boolean');
 if(strict&&(!validOrder||!validCollapsed||Object.keys(value).some(k=>!['order','collapsed'].includes(k))))
  throw Error('Некорректная компоновка библиотеки');
 const result=fallback();
 if(validOrder)result.order=validOldOrder?[...rawOrder,'quick']:rawOrder.slice();
 if(validCollapsed)for(const [key,v] of Object.entries(rawCollapsed))result.collapsed[key]=v;
 return result;
}
