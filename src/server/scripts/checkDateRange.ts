// src/server/scripts/checkDateRange.ts
import 'dotenv/config';
import { db } from '../db';
import { cases } from '../schema';
import { sql } from 'drizzle-orm';

async function checkDateRange() {
  console.log("📅 [時光機檢查] 正在分析資料庫的年份範圍...");
  console.log("==================================================================");
  console.log(`| ${"來源 (Source)".padEnd(20)} | ${"總筆數".padEnd(8)} | ${"最早紀錄".padEnd(12)} | ${"最新紀錄".padEnd(12)} |`);
  console.log("------------------------------------------------------------------");

  // 1. 抓取各來源的統計數據 (Min Date, Max Date, Count)
  const stats = await db.select({
      source: cases.sourceType,
      count: sql<number>`count(*)`,
      minDate: sql<string>`min(${cases.caseDate})`,
      maxDate: sql<string>`max(${cases.caseDate})`
  })
  .from(cases)
  .groupBy(cases.sourceType);

  // 2. 顯示結果
  stats.forEach(s => {
      let name = s.source || '未分類';
      // 翻譯名稱讓您好讀
      if (s.source === 'gov_crc') name = '衛生福利部 (CRC)';
      if (s.source === 'gov_edu') name = '教育部 (補習班/幼兒園)';
      if (s.source === 'judicial') name = '司法院 (判決書)';
      if (s.source === 'news') name = '新聞報導';

      // 格式化日期 (只取 YYYY-MM-DD)
      const min = s.minDate ? s.minDate.substring(0, 10) : '無日期';
      const max = s.maxDate ? s.maxDate.substring(0, 10) : '無日期';

      console.log(`| ${name.padEnd(20)} | ${s.count.toString().padEnd(8)} | ${min.padEnd(12)} | ${max.padEnd(12)} |`);
  });
  console.log("==================================================================");
  
  process.exit(0);
}

checkDateRange();