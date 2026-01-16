import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const db = drizzle(DATABASE_URL);

async function main() {
  console.log("查詢資料庫中的案例...\n");
  
  // 查詢所有案例
  const cases = await db.execute(sql`SELECT id, maskedName, sourceType, description FROM cases LIMIT 30`);
  
  console.log("資料庫中的案例：");
  console.log("================");
  
  console.log("Raw result:", JSON.stringify(cases[0], null, 2));
  
  for (const row of cases[0] || []) {
    console.log(`ID: ${row.id}, 姓名: ${row.maskedName}, 來源: ${row.sourceType}`);
    console.log(`  描述: ${row.description?.substring(0, 50)}...`);
  }
  
  // 查詢是否有「毛」姓的案例
  console.log("\n搜尋「毛」姓案例：");
  console.log("================");
  const maoResults = await db.execute(sql`SELECT id, maskedName, sourceType FROM cases WHERE maskedName LIKE '%毛%'`);
  
  if ((maoResults[0] || []).length === 0) {
    console.log("沒有找到「毛」姓案例");
  } else {
    for (const row of maoResults[0] || []) {
      console.log(`ID: ${row.id}, 姓名: ${row.maskedName}, 來源: ${row.sourceType}`);
    }
  }
  
  process.exit(0);
}

main().catch(console.error);
