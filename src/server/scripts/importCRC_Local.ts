// src/server/scripts/importCRC_Local.ts
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio'; // 我們需要 cheerio 來解析 HTML 檔案
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

async function importCRCLocal() {
  console.log("📂 啟動 CRC 本地檔案匯入工具...");

  // 1. 讀取檔案
  const filePath = path.join(process.cwd(), 'crc_backup.html');
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 找不到檔案：${filePath}`);
    console.error("👉 請先手動去 CRC 網站搜尋結果，按右鍵「另存新檔」，存成 crc_backup.html 放在專案根目錄。");
    process.exit(1);
  }

  console.log("✅ 讀取到網頁檔案，開始解析...");
  const html = fs.readFileSync(filePath, 'utf-8');
  const $ = cheerio.load(html);
  let newCount = 0;

  // 2. 解析表格 (Cheerio 比 Puppeteer 更會找 DOM)
  // 我們尋找所有的 tr，不管是 table 裡面的還是 div 模擬的
  const rows = $('tr');
  console.log(`🔎 掃描到 HTML 中共有 ${rows.length} 列資料...`);

  const items: any[] = [];

  rows.each((i, el) => {
    const tds = $(el).find('td');
    if (tds.length >= 4) {
      // 嘗試抓取
      const t1 = $(tds[1]).text().trim();
      const t2 = $(tds[2]).text().trim();
      const t3 = $(tds[3]).text().trim();
      const t4 = $(tds[4]).text().trim(); // 通常日期在後面

      // 判斷邏輯
      let name = '', location = '', reason = '', date = '';

      // 情況 A: 標準表格 [序號] [縣市] [姓名] [法條] [日期]
      if (t4 && (t4.includes('/') || t4.includes('.')) && t2 !== '姓名') {
         location = t1; name = t2; reason = t3; date = t4;
      }
      // 情況 B: 少一格 [縣市] [姓名] [法條] [日期]
      else if (t3 && (t3.includes('/') || t3.includes('.')) && t2 !== '姓名') {
         location = '未分類'; name = t1; reason = t2; date = t3;
      }

      if (name && date.length > 5) {
        items.push({ name, location, reason, date });
      }
    }
  });

  console.log(`✨ 解析出有效資料：${items.length} 筆`);

  // 3. 寫入資料庫
  for (const item of items) {
    let dateStr = item.date;
    // 日期清洗
    dateStr = dateStr.replace(/\./g, '/');
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const year = parseInt(parts[0]) + 1911;
            dateStr = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
    }

    const uniqueId = `CRC_${item.name}_${dateStr}`;
    const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));

    if (existing.length === 0) {
        await db.insert(cases).values({
            maskedName: item.name,
            name: item.name,
            originalName: item.name,
            role: '個人',
            riskTags: JSON.stringify(['兒少權益法', '裁罰']),
            location: item.location,
            caseDate: new Date(dateStr).toISOString(),
            description: `違規事由：${item.reason}`,
            sourceType: 'gov_crc',
            sourceLink: uniqueId,
            verified: true,
            createdAt: new Date(),
        });
        newCount++;
    }
  }

  // 記錄 Log
  if (newCount >= 0) {
      await db.insert(dataSyncLogs).values({
          sourceName: 'CRC (手動匯入)',
          status: 'success',
          recordCount: newCount,
          startedAt: new Date(),
          completedAt: new Date(),
      });
  }

  console.log(`\n🎉 匯入完成！共新增 ${newCount} 筆資料。`);
  process.exit(0);
}

importCRCLocal();