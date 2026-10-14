/** Browser-backed MusicXML score intake (no fake parser, no expert labels). */
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,stat}from 'node:fs/promises';
import {tmpdir}from 'node:os';
import {join}from 'node:path';
import {createHash}from 'node:crypto';
import {importP0A2bMusicXML}from '../scripts/p0a2b-import-musicxml.mjs';
const xml=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN"
"http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0"><work><work-title>Test source</work-title></work>
<part-list>
 <score-part id="P1"><part-name>Right Hand</part-name></score-part>
 <score-part id="P2"><part-name>Left Hand</part-name></score-part>
</part-list>
<part id="P1"><measure number="1">
 <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
 <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type>
   <notations><technical><fingering>1</fingering></technical></notations></note>
 <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note>
 <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note>
</measure></part>
<part id="P2"><measure number="1">
 <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time>
   <clef><sign>F</sign><line>4</line></clef></attributes>
 <note><pitch><step>C</step><octave>3</octave></pitch><duration>960</duration><type>half</type></note>
</measure></part></score-partwise>`;
const config={cohortId:'mit-research-candidate',groupId:'composer-candidate',
 split:'development',rightsConfirmed:true};
const dir=await mkdtemp(join(tmpdir(),'p0a2b-real-import-'));
try{
 const file=join(dir,'source.musicxml'),output=join(dir,'blind.json');
 await writeFile(file,xml,'utf8');
 const rejected=await importP0A2bMusicXML({file,output,...config,rightsConfirmed:false});
 assert.equal(rejected.reason,'SOURCE_AND_RIGHTS_REQUIRED');
 const r=await importP0A2bMusicXML({file,output,...config});
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.status,'PRIVATE_CANDIDATE_PACKED');
 assert.equal(r.stats.notes,4);
 assert.ok(r.stats.chordNotes>=2);
 assert.ok(r.stats.heldVoiceNotes>=1);
 assert.equal(r.scoreSha256,createHash('sha256').update(xml).digest('hex'));
 const packet=JSON.parse(await readFile(output,'utf8'));
 assert.equal(packet.schema,'p0a2b-blind-packet-v1');
 assert.equal(packet.notes.length,4);
 assert.equal(packet.handMode,'blind-hands');
 assert.equal(packet.notes.every(n=>n.hand===undefined&&n.finger===undefined),true);
 assert.equal(packet.scoreSha256,r.scoreSha256);
 if(process.platform!=='win32')assert.equal((await stat(output)).mode&0o777,0o600);
 assert.equal((await importP0A2bMusicXML({file,output,...config})).reason,
  'BLIND_PACKET_EXISTS_OR_UNWRITABLE');
 const unsafe=join(dir,'unsafe.musicxml'),badOutput=join(dir,'unsafe-packet.json');
 await writeFile(unsafe,xml.replace(
  /<!DOCTYPE[\s\S]*?>/,
  '<!DOCTYPE score-partwise [ <!ENTITY inject "bad"> ]>'));
 assert.equal((await importP0A2bMusicXML({
  file:unsafe,output:badOutput,...config
 })).reason,'XML_EXTERNAL_ENTITIES_REFUSED');
 console.log('P0-A2b REAL MusicXML parser: 4-note score, fingerprinted source, stripped author fingering, private blind review candidate PASS');
}finally{await rm(dir,{recursive:true,force:true})}
