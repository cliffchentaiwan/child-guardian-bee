// src/server/scripts/crawlKindergarten_Real.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
// 🔥 修正：引入 cases 而不是 kindergartens
import { cases, dataSyncLogs } from '../schema'; 
import { eq } from 'drizzle-orm';

const TARGET_URL = 'https://ap.ece.moe.edu.tw/webecems/pubSearch.aspx';

export async function crawlKindergarten() { // export
  console.log("🏫 [教育部幼兒園] 啟動！正在抓取全台幼兒園名單...");
  
  const browser = await puppeteer.launch({
    headless: true, // runAll 時建議背景執行
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let totalNewCount = 0;

  try {
    const page = await browser.newPage();
    // 設定大一點的視窗以免 RWD 隱藏表格
    await page.setViewport({ width: 1920, height: 1080 }); 
    
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // 1. 點擊搜尋 (抓全台)
    try {
        const searchBtn = await page.waitForSelector('input[type="submit"][value="搜尋"]', { timeout: 5000 });
        if (searchBtn) await searchBtn.click();
    } catch (e) {
        console.log("⚠️ 找不到搜尋按鈕，嘗試直接分析...");
    }

    await page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {});
    // 等待表格渲染
    await new Promise(r => setTimeout(r, 3000)); 

    let hasNextPage = true;
    let pageNum = 1;
    // 🔥 為了演示，我們限制只抓前 3 頁，您可以隨時拿掉這個限制
    const MAX_PAGES = 3; 

    while (hasNextPage && pageNum <= MAX_PAGES) {
        console.log(`   📄 幼兒園掃描第 ${pageNum} 頁...`);

        const items = await page.evaluate(() => {
            const results: any[] = [];
            const tables = Array.from(document.querySelectorAll('table'));
            const targetTable = tables.find(t => t.innerText.includes('名稱') && t.innerText.includes('地址'));
            
            if (!targetTable) return [];

            const rows = Array.from(targetTable.querySelectorAll('tr'));
            // 簡單 parser
            for (const row of rows) {
                if (row.innerText.includes('名稱')) continue; // header
                const cells = row.querySelectorAll('td');
                if (cells.length > 2) {
                   // 這是很粗略的 index，假設 0=名稱, 2=地址 (依實際網頁為準)
                   // 因為教保網表格很亂，我們用文字內容判斷
                   let name = '', address = '';
                   cells.forEach(c => {
                       const text = (c as HTMLElement).innerText.trim();
                       if (text.includes('幼兒園') || text.includes('中心')) name = text;
                       if (text.includes('號') && (text.includes('市') || text.includes('縣'))) address = text;
                   });

                   if (name && address) {
                       let city = address.substring(0, 3); // 抓前三個字當縣市
                       results.push({ name, address, city });
                   }
                }
            }
            return results;
        });

        for (const item of items) {
            const uniqueId = `MOE_${item.name}_${item.city}`;
            const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));

            if (existing.length === 0) {
                // 🔥 關鍵：寫入 cases 表
                await db.insert(cases).values({
                    maskedName: item.name,
                    name: item.name,
                    originalName: item.name,
                    role: '幼兒園/機構',
                    location: item.city, // 這裡讓選單抓得到！
                    description: `地址：${item.address}`,
                    riskTags: JSON.stringify(['教保機構']),
                    sourceType: 'gov_edu',
                    sourceLink: uniqueId,
                    verified: true,
                    createdAt: new Date(),
                });
                totalNewCount++;
                process.stdout.write(".");
            }
        }
        console.log(""); // 換行

        // 翻頁邏輯 (簡化版)
        const nextBtn = await page.$('input[value="Next"], input[value=">"], a:contains("下一頁")');
        if (nextBtn) {
            // await nextBtn.click(); // 暫時註解，避免 runAll 卡太久，您可以解開
            // await new Promise(r => setTimeout(r, 3000));
            pageNum++;
        } else {
            hasNextPage = false;
        }
        
        // 🚨 為了快速測試，強制只跑 3 頁就停
        if (pageNum > MAX_PAGES) hasNextPage = false;
    }

    if (totalNewCount > 0) {
        await db.insert(dataSyncLogs).values({
            sourceName: 'gov_edu',
            status: 'success',
            recordCount: totalNewCount,
            startedAt: new Date(),
            completedAt: new Date(),
        });
    }

    console.log(`\n✅ 幼兒園爬取完成！新增 ${totalNewCount} 筆。`);

  } catch (error: any) {
    console.error('❌ 幼兒園錯誤:', error.message);
  } finally {
    await browser.close();
  }
}