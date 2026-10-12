import test from 'node:test';
import assert from 'node:assert/strict';
import {librarySectionLayoutNormalize} from '../src/core/library-section-layout.mjs';

const ids=['catalog','collection','backup','folder','online'];
test('Library UX: default five section order and open states are deterministic',()=>{
 const a=librarySectionLayoutNormalize();
 assert.deepEqual(a.order,ids);
 assert.deepEqual(Object.keys(a.collapsed),[]);
 assert.notEqual(a.order,librarySectionLayoutNormalize().order);
});
test('Library UX: preserve changed order and independently collapsed headings',()=>{
 const input={order:['backup','folder','catalog','online','collection'],
  collapsed:{catalog:true,folder:false,backup:true}};
 const normalized=librarySectionLayoutNormalize(input,{strict:true});
 assert.deepEqual(normalized.order,input.order);
 assert.equal(normalized.collapsed.catalog,true);
 assert.equal(normalized.collapsed.folder,false);
 assert.notEqual(normalized.order,input.order);
 assert.deepEqual(JSON.parse(JSON.stringify(normalized)),input);
});
test('Library UX: strict restore rejects unknown sections, duplicate and oversized layouts',()=>{
 for(const v of [
  {order:['catalog','catalog','backup','folder','online'],collapsed:{}},
  {order:[...ids,'secret'],collapsed:{}},
  {order:ids,collapsed:{inject:true}},
  {order:ids,collapsed:{backup:'true'}},
  {order:ids,collapsed:{},script:'alert(1)'},
  {order:ids,collapsed:JSON.parse('{"__proto__":true}')}
 ])assert.throws(()=>librarySectionLayoutNormalize(v,{strict:true}),/Некорректная/);
});
test('Library UX: legacy localStorage layout corruption returns a safe default',()=>{
 const dirty={order:['collection','collection'],collapsed:{online:'invalid'}};
 assert.deepEqual(librarySectionLayoutNormalize(dirty).order,ids);
 assert.equal(Object.keys(librarySectionLayoutNormalize(dirty).collapsed).length,0);
 assert.deepEqual(librarySectionLayoutNormalize('garbage').order,ids);
});
