// src/server/checkNews.ts
import 'dotenv/config';
import mysql from "mysql2/promise";

async function check() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  
  // 直接下 SQL 指令，檢查有沒有 "媒體報導"
  const [rows]: any = await connection.execute(
    "SELECT id, originalName, sourceType, role FROM cases WHERE sourceType = '媒體報導' LIMIT 5"
  );

  console.log("🔍 目前資料庫裡的「新聞」樣本：");
  console.table(rows);
  
  await connection.end();
}

check();