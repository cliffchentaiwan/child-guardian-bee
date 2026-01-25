// src/server/scripts/checkData.ts
import 'dotenv/config';
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { like } from "drizzle-orm";

// 👇 關鍵修正：這裡用了三個 `../`，代表往上跳三層回到根目錄
// src/server/scripts -> src/server -> src -> (Root) -> drizzle
import { blacklist } from '../../../drizzle/schema.js'; 

const SEARCH_KEYWORD = "林"; 

async function searchTest() {
  console.log(`🕵️‍♂️ 正在資料庫中搜尋包含「${SEARCH_KEYWORD}」的黑名單...`);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
      console.error("❌ 錯誤：找不到 DATABASE_URL，請檢查 .env 檔案。");
      process.exit(1);
  }

  // 建立連線
  const connection = await mysql.createConnection(databaseUrl);
  const db = drizzle(connection);

  try {
      const results = await db.select()
        .from(blacklist)
        .where(like(blacklist.name, `%${SEARCH_KEYWORD}%`)) 
        .limit(5);

      if (results.length > 0) {
        console.log(`\n✅ 找到了 ${results.length} 筆相關資料：\n`);
        results.forEach((item, index) => {
          console.log(`[${index + 1}] 姓名：${item.name}`);
          console.log(`    📍 地點：${item.location}`);
          console.log(`    📅 日期：${item.date}`);
          // 處理可能為 null 的情況
          const reason = item.reason ? item.reason.substring(0, 30) : "(無資料)";
          console.log(`    📜 原因：${reason}...`);
          console.log('-----------------------------------');
        });
      } else {
        console.log("❌ 找不到相關資料，請換個關鍵字試試。");
      }
  } catch (err: any) {
      console.error("❌ 查詢失敗:", err.message);
  } finally {
      await connection.end();
      process.exit(0);
  }
}

searchTest();