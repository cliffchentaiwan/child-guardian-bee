// src/server/scripts/countData.ts
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function getSourceCounts() {
  console.log('修正回傳值處理，最終查詢...');

  try {
    // db.execute 回傳的是一個物件，真實的資料在 .rows 屬性中
    const queryResult: any = await db.execute(sql`
      SELECT "source", COUNT(*) as count
      FROM cases
      WHERE "source" IS NOT NULL
      GROUP BY "source"
    `);
    
    console.log('\\n========= 資料量統計結果 =========\\n');

    const results = queryResult.rows; // <--- 🔥 關鍵修正！

    if (!results || results.length === 0) {
        console.log("資料庫中尚無任何可分析的資料。");
    } else {
        console.log("各來源資料筆數：\\n");
        let total = 0;
        results.forEach((row: any) => {
            const sourceName = row.source;
            const count = Number(row.count);
            console.log(`- ${sourceName}: ${count.toLocaleString()} 筆`);
            total += count;
        });
        console.log('\\n------------------------------------');
        console.log(`   總計: ${total.toLocaleString()} 筆`);
    }

    console.log('\\n====================================\\n');

  } catch (error) {
    console.error('查詢資料時發生錯誤:', error);
  }
}

getSourceCounts();














