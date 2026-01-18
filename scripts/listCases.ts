/**
 * 列出資料庫中的案例
 */

import { getDb } from '../server/db';
import { cases } from '../drizzle/schema';

async function main() {
  const db = await getDb();
  if (!db) {
    console.error('無法連接資料庫');
    process.exit(1);
  }
  
  const result = await db.select().from(cases).limit(30);
  console.log('資料庫中的案例:');
  console.log('='.repeat(80));
  for (const c of result) {
    console.log(`ID: ${c.id}`);
    console.log(`姓名: ${c.maskedName}`);
    console.log(`來源: ${c.sourceType}`);
    console.log(`描述: ${c.description?.substring(0, 60)}`);
    console.log('-'.repeat(40));
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
