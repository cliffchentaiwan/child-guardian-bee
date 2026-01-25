// src/server/scripts/crawlCRC_FrameText.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';

const TARGET_URL = 'https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction';

async function harvestFrameText() {
  console.log("🔥 啟動 CRC 爬蟲 (Frame 鎖定 + 關鍵字吸取版)...");
  
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

    // --- 1. 尋找控制 Frame 並點擊 ---
    console.log("🤖 尋找並操作控制面板...");
    let controlFrame = page.mainFrame();
    
    for (const frame of page.frames()) {
        const hasBtn = await frame.evaluate(() => !!document.querySelector('.searchBtn'));
        if (hasBtn) {
            controlFrame = frame;
            break;
        }
    }

    // 執行點擊 (純字串注入)
    await controlFrame.evaluate(`
      (() => {
        const options = Array.from(document.querySelectorAll('option'));
        const allOption = options.find(o => o.innerText.includes('全選'));
        if (allOption) {
            const select = allOption.parentElement;
            select.value = allOption.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const btn = document.querySelector('.searchBtn');
        if (btn) btn.click();
      })()
    `);

    console.log("⏳ 等待資料載入...");
    await new Promise(r => setTimeout(r, 5000));

    // --- 2. 鎖定資料 Frame ---
    console.log("🕵️ 鎖定資料所在的 Frame...");
    let dataFrame = null;

    // 掃描所有 Frame，找那個網址變了的 (含有 dosearch=true)
    for (const frame of page.frames()) {
        if (frame.url().includes('dosearch=true')) {
            dataFrame = frame;
            console.log(`   ✅ 抓到了！資料庫 URL: ${frame.url()}`);
            break;
        }
    }

    // 如果網址沒變，嘗試用內容找
    if (!dataFrame) {
        for (const frame of page.frames()) {
            try {
                const text = await frame.evaluate(() => document.body.innerText);
                if (text.includes('裁罰對象') && text.includes('裁罰日期')) {
                    dataFrame = frame;
                    console.log(`   ✅ 抓到了！(透過關鍵字確認)`);
                    break;
                }
            } catch (e) { }
        }
    }

    if (!dataFrame) {
        console.log("⚠️ 找不到特定 Frame，退回主頁面嘗試...");
        dataFrame = page.mainFrame();
    }

    // --- 3. 開始吸取資料 ---
    let hasNextPage = true;
    let pageNum = 1;

    while (hasNextPage) {
        console.log(`\n📄 正在掃描第 ${pageNum} 頁...`);

        // 在鎖定的 Frame 裡面抓取純文字
        const rawText = await dataFrame.evaluate<string>(`document.body.innerText`);
        const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        const items: any[] = [];
        
        // --- 核心邏輯：關鍵字吸取 ---
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 觸發條件：看到「裁罰對象」或「姓名」
            if (line === '裁罰對象' || line === '姓名') {
                // 吸取下一行作為名字
                const nameCandidate = lines[i + 1];
                
                // 過濾雜訊 (搜尋框內容)
                if (!nameCandidate || 
                    nameCandidate === '全部' || 
                    nameCandidate === '行為人' || 
                    nameCandidate === '請選擇' ||
                    nameCandidate === '裁罰日期') { // 防止連續標題
                    continue; 
                }

                // 接著往下找日期
                let dateCandidate = '';
                let location = '未分類';

                for (let k = 1; k < 20; k++) { // 往下找 20 行
                    const nextLine = lines[i + k];
                    if (!nextLine) break;

                    // 如果遇到日期標題，那下一行就是日期
                    if (nextLine === '裁罰日期' || nextLine === '公告日期') {
                        const d = lines[i + k + 1];
                        if (d && /\d{3,4}[./]\d{1,2}[./]\d{1,2}/.test(d)) {
                            dateCandidate = d;
                            break;
                        }
                    }
                    // 或者直接遇到日期格式 (有些排版沒有標題)
                    if (/\d{3,4}[./]\d{1,2}[./]\d{1,2}/.test(nextLine)) {
                         dateCandidate = nextLine;
                         break;
                    }
                    
                    if (nextLine === '縣市名稱') location = lines[i + k + 1] || location;
                }

                if (nameCandidate && dateCandidate) {
                    // 去除重複
                    const exists = items.find(it => it.name === nameCandidate && it.date === dateCandidate);
                    if (!exists) {
                        items.push({ name: nameCandidate, date: dateCandidate, location });
                    }
                }
            }
        }

        console.log(`   👀 本頁發現 ${items.length} 筆資料...`);
        if (items.length > 0) {
            console.log(`   ➤ 驗證首筆: 名稱="${items[0].name}", 日期="${items[0].date}"`);
        } else {
             // 如果還是 0，印出前幾行文字來除錯，看看我們錯過什麼
             console.log("   ⚠️ 抓不到，該 Frame 的前 10 行文字內容：");
             console.log(lines.slice(0, 10));
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

        // --- 5. 翻頁 (在 Frame 內執行) ---
        const nextBtnFound = await dataFrame.evaluate(`
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
            sourceName: 'CRC (Frame+文字版)',
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

harvestFrameText();