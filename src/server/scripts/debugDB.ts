// src/server/scripts/debugDB.ts
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { like, desc } from 'drizzle-orm';

async function debug() {
  console.log("🕵️‍♂️ [偵探模式] 開始檢查資料庫...");

  // 1. 檢查是否有「黃子佼」相關資料
  const results = await db.select().from(cases).where(like(cases.name, '%黃子佼%'));
  console.log(`\n🔍 搜尋「黃子佼」結果：共 ${results.length} 筆`);
  results.forEach(r => {
      console.log(`   - [${r.sourceType}] ${r.name} (${r.caseDate})`);
  });

  // 2. 檢查同步紀錄 (為什麼顯示尚未同步？)
  const logs = await db.select().from(dataSyncLogs).orderBy(desc(dataSyncLogs.completedAt)).limit(3);
  console.log(`\n🕒 最近 3 筆同步紀錄：`);
  logs.forEach(l => {
      console.log(`   - ${l.sourceName}: ${l.status} at ${l.completedAt}`);
  });

  process.exit(0);
}

debug();