// src/server/scripts/crawlCRC_Ultimate.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

const TARGET_URL = 'https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction';

async function harvestFrameTextCombined() {
  console.log("🔥 啟動 CRC 爬蟲 (Frame鎖定 + 純文字吸取版)...");
  
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

    // --- 1. 操作主頁面 (全選 -> 搜尋) ---
    console.log("🤖 正在操作主頁面...");
    let controlFrame = page.mainFrame();
    
    for (const frame of page.frames()) {
        const hasBtn = await frame.evaluate(() => !!document.querySelector('.searchBtn'));
        if (hasBtn) {
            controlFrame = frame;
            break;
        }
    }

    // 使用純字串注入，避免 TS 錯誤
    await controlFrame.evaluate(`
      (() => {
        const options = Array.from(document.querySelectorAll('option'));
        const allOption = options.find(o => o.innerText.includes('全選'));
        if (allOption && allOption.parentElement) {
            const select = allOption.parentElement;
            select.value = allOption.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const btn = document.querySelector('.searchBtn') || 
                    Array.from(document.querySelectorAll('input[type="submit"]')).find(b => b.value === '查詢');
        if (btn) btn.click();
      })()
    `);

    console.log("⏳ 等待資料載入 (約 5 秒)...");
    await new Promise(r => setTimeout(r, 5000));

    // --- 2. 尋找資料所在的 Frame ---
    console.log("🕵️ 正在鎖定資料 Frame...");
    let dataFrame = null;

    // 策略: 找內容有關鍵字的 Frame
    for (const frame of page.frames()) {
        try {
            const text = await frame.evaluate(() => document.body.innerText);
            if (text.includes('裁罰對象') || text.includes('裁罰日期') || text.includes('縣市名稱')) {
                dataFrame = frame;
                console.log(`   ✅ 透過關鍵字鎖定 Frame: ${frame.url()}`);
                break;
            }
        } catch (e) { }
    }

    if (!dataFrame) {
        console.log("⚠️ 找不到特定 Frame，使用主頁面嘗試...");
        dataFrame = page.mainFrame();
    }

    // --- 3. 開始吸取資料 ---
    let hasNextPage = true;
    let pageNum = 1;

    while (hasNextPage) {
        console.log(`\n📄 正在掃描第 ${pageNum} 頁...`);

        // 直接抓取該 Frame 的純文字
        const rawText = await dataFrame.evaluate<string>(`document.body.innerText`);
        const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

        const items: any[] = [];
        
        // 解析邏輯
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 觸發點：看到「裁罰對象」或「姓名」
            if (line === '裁罰對象' || line === '姓名') {
                const nameCandidate = lines[i + 1];

                if (!nameCandidate || 
                    nameCandidate === '全部' || 
                    nameCandidate === '行為人' || 
                    nameCandidate === '請選擇' || 
                    nameCandidate.includes('名稱') ||
                    nameCandidate === '裁罰日期') {
                    continue; 
                }

                let dateCandidate = '';
                let location = '未分類';
                let reason = '';

                // 往下掃描 20 行找日期
                for (let k = 1; k < 20; k++) {
                    const nextLine = lines[i + k];
                    if (!nextLine) break;

                    if (/\d{3,4}[./]\d{1,2}[./]\d{1,2}/.test(nextLine)) {
                         dateCandidate = nextLine;
                         // 通常日期下面是原因
                         reason = lines[i + k + 1] || '';
                         break;
                    }
                    if (nextLine === '縣市名稱') location = lines[i + k + 1] || location;
                }

                if (nameCandidate && dateCandidate) {
                    const exists = items.find(it => it.name === nameCandidate && it.date === dateCandidate);
                    if (!exists) {
                        items.push({ name: nameCandidate, date: dateCandidate, location, reason });
                    }
                }
            }
        }

        console.log(`   👀 本頁發現 ${items.length} 筆資料...`);

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
                            description: `違規事由：${item.reason}`,
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

        // --- 5. 翻頁 ---
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

harvestFrameTextCombined();