import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validatePianoMotionStaging as validate}
 from '../scripts/stage-pianomotion-runtime.mjs';

const sha=s=>createHash('sha256').update(s).digest('hex');
const files=Object.fromEntries([
 '__init__','api','figures','fingering','hand_split','hands','identity',
 'midi_loader','pianist','progress'
].map(name=>['handthesia_core/'+name+'.py',sha(name)]));
const original=()=>{
 const sorted=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0));
 const core={schemaVersion:1,engineVersion:sha(JSON.stringify({files:sorted})),files:sorted};
 const names=['pyodide.mjs','pyodide.asm.mjs','pyodide.asm.wasm',
  'python_stdlib.zip','pyodide-lock.json'];
 const runtime={schemaVersion:1,
  runtime:{version:'314.0.7',pythonVersion:'3.14.2'},
  files:names.map(file=>({path:'pyodide/'+file,sizeBytes:10,sha256:sha(file)})),
  purePythonWheels:['pretty-midi','mido','importlib-resources'].map((name,i)=>({
   name,file:'wheel-'+i+'.whl',sha256:sha(name)
  }))};
 for(const w of runtime.purePythonWheels)
  runtime.files.push({path:'pyodide/wheels/'+w.file,sha256:w.sha256,sizeBytes:10});
 return {core,runtime};
};
test('FG-04C7 original PianoMotion SHA manifest rejects no verified components',()=>{
 const {core,runtime}=original(),r=validate(core,runtime);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.engineVersion,core.engineVersion);
 assert.equal(r.entries.length,10);
 assert.equal(r.wheels.length,3);
});
test('FG-04C7 rejects altered original PianoMotion fingering core hash',()=>{
 const {core,runtime}=original();
 core.files['handthesia_core/fingering.py']=sha('attacker');
 assert.equal(validate(core,runtime).reason,'CORE_ENGINE_VERSION_MISMATCH');
});
test('FG-04C7 cannot import Python source with path traversal or unpinned hash',()=>{
 const {core,runtime}=original();
 core.files['../../handthesia_core/api.py']=sha('bad');
 assert.equal(validate(core,runtime).reason,'UNSAFE_OR_UNHASHED_CORE_FILE');
});
test('FG-04C7 runtime ABI/version and Pyodide base must be pinned',()=>{
 const {core,runtime}=original();runtime.runtime.version='0.28.3';
 assert.equal(validate(core,runtime).reason,'UNSUPPORTED_PYODIDE_RUNTIME');
 const o=original();o.runtime.files=o.runtime.files.filter(f=>f.path!=='pyodide/pyodide.asm.wasm');
 assert.equal(validate(o.core,o.runtime).reason,'RUNTIME_BOOT_FILE_MISSING');
});
test('FG-04C7 every extra wheel/asset requires independently verified SHA',()=>{
 const {core,runtime}=original();
 runtime.files.push({path:'pyodide/wheels/../../evil',sha256:sha('x'),sizeBytes:2});
 assert.equal(validate(core,runtime).reason,'INVALID_RUNTIME_FILE');
 const o=original();o.runtime.purePythonWheels[0].sha256=sha('different');
 assert.equal(validate(o.core,o.runtime).reason,'PYTHON_WHEEL_PIN_MISMATCH');
});
test('FG-04C7 no incomplete optional Python dependencies',()=>{
 const {core,runtime}=original();
 runtime.purePythonWheels=runtime.purePythonWheels.slice(0,2);
 assert.equal(validate(core,runtime).reason,'REQUIRED_PYTHON_WHEELS_MISSING');
});
