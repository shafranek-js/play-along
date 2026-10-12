import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const f=path.resolve(dist,'.'+(pathname==='/'?'/index.html':pathname));
 if(!f.startsWith(dist+path.sep)||!fs.existsSync(f)){res.writeHead(404);res.end('not found');return}
 res.setHeader('content-type',mime[path.extname(f)]||'application/octet-stream');
 res.end(fs.readFileSync(f));
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
let browser;
try{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__prototypeTest&&
  document.querySelectorAll('#librarySections > [data-library-section]').length===5);
 await page.locator('[data-page="library"]').click();
 const order=()=>page.locator('#librarySections > [data-library-section]').evaluateAll(nodes=>nodes.map(n=>n.dataset.librarySection));
 const initial=['catalog','collection','backup','folder','online'];
 assert.deepEqual(await order(),initial);
 assert.equal(await page.locator('#librarySections [data-library-section="backup"] #backupExport').count(),1,
  'Backup is now a sibling, not nested inside My Collection');
 assert.equal(await page.locator('#librarySections [data-library-section="backup"] #backupImport').count(),1);
 assert.equal(await page.locator('#importMusicInput').count(),1);
 assert.equal(await page.locator('#museTrainerSync').count(),1);
 // Collapse a real section without deleting its inputs or inner listeners.
 await page.locator('#librarySectionToggle-catalog').click();
 assert.equal(await page.locator('#librarySectionToggle-catalog').getAttribute('aria-expanded'),'false');
 assert.equal(await page.locator('#songList').isHidden(),true);
 assert.equal(await page.locator('#librarySectionBody-catalog').getAttribute('hidden'),'');
 await page.locator('#librarySectionToggle-catalog').click();
 assert.equal(await page.locator('#songList').isVisible(),true);
 // Keyboard alternative to dragging works for assistive/touch devices.
 const backupGrip=page.locator('[data-library-section="backup"] .libraryDragHandle');
 await backupGrip.press('Alt+ArrowUp');await backupGrip.press('Alt+ArrowUp');
 assert.deepEqual(await order(),['backup','catalog','collection','folder','online']);
 // Native desktop drag-and-drop reorders actual DOM nodes, not fake CSS.
 await page.locator('[data-library-section="online"] .libraryDragHandle')
  .dragTo(page.locator('[data-library-section="folder"] .librarySectionHeader'),
   {targetPosition:{x:80,y:2}});
 assert.deepEqual(await order(),['backup','catalog','collection','online','folder']);
 // Save a closed section and preserve the order through full reload.
 await page.locator('#librarySectionToggle-backup').click();
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('playalong:smart-practice:v07')).librarySections);
 assert.deepEqual(stored.order,['backup','catalog','collection','online','folder']);
 assert.equal(stored.collapsed.backup,true);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelectorAll('#librarySections > [data-library-section]').length===5);
 assert.deepEqual(await order(),stored.order);
 assert.equal(await page.locator('#librarySectionToggle-backup').getAttribute('aria-expanded'),'false');
 assert.equal(await page.locator('#backupExport').count(),1);
 // Source/content navigation remains accessible under moved sections.
 await page.locator('#librarySectionToggle-backup').click();
 await page.locator('#librarySourceSelect').selectOption('demo');
 await page.locator('#libraryFingeringSelect').selectOption('all');
 assert.ok((await page.locator('#songList .libv8-row').count())>0,'Existing library filter still works');
 // Narrow screens retain working up/down controls and no section disappears.
 await page.setViewportSize({width:390,height:844});
 const online=page.locator('[data-library-section="online"]');
 await online.locator('.libraryMoveDown').click();
 assert.deepEqual(await order(),['backup','catalog','collection','folder','online']);
 assert.equal(await page.locator('#librarySections > [data-library-section]').count(),5);
 assert.equal(await page.locator('#backupFile').count(),1);
 assert.equal(await page.locator('#folderFallback').count(),1);
 assert.deepEqual(errors,[],'No runtime exceptions after drag, restore, accordion and mobile');
 console.log('LIBRARY ACCORDION: 5 collapse/reorder, native drag, keyboard/mobile buttons, persisted order + controls: PASS');
}finally{
 if(browser)await browser.close();
 await new Promise(ok=>server.close(ok));
}
