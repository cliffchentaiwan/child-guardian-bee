import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, normalizeSource, fetchSource } from '../src/sources.mjs';
import { syncSource } from '../src/sync.mjs';
import worker from '../src/worker.mjs';
import { localDatabase } from './local-db.mjs';

const folder = new URL('../audit-data/', import.meta.url);
await mkdir(folder, { recursive: true });
const db = localDatabase(fileURLToPath(new URL('pilot.sqlite', folder)));
const input = process.argv[2];
const report = { checkedAt: new Date().toISOString(), scope: 'directory pilot, no adverse records', sources: [], searches: [] };
for (const [index, source] of SOURCES.entries()) {
  const started = performance.now();
  const loader = async () => input
    ? normalizeSource(source, JSON.parse((await readFile(resolve(input, index === 0 ? 'preschools.json' : 'cram-taipei.json'), 'utf8')).replace(/^\uFEFF/, '')))
    : fetchSource(source);
  const result = await syncSource(db, source, loader);
  report.sources.push({ ...result, milliseconds: Math.round(performance.now() - started), page: source.page });
}
for (const q of ['幼兒園', '補習班', '學霖', '台北', '臺北', '不存在的測試機構xyz']) {
  const response = await worker.fetch(new Request('https://local.test/api/search?q=' + encodeURIComponent(q)), { DB: db });
  const data = await response.json();
  report.searches.push({ q, status: response.status, returned: data.results?.length, hasMore: data.hasMore });
}
await writeFile(new URL('report.json', folder), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
db.sqlite.close();
if (report.sources.some(s => s.status !== 'success')) process.exitCode = 1;
