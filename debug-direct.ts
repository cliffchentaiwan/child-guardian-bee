// debug-direct.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { cases } from './drizzle/schema'; // 根據你的截圖，drizzle 資料夾在根目錄
import { sql } from 'drizzle-orm';
import fs from 'fs';

async function check() {
  console.log("🔍 [1/4] 正在尋找資料庫檔案...");

  // 嘗試常見的資料庫檔名
  const dbFileName = fs.existsSync('child_guardian.db') ? 'child_guardian.db' : 'sqlite.db';
  
  if (!fs.existsSync(dbFileName)) {
      console.log(`❌ 找不到資料庫檔案！(找了 child_guardian.db 和 sqlite.db)`);
      console.log(`👉 這代表你還沒執行過任何遷移或爬蟲。`);
      console.log(`👉 請執行：npx tsx server/scripts/crawlKindergarten_All.ts`);
      process.exit(1);
  }

  console.log(`✅ 找到資料庫檔案: ${dbFileName}`);
  
  // 直接連線，不經過 server/db.ts
  const sqlite = new Database(dbFileName);
  const db = drizzle(sqlite);

  console.log("🔍 [2/4] 正在讀取資料...");
  
  try {
    // 1. 檢查案件總數
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(cases);
    const count = Number(countResult[0]?.count || 0);
    console.log(`📊 [3/4] 目前案件總數: ${count} 筆`);

    if (count === 0) {
      console.log("❌ [診斷結果] 資料庫是空的！");
      console.log("👉 這是為什麼選單沒東西的原因。");
      console.log("👉 請務必執行爬蟲：npx tsx server/scripts/crawlKindergarten_All.ts");
    } else {
      // 2. 檢查地點
      const locations = await db
        .selectDistinct({ location: cases.location })
        .from(cases);
      
      console.log(`📍 [4/4] 地點總數: ${locations.length} 個`);
      
      const validLocs = locations.filter(l => l.location).map(l => l.location);
      console.log("📝 地點範例:", validLocs.slice(0, 3));
      
      if (validLocs.length > 0) {
         console.log("🎉 [診斷結果] 資料庫非常健康！有資料也有地點。");
         console.log("👉 如果網頁還是空白，那就是「後端 API 快取」的問題。");
         console.log("👉 請重啟你的開發伺服器 (Ctrl+C 停止，再 npm run dev)。");
      } else {
         console.log("⚠️ [診斷結果] 有資料，但「地點」欄位全是空的。");
      }
    }

  } catch (error) {
    console.error("❌ 讀取失敗：", error);
  }
}

check();