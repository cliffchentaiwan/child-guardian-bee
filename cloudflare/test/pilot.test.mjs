import test from 'node:test';
import assert from 'node:assert/strict';
import { localDatabase } from '../scripts/local-db.mjs';
import { SOURCES, normalizeSource, fetchSource } from '../src/sources.mjs';
import { syncSource } from '../src/sync.mjs';
import worker from '../src/worker.mjs';

const source = { ...SOURCES[0], minimum: 1 };
const school = (code, year = '114', name = '臺北市測試幼兒園') => ({ 學年度: year, 代碼: code, 學校名稱: name, 縣市名稱: '[30]臺北市', 鄉鎮市區名稱: '中正區', 地址: '[100]臺北市中正區測試路1號' });
const loader = rows => async () => normalizeSource(source, rows);
const search = (db, q) => worker.fetch(new Request('https://test/api/search?q=' + encodeURIComponent(q)), { DB: db });

test('only latest school year is published; source year is preserved', () => {
  const result = normalizeSource(source, [school('A','113'), school('B')]);
  assert.equal(result.records.length, 1); assert.equal(result.records[0].sourceKey, 'B'); assert.equal(result.period, '114');
});
test('cram schools sharing a code remain separate by name and address', () => {
  const r = { 主管機關文件單位代碼: '1', 地區縣市: '臺北市政府', 短期補習班名稱: '甲補習班', 地址: '甲路1號' };
  const result = normalizeSource({ ...SOURCES[1], minimum: 1 }, [r, { ...r, 短期補習班名稱: '乙補習班', 地址: '乙路2號' }]);
  assert.equal(result.records.length, 2);
});
test('invalid schema and empty responses cannot publish', () => {
  assert.throws(() => normalizeSource(source, []));
  assert.throws(() => normalizeSource(source, [{ ...school('A'), 地址: '' }]));
});
test('failed fetch retries and succeeds on third attempt', async () => {
  let calls = 0;
  const result = await fetchSource(source, async () => { calls++; return new Response(calls < 3 ? 'unavailable' : JSON.stringify([school('A')]), { status: calls < 3 ? 503 : 200 }); }, async () => {});
  assert.equal(calls, 3); assert.equal(result.records.length, 1);
});
test('failed source and shrinking dataset leave last-good results searchable', async () => {
  const db = localDatabase();
  await syncSource(db, source, loader([school('A'),school('B')]));
  const before = db.sqlite.prepare('SELECT active_snapshot FROM sources').get().active_snapshot;
  assert.equal((await syncSource(db, source, loader([school('A')]))).error, 'suspicious_drop');
  await syncSource(db, source, async () => { throw new Error('network down'); });
  assert.equal(db.sqlite.prepare('SELECT active_snapshot FROM sources').get().active_snapshot, before);
  const response = await search(db, '台北');
  assert.equal(response.status, 200); assert.equal((await response.json()).results.length, 2);
  db.sqlite.close();
});
test('partially staged import is never exposed and is cleaned after failure', async () => {
  const db = localDatabase();
  await syncSource(db, source, loader([school('old')]));
  const original = db.batch.bind(db); let stages = 0;
  db.batch = async statements => { if (++stages === 2) throw new Error('simulated write failure'); return original(statements); };
  const result = await syncSource(db, source, loader(Array.from({length:51},(_,i)=>school('new'+i))));
  assert.equal(result.status, 'failed');
  assert.equal(db.sqlite.prepare('SELECT count(*) n FROM organizations').get().n, 1);
  assert.equal(db.sqlite.prepare('SELECT source_key FROM published_organizations').get().source_key, 'old');
  db.sqlite.close();
});
test('a stale concurrent run cannot overwrite a completed publication', async () => {
  const db = localDatabase();
  const outer = await syncSource(db, source, async () => {
    assert.equal((await syncSource(db, source, loader([school('new')]))).status, 'success');
    return normalizeSource(source,[school('old')]);
  });
  assert.equal(outer.error, 'superseded');
  assert.equal(db.sqlite.prepare('SELECT source_key FROM published_organizations').get().source_key, 'new');
  assert.equal(db.sqlite.prepare('SELECT status FROM sources').get().status, 'ok');
  db.sqlite.close();
});
test('database failure and not-yet-loaded data return 503, never clean search results', async () => {
  const failed = await search({ prepare() { throw new Error('offline'); } }, '測試');
  assert.equal(failed.status,503); assert.equal((await failed.json()).results,undefined);
  const db=localDatabase(); assert.equal((await search(db,'測試')).status,503); db.sqlite.close();
});
test('SQL wildcards and injection strings are literal search text', async () => {
  const db=localDatabase(); await syncSource(db,source,loader([school('A')]));
  for (const q of ['%%', "' OR 1=1 --"]) assert.equal((await (await search(db,q)).json()).results.length,0);
  assert.equal((await (await search(db,'臺北')).json()).results.length,1); db.sqlite.close();
});
test('older source year cannot replace newer data', async () => {
  const db=localDatabase(); await syncSource(db,source,loader([school('A')]));
  assert.equal((await syncSource(db,source,loader([school('A','113')]))).error,'period_regressed'); db.sqlite.close();
});
