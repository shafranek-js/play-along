import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.mxl':'application/vnd.recordare.musicxml','.mid':'audio/midi','.musicxml':'application/vnd.recordare.musicxml+xml'};
http.createServer((req,res)=>{
  let requested;
  try { requested = decodeURIComponent(new URL(req.url || '/', `http://${host}:${port}`).pathname); }
  catch {res.writeHead(400);res.end('Bad request');return;}
  const filename = path.resolve(root, '.'+requested, requested.endsWith('/') ? 'index.html' : '');
  if (!(filename===root || filename.startsWith(root+path.sep))) {res.writeHead(403);res.end('Forbidden');return;}
  fs.stat(filename,(err,st)=>{
    if(err||!st.isFile()) {res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    fs.createReadStream(filename).pipe(res);
  });
}).listen(port,host,()=>console.log(`Play Along available at http://${host}:${port}/`));
