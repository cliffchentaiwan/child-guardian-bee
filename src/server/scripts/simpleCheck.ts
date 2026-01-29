// src/server/scripts/simpleCheck.ts
import 'dotenv/config';
import { db } from '../db';
import { cases } from '../schema';
import { sql } from 'drizzle-orm';

async function simpleCheck() {
  console.log("🕵️‍♂️ [極簡驗證模式] 正在讀取資料庫...");
  
  try {
    // 1. 直接數總數
    const result = await db.select({ count: sql<number>`count(*)` }).from(cases);
    const total = result[0].count;
    
    console.log("\n==============================");
    console.log(`🏆 資料庫目前總筆數：${total} 筆`);
    console.log("==============================\n");

    if (total > 0) {
        // 2. 分類點名 (只顯示筆數，不顯示日期，避免報錯)
        const stats = await db.select({
            source: cases.sourceType,
            count: sql<number>`count(*)`
        })
        .from(cases)
        .groupBy(cases.sourceType);

        console.log("📊 分類統計：");
        stats.forEach(stat => {
            let name = stat.source || '未分類';
            // 簡單翻譯
            if (name === 'gov_crc') name = '🛡️ CRC 兒少裁罰 (衛福部)';
            if (name === 'gov_ece') name = '🏫 教保網 (教育部)';
            if (name === 'gov_edu') name = '🏫 教育部舊資料';
            if (name === 'judicial') name = '⚖️ 司法院判決書';
            if (name === 'news') name = '📰 新聞報導';
            
            console.log(`   👉 ${name}: ${stat.count} 筆`);
        });

        // 特別檢查 CRC
        const crcData = stats.find(s => s.source === 'gov_crc');
        if (crcData && Number(crcData.count) > 1000) {
             console.log("\n✅ 驗證通過：CRC 資料量充足 (超過 1000 筆)，爬蟲大成功！");
        }
    } else {
        console.log("⚠️ 警告：資料庫是空的 (0 筆)。");
    }

  } catch (e: any) {
    console.error("❌ 讀取失敗:", e.message);
  } finally {
    process.exit(0);
  }
}

simpleCheck();