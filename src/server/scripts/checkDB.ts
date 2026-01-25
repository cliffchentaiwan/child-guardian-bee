// src/server/scripts/checkDB.ts
import 'dotenv/config';
import { db } from '../db';
import { cases, kindergartens } from '../schema';
import { sql } from 'drizzle-orm';

async function checkCounts() {
  console.log("📊 [資料庫庫存盤點] 啟動...\n");

  // 1. 檢查案件表 (包含 CRC 和 司法院)
  const caseStats = await db.select({
    sourceType: cases.sourceType,
    count: sql<number>`count(*)`
  })
  .from(cases)
  .groupBy(cases.sourceType);

  // 2. 檢查幼兒園表
  const kindergartenCount = await db.select({
    count: sql<number>`count(*)`
  }).from(kindergartens);

  console.log("==========================================");
  
  // 顯示案件類統計
  let hasCRC = false;
  caseStats.forEach(stat => {
    let name = stat.sourceType;
    if (name === 'judicial') name = '⚖️ 司法院判決書';
    if (name === 'crc' || name.includes('sanction')) {
        name = '🛡️ CRC 兒少裁罰';
        hasCRC = true;
    }
    if (name === 'gov_kindergarten') name = '🏫 教育部裁罰紀錄'; // 舊的或共用的

    console.log(`✅ ${name}: ${stat.count} 筆`);
  });

  if (!hasCRC) {
      console.log(`⚠️ 🛡️ CRC 兒少裁罰: 0 筆 (警告：資料可能遺失)`);
  }

  // 顯示幼兒園統計
  console.log(`✅ 🏫 全國教保網 (幼兒園名冊): ${kindergartenCount[0].count} 筆`);

  console.log("==========================================");
  
  // 總結
  if (hasCRC && kindergartenCount[0].count > 1000) {
      console.log("\n🎉 恭喜！三大資料庫看來都非常健康！");
  } else {
      console.log("\n🤔 似乎有部分資料偏少，建議檢查。");
  }

  process.exit(0);
}

checkCounts();