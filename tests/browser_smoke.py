"""Optional integration smoke: python tests/browser_smoke.py (requires playwright + Chromium)."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright
import subprocess, os, time, urllib.request, struct

ROOT=Path(__file__).resolve().parents[1]
PORT=4179
SCORE='''<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Test Score</work-title></work><movement-title>Test Score</movement-title><identification><creator type="composer">Bach</creator></identification><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note><note><rest/><duration>480</duration><type>quarter</type></note><note><pitch><step>E</step><octave>4</octave></pitch><duration>960</duration><type>half</type></note></measure></part></score-partwise>'''
OSMD_MOCK='''window.opensheetmusicdisplay={OpenSheetMusicDisplay:class { constructor(el,opt){this.el=el;this.Zoom=1;const t={i:0};this.cursor={get iterator(){return {get EndReached(){return t.i>=6},get CurrentSourceTimestamp(){return {RealValue:t.i*.25}}}},get cursorElement(){return el.querySelector('svg')},reset(){t.i=0},next(){t.i++},show(){}};} async load(xml){const d=new DOMParser().parseFromString(xml,'application/xml');if(d.querySelector('parsererror'))throw Error('Bad XML');this.xml=xml;} render(){this.el.innerHTML='<svg viewBox="0 0 800 250"><rect width="800" height="250" fill="white"/></svg>';}}};'''
rows=['composer,title,folder,xml_score,midi_score,midi_performance,performance_annotations,midi_score_annotations,maestro_midi_performance,maestro_audio_performance,start,end,audio_performance']
for i in range(75):
 folder=f'Bach/Piano_Test/{i}'
 rows.extend([f'Bach,Etude_{i},{folder},{folder}/xml_score.musicxml,{folder}/midi_score.mid,{folder}/Perf_1.mid,,,,,,,',f'Bach,Etude_{i},{folder},{folder}/xml_score.musicxml,{folder}/midi_score.mid,{folder}/Perf_2.mid,,,,,,,'])
MD='\n'.join(rows)
midievents=b'\x00\xff\x51\x03\x07\xa1\x20\x00\x90\x3c\x64\x83\x60\x80\x3c\x00\x00\x90\x40\x64\x83\x60\x80\x40\x00\x00\xff\x2f\x00'
MIDI=b'MThd'+struct.pack('>IHHH',6,0,1,480)+b'MTrk'+struct.pack('>I',len(midievents))+midievents

server=subprocess.Popen(['node','scripts/dev-server.mjs'], cwd=ROOT,env={**os.environ,'PORT':str(PORT)},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
  for _ in range(45):
    try:
      with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/',timeout=.5) as response:
        assert response.status==200
        break
    except Exception: time.sleep(.1)
  else: raise AssertionError('Dev server did not start')
  with sync_playwright() as play:
    browser=play.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1366,'height':900},permissions=['midi'])
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.route('**/opensheetmusicdisplay.min.js',lambda route:route.fulfill(status=200,body=OSMD_MOCK,content_type='application/javascript'))
    page.route('**/asap-dataset/**/metadata.csv',lambda route:route.fulfill(status=200,body=MD,headers={'access-control-allow-origin':'*','content-type':'text/csv'}))
    page.route('**/asap-dataset/**.musicxml',lambda route:route.fulfill(status=200,body=SCORE.encode(),headers={'access-control-allow-origin':'*','content-type':'application/xml'}))
    page.route('**/asap-dataset/**.mid',lambda route:route.fulfill(status=200,body=MIDI,headers={'access-control-allow-origin':'*','content-type':'audio/midi'}))
    # This CI environment blocks *all* browser navigation by policy (ERR_BLOCKED_BY_ADMINISTRATOR).
    # Verify HTTP serving with urllib, then inject the exact built CSS+JS into a Playwright DOM.
    for file,ctype in [('/','text/html'),('/assets/app.js','text/javascript'),('/assets/app.css','text/css')]:
      with urllib.request.urlopen(f'http://127.0.0.1:{PORT}{file}',timeout=3) as response:
        assert response.status==200 and ctype in response.headers.get('content-type','')
    markup=(ROOT/'dist/index.html').read_text('utf-8')
    markup=markup.replace('<link rel="stylesheet" href="./assets/app.css">','').replace('<script defer src="./assets/app.js"></script>','')
    page.set_content(markup,wait_until='domcontentloaded')
    page.add_style_tag(content=(ROOT/'dist/assets/app.css').read_text('utf-8'))
    page.add_script_tag(content=(ROOT/'dist/assets/app.js').read_text('utf-8'))
    page.wait_for_timeout(350)
    print('Loaded version',page.evaluate('window.__playAlongVersion'),page.title())
    assert page.evaluate('window.__playAlongVersion')=='0.10.0'
    assert page.is_visible('#rollWrap')
    assert page.locator('#songName').inner_text().strip()
    page.click('#playBtn');page.wait_for_timeout(150)
    assert page.evaluate('window.__prototypeTest.isPlaying')
    page.click('#playBtn')
    assert not page.evaluate('window.__prototypeTest.isPlaying')
    page.click('#viewSheet');page.wait_for_timeout(450)
    assert page.evaluate('window.__scoreTest.scoreLoaded')
    assert page.locator('#sheetCanvas svg').count()==1
    page.click('#viewRoll')
    assert page.is_visible('#rollWrap')
    note_count=page.evaluate('(xml)=>window.__libraryV08.readMusicXML(xml,"smoke.musicxml").tracks.reduce((n,t)=>n+t.notes.length,0)',SCORE)
    assert note_count==2,note_count
    page.select_option('#librarySourceSelect','asap');page.click('#asapSync');page.wait_for_timeout(450)
    assert page.evaluate('(md)=>window.__asapCatalog.asapParseMetadata(md).length',MD)==75
    print('ASAP entries',page.evaluate('window.__asapCatalog.entries.length'),'status',page.locator('#asapProgress').inner_text()); assert page.evaluate('window.__asapCatalog.entries.length')==81
    page.locator('#librarySearch').fill('Etude 2')
    page.wait_for_timeout(120)
    page.locator('#songList .libv8-main').first.click()
    page.wait_for_timeout(350)
    assert 'Etude 2' in page.locator('#songName').inner_text()
    print('Browser smoke: playback, OSMD bridge, XML parsing, ASAP integration — OK')
    print('JS page errors:',errors)
    assert not errors,errors
    browser.close()
finally:
    server.terminate()
    try: server.wait(timeout=3)
    except subprocess.TimeoutExpired: server.kill()
