export const SOURCES = [
  {
    id: 'moe-preschools', name: '教育部幼兒園名錄', category: '幼兒園',
    coverage: '全臺，最新可取得學年度',
    url: 'https://stats.moe.gov.tw/files/opendata/k1_new.json',
    page: 'https://data.gov.tw/dataset/6086',
    frequency: '每學年度', minimum: 5000, maximum: 15000,
  },
  {
    id: 'moe-cram-taipei', name: '教育部立案短期補習班名錄（臺北市）', category: '補習班',
    coverage: '僅臺北市，其他縣市尚未接入',
    url: 'https://bsb.kh.edu.tw/afterschool/opendata/afterschool_json.jsp?city=20',
    page: 'https://data.gov.tw/dataset/16461',
    frequency: '每日', minimum: 1500, maximum: 6000,
  },
];

export const normalizeText = value => String(value ?? '').normalize('NFKC').trim().replace(/台/g, '臺');
const required = (row, key) => {
  if (typeof row[key] !== 'string' || !row[key].trim()) throw new Error('invalid_schema');
  return row[key].trim();
};

export function normalizeSource(source, payload) {
  if (!Array.isArray(payload) || !payload.length || payload.length > 150000) throw new Error('invalid_payload');
  let rows = payload;
  let period = null;
  if (source.id === 'moe-preschools') {
    if (rows.some(row => !/^\d{3}$/.test(row['學年度']))) throw new Error('invalid_year');
    period = String(rows.reduce((latest, row) => Math.max(latest, Number(row['學年度'])), 0));
    rows = rows.filter(row => row['學年度'] === period);
  }
  const result = new Map();
  for (const row of rows) {
    const preschool = source.id === 'moe-preschools';
    const name = required(row, preschool ? '學校名稱' : '短期補習班名稱');
    const code = required(row, preschool ? '代碼' : '主管機關文件單位代碼');
    const address = required(row, '地址').replace(/^\[\d+\]/, '');
    const city = normalizeText(required(row, preschool ? '縣市名稱' : '地區縣市').replace(/^\[\d+\]/, '').replace(/政府$/, ''));
    if (!preschool && city !== '臺北市') throw new Error('unexpected_city');
    // The cram-school feed contains repeated authority codes. Never join on code alone.
    const sourceKey = preschool ? code : JSON.stringify([code, normalizeText(name), normalizeText(address)]);
    const record = {
      sourceKey, name, searchName: normalizeText(name), category: source.category,
      city, district: preschool ? required(row, '鄉鎮市區名稱') : '', address, period,
    };
    if (result.has(sourceKey) && JSON.stringify(result.get(sourceKey)) !== JSON.stringify(record)) throw new Error('conflicting_identifier');
    result.set(sourceKey, record);
  }
  const records = [...result.values()];
  if (records.length < source.minimum || records.length > source.maximum) throw new Error('unexpected_count');
  return { records, period, inputCount: payload.length, duplicateRows: rows.length - records.length };
}

export async function fetchSource(source, fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetcher(source.url, { signal: AbortSignal.timeout(45000), headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('source_http_error');
      if (Number(response.headers.get('content-length')) > 30_000_000) throw new Error('source_too_large');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let total = 0, text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 30_000_000) { await reader.cancel(); throw new Error('source_too_large'); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return normalizeSource(source, JSON.parse(text.replace(/^\uFEFF/, '')));
    } catch (error) {
      if (attempt === 2) throw error;
      await sleep(1000 * (attempt + 1));
    }
  }
}
