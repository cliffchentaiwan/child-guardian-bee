// src/server/scripts/crawlCRC_TextScanner.ts
import puppeteer from 'puppeteer';
import readline from 'readline';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

const TARGET_URL = 'https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function harvestTextScanner() {
  console.log("🔥 啟動 CRC 爬蟲 (文字暴力掃描版)...");
  
  const browser = await puppeteer.launch({
    headless: false, 
    defaultViewport: null,
    args: ['--start-maximized']
  });

  let newCount = 0;

  try {
    const page = await browser.newPage();
    console.log(`\n📄 前往：${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    console.log("\n👇👇👇 [請執行以下動作] 👇👇👇");
    console.log("1. 選擇【全選】並按下【搜尋】。");
    console.log("2. 確保資料列表出現。");
    console.log("👉 回到這裡，按下 [Enter] 鍵！");
    console.log("----------------------------------");

    await new Promise<void>(resolve => {
        rl.question('等待按下 Enter...', () => {
            resolve();
            rl.close();
        });
    });

    console.log("⚡️ 收到指令！開始進行全頁文字掃描...");

    // --- 暴力文字分析 ---
    const items = await page.evaluate(() => {
        const results: any[] = [];
        
        // 1. 抓取整頁純文字，並按行切割
        const fullText = document.body.innerText;
        const lines = fullText.split('\n');

        // 2. 逐行掃描
        lines.forEach(line => {
            const trimmed = line.trim();
            // 只要這行字串裡包含日期格式 (如 112/05/20 或 112.05.20)
            // 且長度大於 10 (避免只抓到日期本身)
            if (trimmed.length > 10 && /\d{2,3}[\/.]\d{1,2}[\/.]\d{1,2}/.test(trimmed)) {
                
                // 嘗試用空白切割欄位
                const parts = trimmed.split(/\s+/);
                
                // 假設這一行是： [序號] [縣市] [姓名] [法條] [日期]
                // 或是： [縣市] [姓名] [法條] [日期]
                
                // 尋找日期是第幾個
                const dateIndex = parts.findIndex(p => /\d{2,3}[\/.]\d{1,2}[\/.]\d{1,2}/.test(p));
                
                if (dateIndex >= 2) {
                    const date = parts[dateIndex];
                    let name = parts[dateIndex - 2]; // 名字通常在日期前兩格
                    let location = parts[dateIndex - 3] || '未分類';
                    let reason = parts[dateIndex - 1]; // 日期前一格通常是法條

                    // 如果名字太長(可能是法條內容)，往前修正
                    if (name.length > 20) {
                        reason = name;
                        name = parts[dateIndex - 3] || name;
                        location = parts[dateIndex - 4] || location;
                    }

                    // 過濾無效資料
                    if (name && name !== '姓名' && name !== '名稱') {
                        results.push({ name, date, location, reason, raw: trimmed });
                    }
                }
            }
        });
        return results;
    });

    console.log(`\n🔎 掃描結果：發現 ${items.length} 筆資料`);
    
    // Debug: 印出前 3 筆讓你看一下抓到了什麼
    if (items.length > 0) {
        console.log("👀 預覽前 3 筆資料：");
        console.log(items.slice(0, 3));
    } else {
        console.log("⚠️ 依然是 0 筆。這代表頁面上的文字可能無法被 Puppeteer 讀取 (例如在 Shadow DOM 裡)。");
    }

    // 寫入資料庫
    for (const item of items) {
        let dateStr = item.date;
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
                description: `違規內容：${item.raw}`, // 存原始文字最保險
                sourceType: 'gov_crc',
                sourceLink: uniqueId,
                verified: true,
                createdAt: new Date(),
            });
            newCount++;
        }
    }

    if (newCount >= 0) {
        await db.insert(dataSyncLogs).values({
            sourceName: 'CRC 兒少裁罰 (文字暴力版)',
            status: 'success',
            recordCount: newCount,
            startedAt: new Date(),
            completedAt: new Date(),
        });
    }

    console.log(`\n🎉 任務結束！共新增 ${newCount} 筆資料。`);

  } catch (error: any) {
    console.error("❌ 程式錯誤:", error.message);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

harvestTextScanner();