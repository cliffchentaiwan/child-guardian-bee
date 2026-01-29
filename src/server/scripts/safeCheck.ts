// src/server/scripts/safeCheck.ts
import 'dotenv/config';
import { db } from '../db';
import { cases } from '../schema';
import { sql, eq } from 'drizzle-orm'; // 引入 eq 用於精準比對

async function safeCheck() {
  console.log("🕵️‍♂️ [安全查帳模式 v2] 開始點名...");
  console.log("==================================");

  try {
    // 1. 總數
    const total = await db.select({ count: sql<number>`count(*)` }).from(cases);
    console.log(`🏆 資料庫總筆數：${total[0].count} 筆`);
    console.log("----------------------------------");

    // 2. 分開點名 (改用 eq 語法，保證不會報錯)
    // CRC
    const crc = await db.select({ count: sql<number>`count(*)` })
                        .from(cases)
                        .where(eq(cases.sourceType, 'gov_crc'));
    console.log(`🛡️ 衛福部 CRC  : ${crc[0].count} 筆`);

    // ECE (教保網)
    // 考慮兩種可能的標籤名稱 (gov_ece 或 gov_edu)
    const ece = await db.select({ count: sql<number>`count(*)` })
                        .from(cases)
                        .where(eq(cases.sourceType, 'gov_ece'));
    
    // 如果 gov_ece 是 0，查查看 gov_edu (舊標籤)
    let eceCount = ece[0].count;
    if (eceCount === 0) {
        const edu = await db.select({ count: sql<number>`count(*)` })
                            .from(cases)
                            .where(eq(cases.sourceType, 'gov_edu'));
        if (edu[0].count > 0) {
            console.log(`🏫 教育部 (舊標籤): ${edu[0].count} 筆`);
            eceCount += edu[0].count;
        } else {
             console.log(`🏫 教保網 ECE  : ${eceCount} 筆`);
        }
    } else {
        console.log(`🏫 教保網 ECE  : ${eceCount} 筆`);
    }

    // 新聞
    const news = await db.select({ count: sql<number>`count(*)` })
                        .from(cases)
                        .where(eq(cases.sourceType, 'news'));
    console.log(`📰 新聞報導    : ${news[0].count} 筆`);

    // 司法
    const judicial = await db.select({ count: sql<number>`count(*)` })
                            .from(cases)
                            .where(eq(cases.sourceType, 'judicial'));
    console.log(`⚖️ 司法院判決  : ${judicial[0].count} 筆`);

    console.log("==================================");
    
    // 3. 診斷建議
    if (crc[0].count > 500) {
        console.log("✅ 恭喜！CRC (衛福部) 看起來非常完整 (數百筆資料)。");
    } else {
        console.log("🤔 CRC 資料似乎偏少？");
    }

    if (eceCount === 0) {
        console.log("\n⚡️ 下一步建議：您的「教保網 (ECE)」是 0 筆。");
        console.log("   這是最大的資料來源，建議接下來執行：");
        console.log("   npx tsx src/server/scripts/crawlECE_Popup.ts");
    }

  } catch (e: any) {
    console.error("❌ 發生意外:", e.message);
  } finally {
    process.exit(0);
  }
}

safeCheck();