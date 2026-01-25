// src/server/scripts/resetDb.ts
import 'dotenv/config';
import mysql from "mysql2/promise";

async function resetDb() {
  console.log("🧨 準備重置資料庫...");
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("❌ 找不到 DATABASE_URL");

  const connection = await mysql.createConnection(dbUrl);

  try {
    // 1. 關閉外鍵檢查 (避免刪除順序問題)
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');

    // 2. 刪除所有相關表格
    const tables = [
      'cases', 
      'users', 
      'reports', 
      'search_logs', 
      'data_sync_logs',
      '__drizzle_migrations' // 清除遷移紀錄
    ];

    for (const table of tables) {
      try {
        await connection.query(`DROP TABLE IF EXISTS \`${table}\``);
        console.log(`   🗑️ 已刪除表格: ${table}`);
      } catch (e) {
        console.log(`   ⚠️ 刪除 ${table} 失敗 (可能不存在)`);
      }
    }

    // 3. 開啟外鍵檢查
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log("✨ 資料庫已清空，準備重建！");
  } catch (err) {
    console.error("❌ 重置失敗:", err);
  } finally {
    await connection.end();
  }
}

resetDb();