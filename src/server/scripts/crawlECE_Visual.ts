// src/server/scripts/crawlECE_Visual.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

async function crawlECE() {
  console.log("🏫 [教育部教保網] 啟動！(v2 智慧等待版)...");
  console.log("⚠️ 瀏覽器視窗將會跳出，請勿關閉它！");
  
  const browser = await puppeteer.launch({
    headless: false, // 讓您看得到畫面
    slowMo: 50,      // 稍微放慢速度
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
  });

  let totalNewCount = 0;

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("📄 前往教保網裁罰查詢頁面...");
    await page.goto('https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx', { waitUntil: 'domcontentloaded' });

    console.log("🤖 點擊搜尋按鈕...");
    
    // 1. 點擊搜尋 (不等待跳轉，直接點！)
    const searchBtnSelector = '#ContentPlaceHolder1_btnSearch, input[value="搜尋"]';
    await page.waitForSelector(searchBtnSelector);
    await page.click(searchBtnSelector);

    console.log("⏳ 按鈕已點擊，正在等待資料表格浮現...");

    // 🔥 2. 關鍵修正：改為等待「表格內容」出現
    // 我們等待頁面上出現 "處分日期" 字樣，或 table 元素出現
    try {
        await page.waitForFunction(() => {
            const bodyText = document.body.innerText;
            // 只要出現這幾個字，代表表格載入完成了
            return bodyText.includes('處分日期') || bodyText.includes('查無資料');
        }, { timeout: 30000 }); // 給它 30 秒慢慢跑
    } catch (e) {
        throw new Error("等待資料超時！可能是網站太慢或沒反應。");
    }

    console.log("✅ 表格已出現！開始解析...");

    // --- 開始抓資料 ---
    let hasNextPage = true;
    let pageNum = 1;

    while (hasNextPage) {
        console.log(`\n📄 [第 ${pageNum} 頁] 掃描中...`);

        // 稍微等一下 DOM 穩定
        await new Promise(r => setTimeout(r, 1000));

        const items = await page.evaluate(() => {
            const results: any[] = [];
            const rows = document.querySelectorAll('table tr');
            
            rows.forEach((row) => {
                const cells = Array.from(row.querySelectorAll('td'));
                if (cells.length >= 7) {
                    const txtDate = cells[0]?.innerText?.trim();
                    const txtName = cells[1]?.innerText?.trim();
                    const txtReason = cells[5]?.innerText?.trim(); 
                    const txtContent = cells[7]?.innerText?.trim();
                    const txtFine = cells.length > 8 ? cells[8]?.innerText?.trim() : '';
                    
                    if (txtDate && /\d/.test(txtDate) && txtName && txtName !== '幼兒園名稱') {
                        results.push({
                            date: txtDate,
                            name: txtName,
                            reason: txtReason || '違反教保條例',
                            content: txtContent + (txtFine && txtFine !== '0' ? ` (罰鍰 ${txtFine})` : '')
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
                        sourceType: 'gov_ece',
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

        // --- 翻頁 ---
        console.log("   🔄 尋找下一頁...");
        
        // 抓取下一頁按鈕
        const nextLinkFound = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('td a'));
            const nextBtn = links.find(a => a.innerText === '...' || a.innerText === '下一頁' || a.innerText === '>');
            if (nextBtn) {
                nextBtn.click(); // 直接點擊
                return true;
            }
            return false;
        });

        if (nextLinkFound) {
            // 點擊後，等待表格刷新 (稍微久一點)
            console.log("      點擊成功，等待讀取...");
            await new Promise(r => setTimeout(r, 5000));
            pageNum++;
        } else {
            console.log("   🏁 已達最後一頁。");
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

    console.log(`\n🎉 教保網爬取完成！本次新增 ${totalNewCount} 筆。`);

  } catch (error: any) {
    console.error("❌ 錯誤:", error.message);
  } finally {
    console.log("⏳ 10 秒後自動關閉...");
    await new Promise(r => setTimeout(r, 10000));
    await browser.close();
    
    if (import.meta.url === `file://${process.argv[1]}`) {
        process.exit(0);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    crawlECE();
}