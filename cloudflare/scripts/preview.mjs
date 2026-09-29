import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { localDatabase } from './local-db.mjs';
import worker from '../src/worker.mjs';

const db = localDatabase(fileURLToPath(new URL('../audit-data/pilot.sqlite', import.meta.url)));
const types = { '/': ['index.html','text/html; charset=utf-8'], '/app.js': ['app.js','text/javascript; charset=utf-8'], '/style.css': ['style.css','text/css; charset=utf-8'] };
const env = { DB: db, ASSETS: { async fetch(request) {
  const entry = types[new URL(request.url).pathname];
  if (!entry) return new Response('Not found', { status: 404 });
  return new Response(await readFile(new URL('../public/' + entry[0], import.meta.url)), { headers: { 'Content-Type': entry[1] } });
} } };
http.createServer(async (req, res) => {
  try {
    const response = await worker.fetch(new Request('http://127.0.0.1:8788' + req.url, { method: req.method }), env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('Preview error'); }
}).listen(8788, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:8788'));
