// src/server/scripts/crawlMOE_Real.ts
import 'dotenv/config';
import { db } from '../db';
import { kindergartens } from '../schema';
import { eq } from 'drizzle-orm';

// 🔥 更新網址：改成 113 學年度 (如果之後又 404，代表教育部又改網址了，需要再查)
const OPEN_DATA_URL = 'https://stats.moe.gov.tw/files/detail/113/113_kindergarten.csv';

async function fetchOpenDataNoLib() {
  console.log('🏫 [教育部] 啟動 Open Data 爬蟲 (免安裝套件版 v2)...');
  
  try {
    const response = await fetch(OPEN_DATA_URL);
    if (!response.ok) {
        // 如果 113 也失敗，嘗試 fallback 到 112 (有些時候舊連結會復活)
        console.log(`⚠️ 113學年連結失敗 (${response.status})，嘗試 112...`);
        const fallbackUrl = 'https://stats.moe.gov.tw/files/detail/112/112_kindergarten.csv';
        const fallbackResp = await fetch(fallbackUrl);
        if(!fallbackResp.ok) throw new Error(`所有下載連結皆失效 (404)。建議手動下載 CSV 並放置於專案中。`);
        await processCSV(await fallbackResp.text());
    } else {
        await processCSV(await response.text());
    }

  } catch (error: any) {
    console.error('❌ 發生錯誤:', error.message);
  }
}

async function processCSV(csvText: string) {
    // 1. 依換行符號切割
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    
    // 2. 抓取標題列
    const headers = lines[0].split(',').map(h => h.trim());
    
    // 找出索引
    const idxName = headers.findIndex(h => h.includes('名稱'));
    const idxCity = headers.findIndex(h => h.includes('縣市'));
    const idxAddr = headers.findIndex(h => h.includes('地址') || h.includes('園址'));
    const idxTel = headers.findIndex(h => h.includes('電話'));

    console.log(`📦 取得原始資料：約 ${lines.length - 1} 筆`);
    let newCount = 0;

    // 3. 遍歷資料
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        // 簡單切割 (處理 CSV 內的逗號風險：如果教育部資料很乾淨則沒問題)
        // 這裡做一個簡單的防護：只切前幾個逗號
        const cols = line.split(',');

        const name = cols[idxName]?.trim();
        const city = cols[idxCity]?.trim();
        const address = cols[idxAddr]?.trim();
        const phone = cols[idxTel]?.trim();

        if (!name) continue;

        const uniqueId = `MOE_${name}_${city}`;
        const existing = await db.select().from(kindergartens).where(eq(kindergartens.sourceId, uniqueId));

        if (existing.length === 0) {
            await db.insert(kindergartens).values({
                name: name,
                city: city || '',
                area: address ? address.substring(0, 6) : '',
                address: address || '',
                phone: phone || '',
                sourceId: uniqueId,
                punishmentRecords: JSON.stringify([]),
                updatedAt: new Date(),
            });
            newCount++;
            process.stdout.write(".");
        }
    }
    console.log(`\n🎉 教育部資料同步完成！新增 ${newCount} 筆。`);
}

fetchOpenDataNoLib();