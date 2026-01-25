// src/server/scripts/checkStats.ts
import { db } from '../db';
import { cases } from '../schema';
import { sql } from 'drizzle-orm';

async function checkStats() {
  console.log("📊 [資料庫健康檢查] 正在盤點資產...");

  // 1. 總筆數
  const total = await db.select({ count: sql<number>`count(*)` }).from(cases);
  
  // 2. 分類統計
  const newsCount = await db.select({ count: sql<number>`count(*)` }).from(cases).where(sql`source_type LIKE 'news_%'`);
  const crcCount = await db.select({ count: sql<number>`count(*)` }).from(cases).where(sql`source_type = 'gov_crc'`);
  const moeCount = await db.select({ count: sql<number>`count(*)` }).from(cases).where(sql`source_type = 'gov_edu'`);
  const judicialCount = await db.select({ count: sql<number>`count(*)` }).from(cases).where(sql`source_type = 'judicial'`);

  console.log("\n--------------------------------");
  console.log(`🐝 資料庫總筆數：${total[0].count} 筆`);
  console.log("--------------------------------");
  console.log(`📰 新聞報導 (News)   ： ${newsCount[0].count} 筆`);
  console.log(`🛡️ 兒少裁罰 (CRC)    ： ${crcCount[0].count} 筆  <-- 這是您的主力資料！`);
  console.log(`🏫 幼兒園名單 (MOE)  ： ${moeCount[0].count} 筆  <-- 這裡應該是 0，導致搜不到正常學校`);
  console.log(`⚖️ 司法判決 (Judicial)： ${judicialCount[0].count} 筆`);
  console.log("--------------------------------");
  
  if (moeCount[0].count === 0) {
      console.log("\n💡 分析：因為「幼兒園名單」為 0，所以目前只能搜到「有違規紀錄」的學校。");
      console.log("   搜「快樂」沒東西是正常的，因為它可能是一間好學校（沒違規）。");
  }
}

checkStats();