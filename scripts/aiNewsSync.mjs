/**
 * AI 增強版新聞同步腳本
 */

import { syncNewsWithAI } from '../server/aiNewsSync.js';
import { getDb } from '../server/db.js';
import { cases } from '../drizzle/schema.js';

async function main() {
  const db = await getDb();
  if (!db) {
    console.error('無法連接資料庫');
    process.exit(1);
  }
  
  console.log('開始 AI 增強版新聞同步...');
  
  const result = await syncNewsWithAI(
    async (data) => {
      await db.insert(cases).values({
        maskedName: data.maskedName,
        role: data.role,
        riskTags: JSON.stringify(data.riskTags),
        location: data.location,
        date: data.date,
        description: data.description,
        sourceType: data.sourceType,
        sourceLink: data.sourceLink,
        verified: data.verified,
      });
    },
    (current, total, message) => {
      console.log(`[${current}/${total}] ${message}`);
    }
  );
  
  console.log('同步結果:', result);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
