// src/server/scripts/crawlJudicial_Real.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
// ✅ 確保引用正確的 SQLite db
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

const JUDICIAL_URL = 'https://judgment.judicial.gov.tw/FJUD/default.aspx';

export async function crawlJudicial() {
  console.log("⚖️ [司法院判決] 啟動！需手動輸入驗證碼...");
  
  const browser = await puppeteer.launch({
    headless: false, // ⚠️ 必須開啟視窗讓您輸入驗證碼
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox'] 
  });

  let totalCount = 0;

  try {
    const page = await browser.newPage();
    // 偽裝成一般瀏覽器
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("📄 前往司法院查詢系統...");
    await page.goto(JUDICIAL_URL, { waitUntil: 'networkidle2' });

    // 嘗試自動填寫關鍵字 (如果失敗也沒關係，您可以手動填)
    try { await page.type('#txtKW', "兒童及少年福利與權益保障法"); } catch(e) {}

    // ⏳ 等待您輸入驗證碼 (60秒)
    console.log("\n👇👇👇 [重要操作] 👇👇👇");
    console.log("1. 請在跳出的瀏覽器視窗中，確認關鍵字已輸入。");
    console.log("2. 手動輸入圖片驗證碼。");
    console.log("3. 按下「查詢」按鈕。");
    console.log("⏳ 程式將等待 60 秒，請在時間內完成...");
    
    // 倒數計時
    for(let i=60; i>0; i-=5) {
        process.stdout.write(`還剩 ${i} 秒... `);
        await new Promise(r => setTimeout(r, 5000));
    }
    console.log("\n⚡️ 時間到！假設您已按下查詢，程式接手處理...");

    // --- 開始解析資料 ---
    let hasNextPage = true;
    let pageNum = 1;

    while (hasNextPage) {
        console.log(`\n📄 正在掃描第 ${pageNum} 頁...`);
        let targetFrame = null;
        
        // 尋找包含資料的 Frame
        for (const frame of page.frames()) {
            try {
                // 檢查 frame 裡面有沒有 "裁判字號" 這種關鍵字
                const text = await frame.evaluate(() => document.body.innerText).catch(() => '');
                if (text.includes('裁判字號') || text.includes('裁判日期')) {
                    targetFrame = frame;
                    break;
                }
            } catch (e) {}
        }

        if (!targetFrame) {
            console.error("❌ 找不到資料列表！(可能是驗證碼錯誤、逾時，或沒有資料)");
            console.log("💡 請重新執行程式，並確保在 60 秒內完成查詢。");
            break; 
        }

        // 抓取列表
        const items = await targetFrame.evaluate(() => {
            const results: any[] = [];
            // 司法院的列表通常是用 table 或 div 組成，這邊抓取連結
            const titleLinks = document.querySelectorAll('a[id="hlTitle"]');
            
            titleLinks.forEach(link => {
                try {
                    const title = (link as HTMLElement).innerText.trim();
                    const titleRow = link.closest('tr');
                    if (!titleRow) return;
                    
                    const cells = titleRow.querySelectorAll('td');
                    // 通常第3格是日期
                    const date = cells[2]?.innerText.trim(); 
                    // 摘要通常在下一列
                    const snippetRow = titleRow.nextElementSibling;
                    const snippet = snippetRow ? (snippetRow as HTMLElement).innerText.trim() : '';

                    if (title && date) {
                        results.push({ title, date, snippet });
                    }
                } catch (e) { }
            });
            return results;
        });

        console.log(`   👀 本頁發現 ${items.length} 筆，寫入資料庫...`);

        // 寫入 DB
        for (const item of items) {
            // 日期轉換 (處理 112.01.01 這種民國年格式)
            let dateStr = item.date;
            try {
                if (dateStr.includes('.')) {
                    const parts = dateStr.split('.');
                    const year = parseInt(parts[0]) + 1911;
                    dateStr = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                } else if (dateStr.length === 7) {
                     const year = parseInt(dateStr.substring(0, 3)) + 1911;
                     dateStr = `${year}-${dateStr.substring(3, 5)}-${dateStr.substring(5, 7)}`;
                }
            } catch(e) { dateStr = new Date().toISOString(); }

            const uniqueId = `JUDICIAL_${item.title.replace(/\s/g, '')}`;
            
            // 檢查是否已存在
            const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));
            
            if (existing.length === 0) {
                await db.insert(cases).values({
                    maskedName: item.title, // 判決書標題通常包含名字，或隱碼
                    name: item.title,
                    originalName: item.title,
                    role: '司法判決',
                    riskTags: JSON.stringify(['判決書', '兒少法']),
                    location: '全台', // 判決書較難自動判斷縣市，先設全台
                    caseDate: dateStr, // 使用格式化後的日期
                    description: item.snippet, // 判決摘要
                    sourceType: 'judicial',
                    sourceLink: uniqueId,
                    verified: true,
                    createdAt: new Date(),
                });
                process.stdout.write("."); 
                totalCount++;
            }
        }
        console.log(""); 

        // 翻頁邏輯
        const nextBtnHandle = await targetFrame.$('#hlNext');
        if (nextBtnHandle) {
            const isDisabled = await targetFrame.evaluate(el => el.getAttribute('disabled') !== null || el.classList.contains('aspNetDisabled'), nextBtnHandle);
            if (!isDisabled) {
                await Promise.all([ 
                    nextBtnHandle.click(), 
                    new Promise(r => setTimeout(r, 3000)) // 等待載入
                ]);
                pageNum++;
            } else {
                console.log("   🏁 按鈕失效 (Disabled)，已到達最後一頁。");
                hasNextPage = false;
            }
        } else {
            console.log("   🏁 無下一頁按鈕，結束。");
            hasNextPage = false;
        }
    }

    if (totalCount > 0) {
        await db.insert(dataSyncLogs).values({
          sourceName: 'gov_judicial',
          status: 'success',
          recordCount: totalCount,
          startedAt: new Date(),
          completedAt: new Date(),
        });
    }
    console.log(`\n🎉 判決書任務完成！共新增 ${totalCount} 筆資料。`);

  } catch (error: any) {
    console.error("❌ 發生錯誤:", error.message);
  } finally {
    await browser.close();
    // 不要在這裡強制 exit，如果是被 import 呼叫的話
  }
}

// 🔥 修正：使用 ES Module 的方式判斷是否直接執行
if (import.meta.url === `file://${process.argv[1]}`) {
    crawlJudicial().then(() => process.exit(0));
}