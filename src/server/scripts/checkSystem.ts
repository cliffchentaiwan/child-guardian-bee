// src/server/scripts/checkSystem.ts
import 'dotenv/config';
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
// 🔥 修正這裡：往上跳三層 ../../../ 才能找到根目錄的 drizzle
import { cases, dataSyncLogs } from '../../../drizzle/schema';
import { sql } from 'drizzle-orm';

async function checkSystem() {
  console.log("🏥 正在為「兒少守護小蜂」進行全身健康檢查...\n");
  
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(connection);

  // 1. 檢查各來源的資料數量
  const stats = await db
    .select({
      sourceType: cases.sourceType,
      count: sql<number>`count(*)`
    })
    .from(cases)
    .groupBy(cases.sourceType);

  console.log("📊 資料庫庫存統計：");
  console.log("--------------------------------");
  if (stats.length === 0) {
    console.log("⚠️ 資料庫是空的！(或是 source_type 欄位異常)");
  } else {
    let total = 0;
    stats.forEach(s => {
      console.log(`📦 ${s.sourceType || '未知來源'}: \t${s.count} 筆`);
      total += Number(s.count);
    });
    console.log("--------------------------------");
    console.log(`🔥 總計案件數: \t${total} 筆`);
  }
  console.log("\n");

  // 2. 檢查最新一筆資料的時間 (確認是不是舊資料)
  // 注意：這裡使用 query 語法，如果報錯可能是 Drizzle 版本差異，我們改用 select
  const latest = await db.select().from(cases).orderBy(sql`${cases.createdAt} DESC`).limit(1);

  if (latest.length > 0) {
    console.log("🕒 最近一次寫入資料時間:", latest[0].createdAt);
    console.log("📝 最新一筆資料標題:", latest[0].originalName);
  } else {
    console.log("🕒 無資料記錄");
  }

  // 3. 檢查系統更新日誌
  // 同樣改用標準 select 語法以防版本問題
  const logs = await db.select().from(dataSyncLogs).orderBy(sql`${dataSyncLogs.completedAt} DESC`).limit(5);

  console.log("\n📜 最近 5 次系統更新紀錄：");
  logs.forEach(log => {
    console.log(`   - [${log.status === 'success' ? '✅' : '❌'}] ${log.sourceName} (${log.recordCount}筆) @ ${log.completedAt}`);
  });

  await connection.end();
  process.exit(0);
}

checkSystem();