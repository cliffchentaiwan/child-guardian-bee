// src/server/scripts/crawlCRC_TextParser.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

const TARGET_URL = 'https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction';

async function harvestTextParser() {
  console.log("🔥 啟動 CRC 爬蟲 (純文字流解析版)...");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  let totalNewCount = 0;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log(`\n📄 前往：${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // --- 1. 自動操作 ---
    console.log("🤖 自動執行：全選 -> 搜尋...");
    
    // 使用純字串注入，避免編譯錯誤
    await page.evaluate(`
      (() => {
        const options = Array.from(document.querySelectorAll('option'));
        const allOption = options.find(o => o.innerText.includes('全選'));
        if (allOption) {
            const select = allOption.parentElement;
            select.value = allOption.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        // 點搜尋
        const btn = document.querySelector('.searchBtn') || 
                    Array.from(document.querySelectorAll('button, input')).find(b => b.innerText && b.innerText.includes('搜尋'));
        if (btn) btn.click();
      })()
    `);

    console.log("⏳ 等待資料載入 (直到看見 '裁罰日期' 關鍵字)...");
    
    try {
        // 強制等待，直到網頁內容包含 "裁罰日期" 或 "公告日期"
        await page.waitForFunction(
            `document.body.innerText.includes('裁罰日期') || document.body.innerText.includes('公告日期')`,
            { timeout: 15000 }
        );
    } catch (e) {
        console.log("⚠️ 等待超時，但我們繼續嘗試抓取...");
    }

    let hasNextPage = true;
    let pageNum = 1;

    while (hasNextPage) {
        console.log(`\n📄 正在掃描第 ${pageNum} 頁...`);

        // --- 2. 抓取整頁純文字 ---
        // 我們不解析 DOM，直接拿文字流
        const rawText = await page.evaluate<string>(`document.body.innerText`);
        
        // --- 3. 在 Node.js 端解析文字 (避開所有瀏覽器限制) ---
        // 將文字切成行
        const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        const items: any[] = [];
        
        // 逐行掃描
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            // 邏輯：如果你看到 "裁罰對象" 或 "姓名"，下一行通常就是名字
            if (line === '裁罰對象' || line === '姓名') {
                const name = lines[i + 1]; // 抓下一行
                
                // 往後找日期 (通常在名字後面不遠處)
                let date = '';
                let location = '未分類';
                
                // 在接下來的 10 行內找日期
                for (let j = 1; j < 15; j++) {
                    const nextLine = lines[i + j];
                    if (!nextLine) break;

                    // 找日期格式 (2026.01.19 或 112/05/20)
                    if (/\d{3,4}[./]\d{1,2}[./]\d{1,2}/.test(nextLine)) {
                        date = nextLine;
                        break;
                    }
                    
                    // 找縣市 (如果是縣市名稱標籤的下一行)
                    if (nextLine === '縣市名稱') {
                        location = lines[i + j + 1] || location;
                    }
                }

                // 簡單驗證：名字不能是標籤名，日期要有值
                if (name && date && name !== '裁罰對象' && name !== '姓名') {
                    // 避免重複加入 (因為一行可能被 scan 多次)
                    const exists = items.find(it => it.name === name && it.date === date);
                    if (!exists) {
                        items.push({ name, date, location });
                    }
                }
            }
        }

        console.log(`   👀 本頁發現 ${items.length} 筆資料...`);
        
        // --- 除錯區：如果 0 筆，印出網頁給你看 ---
        if (items.length === 0) {
            console.log("⚠️ 警告：抓不到資料。以下是網頁目前的前 500 個字，請幫我確認是否有資料：");
            console.log("---------------------------------------------------");
            console.log(rawText.substring(0, 500));
            console.log("---------------------------------------------------");
        } else {
             console.log(`   ➤ 驗證首筆: 名稱="${items[0].name}", 日期="${items[0].date}"`);
        }

        // --- 4. 寫入資料庫 ---
        for (const item of items) {
            try {
                let dateStr = item.date;
                const dateMatch = dateStr.match(/(\d{3,4})[./](\d{1,2})[./](\d{1,2})/);
                
                if (dateMatch) {
                    let year = parseInt(dateMatch[1]);
                    const month = dateMatch[2].padStart(2, '0');
                    const day = dateMatch[3].padStart(2, '0');
                    if (year < 1911) year += 1911;

                    const finalIsoDate = `${year}-${month}-${day}`;
                    const uniqueId = `CRC_${item.name}_${finalIsoDate}`;

                    const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));

                    if (existing.length === 0) {
                        await db.insert(cases).values({
                            maskedName: item.name,
                            name: item.name,
                            originalName: item.name,
                            role: '個人',
                            riskTags: JSON.stringify(['兒少權益法', '裁罰']),
                            location: item.location,
                            caseDate: new Date(finalIsoDate).toISOString(),
                            description: `CRC 裁罰紀錄`,
                            sourceType: 'gov_crc',
                            sourceLink: uniqueId,
                            verified: true,
                            createdAt: new Date(),
                        });
                        totalNewCount++;
                        process.stdout.write(".");
                    }
                }
            } catch (e) {}
        }
        console.log(""); 

        // --- 5. 翻頁 (文字流判斷) ---
        const nextBtnFound = await page.evaluate(`
            (() => {
                const links = Array.from(document.querySelectorAll('a, button, li'));
                const nextLink = links.find(el => {
                    const txt = el.innerText.trim();
                    return txt === '>' || txt === '下一頁' || txt === 'Next';
                });
                if (nextLink && !nextLink.className.includes('disabled')) {
                    nextLink.click();
                    return true;
                }
                return false;
            })()
        `);

        if (nextBtnFound) {
            console.log("   ➡️ 翻頁中...");
            await new Promise(r => setTimeout(r, 4000));
            pageNum++;
        } else {
            console.log("   🏁 停止翻頁。");
            hasNextPage = false;
        }
    }

    if (totalNewCount >= 0) {
        await db.insert(dataSyncLogs).values({
            sourceName: 'CRC (純文字解析版)',
            status: 'success',
            recordCount: totalNewCount,
            startedAt: new Date(),
            completedAt: new Date(),
        });
    }

    console.log(`\n🎉 CRC 任務結束！共新增 ${totalNewCount} 筆資料。`);

  } catch (error: any) {
    console.error("❌ 錯誤:", error.message);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

harvestTextParser();