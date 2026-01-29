// src/server/scripts/checkData.ts
import 'dotenv/config';
// 🔥 修正引用路徑：不再去抓不存在的 drizzle/schema.js
import { db } from '../db'; 
import { cases, users, reports, dataSyncLogs } from '../schema'; 
import { sql } from 'drizzle-orm';

async function checkData() {
  console.log("🕵️‍♂️ [Neon 雲端查帳員] 正在連線盤點資產...");
  console.log("================================================================");
  console.log(`| ${"資料來源 (Source)".padEnd(24)} | ${"筆數".padEnd(8)} | ${"最早紀錄".padEnd(12)} | ${"最新紀錄".padEnd(12)} |`);
  console.log("----------------------------------------------------------------");

  try {
    // 1. 抓取案件統計 (筆數 + 日期範圍)
    const stats = await db.select({
        source: cases.sourceType,
        count: sql<number>`count(*)`,
        minDate: sql<string>`min(${cases.caseDate})`,
        maxDate: sql<string>`max(${cases.caseDate})`
    })
    .from(cases)
    .groupBy(cases.sourceType);

    // 2. 顯示結果
    if (stats.length === 0) {
        console.log("| (目前資料庫是空的)     | 0        | ---          | ---          |");
    } else {
        stats.forEach(s => {
            let name = s.source || '未分類';
            if (s.source === 'gov_crc') name = '🛡️ 衛福部裁罰 (CRC)';
            if (s.source === 'gov_ece') name = '🏫 教保網 (ECE)'; 
            if (s.source === 'gov_edu') name = '🏫 教育部 (舊)';
            if (s.source === 'judicial') name = '⚖️ 司法院判決書';
            if (s.source === 'news') name = '📰 新聞報導';

            const min = s.minDate ? new Date(s.minDate).toISOString().substring(0, 10) : '---';
            const max = s.maxDate ? new Date(s.maxDate).toISOString().substring(0, 10) : '---';

            console.log(`| ${name.padEnd(24)} | ${s.count.toString().padEnd(8)} | ${min.padEnd(12)} | ${max.padEnd(12)} |`);
        });
    }

    console.log("================================================================");

    // 3. 檢查總數
    const totalCases = await db.select({ count: sql<number>`count(*)` }).from(cases);
    console.log(`🗂️  總資料庫 (Cases)    : ${totalCases[0].count} 筆`);

    // 4. 檢查 Log
    try {
        const lastLog = await db.select().from(dataSyncLogs).orderBy(sql`${dataSyncLogs.startedAt} desc`).limit(1);
        if (lastLog.length > 0) {
            console.log(`📝  最近一次爬蟲紀錄    : ${lastLog[0].sourceName} (${lastLog[0].status}) - ${lastLog[0].recordCount} 筆`);
            console.log(`    ⏰ 時間: ${lastLog[0].completedAt?.toLocaleString()}`);
        } else {
            console.log(`📝  最近一次爬蟲紀錄    : (尚無紀錄)`);
        }
    } catch (e) {
        console.log(`📝  最近一次爬蟲紀錄    : (無法讀取 Log)`);
    }

    console.log("----------------------------------------------------------------");
    
    // 5. 結論
    const crcStat = stats.find(s => s.source === 'gov_crc');
    if (crcStat && Number(crcStat.count) > 0) {
        console.log("✅ 恭喜！CRC 資料已經在桌上了！");
    } else {
        console.log("⚠️ 注意！CRC 還是 0 筆，請檢查剛剛的爬蟲是否有跑完。");
    }

  } catch (error: any) {
    console.error("❌ 查帳失敗，請檢查資料庫連線:", error.message);
  } finally {
    process.exit(0);
  }
}

checkData();