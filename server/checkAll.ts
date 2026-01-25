// src/server/checkAll.ts
import 'dotenv/config';
import mysql from "mysql2/promise";

async function checkAll() {
  console.log("🔍 正在檢查資料庫內容...");
  const url = process.env.DATABASE_URL;
  if (!url) {
      console.error("❌ 找不到 DATABASE_URL");
      return;
  }
  console.log("連線字串:", url.substring(0, 20) + "..."); 

  try {
      const connection = await mysql.createConnection(url);
      
      // 1. 檢查總筆數
      const [countResult]: any = await connection.execute("SELECT count(*) as total FROM cases");
      console.log(`📊 總共有 ${countResult[0].total} 筆資料`);

      // 2. 檢查最新寫入的 10 筆 (不管類型)
      // 注意：這裡我加了 sourceLink 讓你確認這是不是新聞
      const [rows]: any = await connection.execute(
        "SELECT id, originalName, sourceType, role, left(sourceLink, 30) as link FROM cases ORDER BY id DESC LIMIT 10"
      );

      console.log("\n📋 最新 10 筆資料：");
      console.table(rows);
      
      await connection.end();
  } catch (e: any) {
      console.error("❌ 連線或查詢失敗:", e.message);
  }
}

checkAll();