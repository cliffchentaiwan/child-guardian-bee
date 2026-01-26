// src/server/scripts/crawlECE_Deep.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

async function crawlECE_Deep() {
  console.log("🏫 [教育部教保網] 啟動深層挖掘模式 (List -> Detail)...");
  console.log("⚠️ 視窗會跳出，請觀察它「點進去 -> 抓資料 -> 退出來」的動作！");

  const browser = await puppeteer.launch({
    headless: false, // 讓您看得到
    slowMo: 50,      // 動作放慢
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
  });

  let totalNewCount = 0;

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("📄 前往裁罰查詢頁面...");
    await page.goto('https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx', { waitUntil: 'domcontentloaded' });

    // 1. 點擊搜尋
    console.log("🤖 點擊搜尋...");
    const searchBtnSelector = '#ContentPlaceHolder1_btnSearch, input[value="搜尋"]';
    await page.waitForSelector(searchBtnSelector);
    await page.click(searchBtnSelector);

    // 2. 等待「檢視」按鈕出現 (代表清單載入完成)
    console.log("⏳ 等待搜尋結果清單...");
    try {
        // 等待 class 為 btn-view 或 value 為 "檢視" 的按鈕
        await page.waitForFunction(() => {
            const inputs = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"]'));
            return inputs.some(i => i.value === '檢視');
        }, { timeout: 20000 });
    } catch (e) {
        throw new Error("搜尋後找不到「檢視」按鈕，可能無資料或網站改版。");
    }

    console.log("✅ 清單載入完成！開始逐一鑽孔抓取...");

    // 3. 處理分頁迴圈 (先做第1頁示範)
    let hasNextPage = true;
    let pageNum = 1;

    while (hasNextPage) {
        console.log(`\n📄 [第 ${pageNum} 頁] 開始掃描...`);
        
        // 抓取這一頁所有的「檢視」按鈕數量
        // 注意：我們不能先把按鈕存起來，因為點進去再回來，DOM 會刷新，舊按鈕會失效。
        // 所以策略是：每次都重新算有幾個按鈕，依序點第 i 個。
        const itemsCount = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"]'));
            return inputs.filter(i => i.value === '檢視').length;
        });

        console.log(`   👀 本頁共有 ${itemsCount} 間學校需查看...`);

        for (let i = 0; i < itemsCount; i++) {
            // --- 步驟 A: 點擊「檢視」 ---
            console.log(`      👉 正在查看第 ${i + 1} / ${itemsCount} 間...`);
            
            // 重新抓取第 i 個按鈕 (因為頁面可能刷新過)
            const clickSuccess = await page.evaluate((index) => {
                const inputs = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"]'));
                const viewBtns = inputs.filter(i => i.value === '檢視');
                if (viewBtns[index]) {
                    viewBtns[index].click();
                    return true;
                }
                return false;
            }, i);

            if (!clickSuccess) continue;

            // --- 步驟 B: 等待詳細表格出現 ---
            try {
                // 等待 "裁罰結果" 或 "處分日期" 出現
                await page.waitForFunction(() => document.body.innerText.includes('處分日期'), { timeout: 10000 });
            } catch (e) {
                console.log("      ⚠️ 點進去了但沒看到表格，跳過。");
                // 嘗試點「關閉」回到列表
                await tryClickClose(page);
                continue;
            }

            // --- 步驟 C: 抓取表格資料 ---
            const penalties = await page.evaluate(() => {
                const results: any[] = [];
                // 這裡的表格結構通常是：日期 | 園名 | 文號 | ... | 處分內容
                const rows = document.querySelectorAll('table tr');
                rows.forEach(row => {
                    const cells = Array.from(row.querySelectorAll('td'));
                    if (cells.length >= 6) { // 確保欄位夠多
                        const txtDate = cells[0]?.innerText?.trim();
                        const txtName = cells[1]?.innerText?.trim(); // 處分時園名
                        const txtReason = cells[4]?.innerText?.trim(); // 違反規定
                        const txtContent = cells[6]?.innerText?.trim(); // 處分內容 (有時在 index 6 或 7)
                        
                        // 簡單過濾標題列
                        if (txtDate && /\d/.test(txtDate) && txtName) {
                            results.push({ date: txtDate, name: txtName, reason: txtReason, content: txtContent });
                        }
                    }
                });
                return results;
            });

            // --- 步驟 D: 寫入資料庫 ---
            if (penalties.length > 0) process.stdout.write("      💾 發現紀錄: ");
            for (const item of penalties) {
                try {
                    // 日期處理
                    let dateStr = item.date;
                    const parts = dateStr.split('/');
                    let year = parseInt(parts[0]);
                    if (year < 1911) year += 1911;
                    const finalDate = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                    
                    const uniqueId = `ECE_${item.name}_${finalDate}`;
                    const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));
                    
                    if (existing.length === 0) {
                        await db.insert(cases).values({
                            maskedName: item.name,
                            name: item.name,
                            originalName: item.name,
                            role: '幼兒園',
                            riskTags: JSON.stringify(['教育部裁罰']),
                            location: '全台', 
                            caseDate: finalDate,
                            description: `[${item.reason}] ${item.content}`,
                            sourceType: 'gov_ece',
                            sourceLink: uniqueId,
                            verified: true,
                            createdAt: new Date(),
                        });
                        totalNewCount++;
                        process.stdout.write("➕");
                    } else {
                        process.stdout.write(".");
                    }
                } catch (e) {}
            }
            console.log(""); // 換行

            // --- 步驟 E: 點擊「關閉」回到清單 ---
            await tryClickClose(page);
            
            // 等待清單重新浮現 (檢視按鈕回來了)
            await page.waitForFunction(() => {
                const inputs = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"]'));
                return inputs.some(i => i.value === '檢視');
            }, { timeout: 10000 });
        }

        // --- 處理翻頁 (示範抓第一頁即可，若要抓全部請解開下面註解) ---
        /*
        console.log("   🔄 尋找下一頁...");
        // 翻頁邏輯...
        */
        console.log("   🏁 目前僅示範抓取第 1 頁 (包含多筆詳細資料)。");
        hasNextPage = false; 
    }

    if (totalNewCount >= 0) {
        await db.insert(dataSyncLogs).values({
            sourceName: 'gov_ece',
            status: 'success',
            recordCount: totalNewCount,
            startedAt: new Date(),
            completedAt: new Date(),
        });
    }

    console.log(`\n🎉 深層挖掘完成！共新增 ${totalNewCount} 筆詳細裁罰紀錄。`);

  } catch (error: any) {
    console.error("❌ 發生錯誤:", error.message);
  } finally {
    console.log("⏳ 10 秒後關閉視窗...");
    await new Promise(r => setTimeout(r, 10000));
    await browser.close();
    if (import.meta.url === `file://${process.argv[1]}`) {
        process.exit(0);
    }
  }
}

// 輔助函式：點擊「關閉」
async function tryClickClose(page: any) {
    await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"]'));
        const closeBtn = inputs.find(i => i.value === '關閉' || i.value === 'Close');
        if (closeBtn) closeBtn.click();
    });
}

if (import.meta.url === `file://${process.argv[1]}`) {
    crawlECE_Deep();
}