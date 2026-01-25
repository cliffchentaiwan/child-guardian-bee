// debug-db.ts
import { db } from "./server/db";
import { cases } from "./drizzle/schema";
import { sql } from "drizzle-orm";

async function check() {
  console.log("🔍 [1/3] 正在連接資料庫...");
  
  try {
    // 1. 檢查案件總數
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(cases);
    const count = Number(countResult[0]?.count || 0);
    console.log(`📊 [2/3] 資料庫目前的案件總數: ${count} 筆`);

    if (count === 0) {
      console.log("❌ [診斷結果] 資料庫是空的！這就是為什麼下拉選單沒東西。");
      console.log("👉 解決方法：請執行爬蟲 npx tsx server/scripts/crawlKindergarten_All.ts");
    } else {
      // 2. 檢查地點
      const locations = await db
        .selectDistinct({ location: cases.location })
        .from(cases);
      
      console.log(`📍 [3/3] 找到地點總數: ${locations.length} 個`);
      
      const validLocs = locations.filter(l => l.location).map(l => l.location);
      console.log("📝 地點範例 (前3筆):", validLocs.slice(0, 3));
      
      if (validLocs.length > 0) {
         console.log("✅ [診斷結果] 資料庫很健康！有資料也有地點。");
         console.log("👉 如果網頁還是沒東西，那是前端快取的問題，請重新啟動伺服器。");
      } else {
         console.log("⚠️ [診斷結果] 有案件資料，但是「地點」欄位全是空的！");
         console.log("👉 解決方法：可能需要清空資料庫重抓。");
      }
    }

  } catch (error) {
    console.error("❌ [錯誤] 讀取失敗，原因：", error);
  }
  process.exit(0);
}

check();