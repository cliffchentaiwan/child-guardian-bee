// src/server/scripts/crawlECE_Real.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

async function crawlECE() {
  console.log("🏫 [教育部教保網] 啟動！正在鎖定全台「違規」幼兒園...");
  
  // 啟動瀏覽器
  const browser = await puppeteer.launch({
    headless: true, // 想看它操作可以改成 false
    defaultViewport: null,
    args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
    ]
  });

  let totalNewCount = 0;

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("📄 前往教保網裁罰查詢頁面...");
    await page.goto('https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx', { waitUntil: 'networkidle0', timeout: 60000 });

    // 🔥 修正重點：使用更穩定的選擇器
    console.log("🤖 點擊搜尋按鈕，抓取全台資料...");
    try {
        // 教保網的搜尋按鈕 id 通常是 ContentPlaceHolder1_btnSearch
        // 這裡用更通用的寫法：找 value="搜尋" 的 input
        const searchBtn = await page.$('input[value="搜尋"]');
        
        if (searchBtn) {
            await searchBtn.click();
            console.log("⏳ 等待資料載入 (5秒)...");
            await new Promise(r => setTimeout(r, 5000));
        } else {
            // 備用方案：如果上面找不到，試試看 id
            const btnById = await page.$('#ContentPlaceHolder1_btnSearch');
            if (btnById) {
                await btnById.click();
                await new Promise(r => setTimeout(r, 5000));
            } else {
                throw new Error("找不到搜尋按鈕，網頁結構可能改變");
            }
        }
    } catch (e) {
        console.error("❌ 搜尋失敗:", e);
        return;
    }

    // 2. 開始爬取表格與翻頁
    let hasNextPage = true;
    let pageNum = 1;

    while (hasNextPage) {
        console.log(`\n📄 [第 ${pageNum} 頁] 掃描中...`);

        // 等待表格出現
        try {
            await page.waitForSelector('table.table-striped', { timeout: 5000 });
        } catch(e) {
            console.log("⚠️ 找不到表格，可能無資料或載入慢");
        }

        // 解析表格資料
        const items = await page.evaluate(() => {
            const results: any[] = [];
            // 教保網的表格 class 通常是 table table-bordered table-striped
            const rows = document.querySelectorAll('table.table-striped tr');
            
            rows.forEach((row) => {
                const cells = row.querySelectorAll('td');
                // 欄位順序：[0]處分日期, [1]處分時園名, [2]縣市, [3]裁處文號, [4]處分依據, [5]違反規定, [6]負責人, [7]處分內容, [8]罰鍰
                if (cells.length >= 7) {
                    const date = cells[0]?.innerText?.trim();
                    const name = cells[1]?.innerText?.trim();
                    const reason = cells[5]?.innerText?.trim(); // 違反規定
                    const content = cells[7]?.innerText?.trim(); // 處分內容
                    const fine = cells[8]?.innerText?.trim(); // 罰鍰

                    // 驗證日期格式 (例如 112/01/01)
                    if (date && date.match(/^\d{2,3}\/\d{2}\/\d{2}$/) && name) {
                         results.push({
                            date,
                            name,
                            // 組合處分內容：罰鍰 + 處分
                            content: `罰鍰：${fine || '0'} 元。${content || ''}`,
                            reason: reason || '違反教保條例'
                        });
                    }
                }
            });
            return results;
        });

        console.log(`   👀 本頁發現 ${items.length} 筆違規紀錄...`);
        let newThisPage = 0;

        for (const item of items) {
            try {
                // 日期轉換 (民國年 -> 西元年)
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
                        role: '幼兒園/教保機構',
                        riskTags: JSON.stringify(['教育部裁罰', '行政違規']),
                        location: '全台', 
                        caseDate: finalDate,
                        description: `[${item.reason}] ${item.content}`,
                        sourceType: 'gov_ece', // 🔥 標記為教保網來源
                        sourceLink: uniqueId,
                        verified: true,
                        createdAt: new Date(),
                    });
                    newThisPage++;
                    process.stdout.write("➕");
                } else {
                    process.stdout.write(".");
                }
            } catch (e) {}
        }
        console.log("");
        totalNewCount += newThisPage;

        // 3. 處理翻頁 (教保網通常用 doPostBack，puppeteer 可以直接點)
        console.log("   🔄 嘗試翻頁...");
        const nextSuccess = await page.evaluate(() => {
            // 找包含 "..." 或 "下一頁" 的連結
            // 教保網的分頁通常是一排 <a> 標籤，最後會有一個 "..." 代表下一組
            // 或者找當前頁碼 + 1 的連結
            
            // 策略：找 class="AspNet-Pager-CurrentPage" 的下一個兄弟節點
            const current = document.querySelector('.AspNet-Pager-CurrentPage');
            if (current) {
                // 如果當前頁是 span (不能點)，找下一個 a 標籤
                // 注意：教保網結構可能有變，這裡用更通用的方式：找 href 包含 Page$當前頁+1
                // 這裡簡化策略：直接找 innerText 為 ">" 或 "..." 的
                const links = Array.from(document.querySelectorAll('td a'));
                const nextBtn = links.find(a => a.innerText === '...' || a.innerText === '下一頁' || a.innerText === '>');
                
                if (nextBtn) {
                    nextBtn.click();
                    return true;
                }
            }
            // 如果找不到，試試看有沒有下一頁的數字 (例如現在是 1，找 2)
            // 這裡為了穩定，如果抓不到簡單的翻頁鈕，就視為結束 (或需更複雜邏輯)
            return false;
        });

        if (nextSuccess) {
            await new Promise(r => setTimeout(r, 5000)); // 等待久一點
            pageNum++;
        } else {
            console.log("   🏁 已達最後一頁或找不到翻頁按鈕。");
            hasNextPage = false;
        }
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

    console.log(`\n🎉 教保網違規資料爬取完成！本次新增 ${totalNewCount} 筆。`);

  } catch (error: any) {
    console.error("❌ 爬蟲錯誤:", error.message);
  } finally {
    await browser.close();
    if (import.meta.url === `file://${process.argv[1]}`) {
        process.exit(0);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    crawlECE();
}