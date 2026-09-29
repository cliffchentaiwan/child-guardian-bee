import { SOURCES, normalizeText } from './sources.mjs';
import { syncSource, pruneSnapshots } from './sync.mjs';

const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const DISCLAIMER = '本測試版僅查詢機構名錄，尚未接入裁罰、判決或個人紀錄。名錄登載不代表安全認證，未查到也不代表未立案或安全。';

export async function sourceStatus(db) {
  const { results } = await db.prepare('SELECT id,last_success,last_attempt,status,record_count,source_period FROM sources').all();
  return SOURCES.map(source => {
    const state = results.find(r => r.id === source.id);
    return { id: source.id, name: source.name, page: source.page, coverage: source.coverage,
      frequency: source.frequency, ...(state ?? { status: 'pending', record_count: 0, last_success: null }),
      stale: !state?.last_success || Date.now() - Date.parse(state.last_success) > 3 * 86400000 };
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    try {
      if (url.pathname === '/api/status') {
        const sources = await sourceStatus(env.DB);
        return json({ status: sources.every(s => s.status === 'ok' && !s.stale) ? 'ok' : 'degraded', sources, disclaimer: DISCLAIMER });
      }
      if (url.pathname !== '/api/search') return json({ error: 'not_found' }, 404);
      const q = normalizeText(url.searchParams.get('q'));
      const city = normalizeText(url.searchParams.get('city'));
      const kind = url.searchParams.get('kind') ?? '';
      const offset = Number(url.searchParams.get('offset') ?? 0);
      if (q.length < 2 || q.length > 80 || city.length > 12 || !['','幼兒園','補習班'].includes(kind) || !Number.isInteger(offset) || offset < 0 || offset > 1000) return json({ error: 'invalid_input', message: '請輸入 2～80 個字的機構名稱。' }, 400);
      const sources = await sourceStatus(env.DB);
      if (!sources.some(s => s.last_success)) return json({ error: 'data_not_ready', message: '資料尚未準備完成，請稍後再試。', sources }, 503);
      const pattern = '%' + q.replace(/[\\%_]/g, ch => '\\' + ch) + '%';
      const { results } = await env.DB.prepare("SELECT source_id,name,category,city,district,address,period FROM published_organizations WHERE search_name LIKE ? ESCAPE '\\' AND (?='' OR city=?) AND (?='' OR category=?) ORDER BY name,source_id,source_key LIMIT 21 OFFSET ?")
        .bind(pattern, city, city, kind, kind, offset).all();
      return json({ results: results.slice(0,20).map(r => ({ ...r, sourceUrl: SOURCES.find(s => s.id === r.source_id).page })), hasMore: results.length > 20, sources, disclaimer: DISCLAIMER });
    } catch {
      console.error('directory_read_failed');
      return json({ error: 'temporarily_unavailable', message: '目前無法查詢資料，請稍後重試；這不表示沒有紀錄。' }, 503);
    }
  },
  async scheduled(event, env, ctx) {
    if (env.SYNC_ENABLED !== 'true') return;
    ctx.waitUntil((async () => {
      const results = [];
      for (const source of SOURCES) results.push(await syncSource(env.DB, source));
      console.log(JSON.stringify({ event: 'directory_sync', results }));
      await pruneSnapshots(env.DB);
      if (results.some(result => result.status === 'failed')) throw new Error('directory_sync_failed');
    })());
  },
};
