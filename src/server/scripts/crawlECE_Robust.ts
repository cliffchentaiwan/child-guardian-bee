// src/server/scripts/crawlECE_Robust.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';

async function crawlECE() {
  console.log("🏫 [教育部教保網] 啟動！(強壯版)...");
  
  const browser = await puppeteer.launch({
    headless: true, // 如果想看瀏覽器動作，改成 false
    defaultViewport: { width: 1280, height: 800 }, // 設定大一點的視窗，避免按鈕被遮住
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let totalNewCount = 0;

  try {
    const page = await browser.newPage();
    
    // 偽裝成真人瀏覽器
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("📄 前往教保網裁罰查詢頁面...");
    await page.goto('https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx', { waitUntil: 'networkidle0', timeout: 60000 });

    // --- 1. 搜尋階段 ---
    console.log("🤖 嘗試點擊搜尋...");
    
    // 截圖確保有進去
    // await page.screenshot({ path: 'debug_step1_entry.png' });

    // 嘗試多種方式抓按鈕
    const searchSuccess = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('input[type="submit"], button'));
        const target = btns.find(b => b.value === '搜尋' || b.innerText.includes('搜尋'));
        if (target) {
            target.click();
            return true;
        }
        return false;
    });

    if (!searchSuccess) {
        throw new Error("找不到搜尋按鈕！");
    }

    console.log("⏳ 搜尋點擊成功，等待資料表格浮現 (最多等 15 秒)...");
    
    // 🔥 關鍵修正：不依賴 CSS Class，而是等待「文字」出現
    // 我們等待頁面上出現 "處分日期" 這幾個字，這代表表格出來了
    try {
        await page.waitForFunction(
            () => document.body.innerText.includes('處分日期'),
            { timeout: 15000 }
        );
    } catch (e) {
        console.log("⚠️ 等待超時，截圖 debug_error.png");
        await page.screenshot({ path: 'debug_error.png' });
        throw new Error("資料載入失敗，請查看 debug_error.png");
    }

    // --- 2. 抓取資料階段 ---
    let hasNextPage = true;
    let pageNum = 1;

    while (hasNextPage) {
        console.log(`\n📄 [第 ${pageNum} 頁] 掃描中...`);

        // 解析資料 (通用表格抓取法)
        const items = await page.evaluate(() => {
            const results: any[] = [];
            // 抓所有 tr
            const rows = document.querySelectorAll('tr');
            
            rows.forEach((row) => {
                const cells = Array.from(row.querySelectorAll('td'));
                // 教保網資料列特徵：大於 5 個欄位，且第一個欄位看起來像日期
                if (cells.length > 5) {
                    const txt0 = cells[0]?.innerText?.trim();
                    const txt1 = cells[1]?.innerText?.trim();
                    
                    // 驗證：第一欄必須包含數字 (日期)，且不是標題列
                    if (txt0 && /\d/.test(txt0) && txt1 && txt1 !== '幼兒園名稱') {
                        // 嘗試智慧對應欄位 (因為順序可能會變)
                        // 通常：日期, 名稱, 縣市, 文號, 依據, 規定, 負責人, 處分內容, 罰鍰
                        const fine = cells.length > 8 ? cells[8].innerText.trim() : '';
                        
                        results.push({
                            date: txt0,
                            name: txt1,
                            reason: cells[5]?.innerText?.trim() || '違反教保條例',
                            content: cells[7]?.innerText?.trim() + (fine ? ` (罰鍰 ${fine})` : '')
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
                // 日期處理 (112/01/01 -> 2023-01-01)
                let dateStr = item.date;
                const parts = dateStr.split('/');
                let year = parseInt(parts[0]);
                if (year < 1911) year += 1911; // 民國轉西元
                const finalDate = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                
                const uniqueId = `ECE_${item.name}_${finalDate}`;
                
                // 檢查是否已存在
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

        // --- 3. 翻頁階段 ---
        console.log("   🔄 尋找下一頁...");
        const nextSuccess = await page.evaluate(() => {
            // 找包含 "..." 或 "下一頁" 或 ">" 的連結
            const links = Array.from(document.querySelectorAll('td a'));
            
            // 策略：找到當前頁碼 (通常是紅色或不可點的)，然後找它後面的那個數字
            // 這裡用簡單策略：找 innerText 為 ">" 或 "..."
            const nextBtn = links.find(a => a.innerText === '...' || a.innerText === '下一頁' || a.innerText === '>');
            
            if (nextBtn) {
                nextBtn.click();
                return true;
            }
            return false;
        });

        if (nextSuccess) {
            // ASP.NET PostBack 需要時間，這裡等久一點比較保險
            await new Promise(r => setTimeout(r, 6000));
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

    console.log(`\n🎉 教保網強壯版爬取完成！本次新增 ${totalNewCount} 筆。`);

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