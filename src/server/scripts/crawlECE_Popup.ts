// src/server/scripts/crawlECE_Popup.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

async function crawlECE_Popup() {
  console.log("🏫 [教育部教保網] 啟動 (上帝之手翻頁版)...");
  console.log("⚠️ 視窗會跳出，請觀察程式是否會自動「翻頁」！");

  const browser = await puppeteer.launch({
    headless: false, // 必須開啟視窗
    slowMo: 50,
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
    
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {}), 
        page.click(searchBtnSelector)
    ]);

    console.log("⏳ 搜尋已送出，正在掃描列表...");
    await page.waitForSelector('a.btn-primary', { timeout: 30000 });
    console.log("✅ 列表已出現！開始全台大掃描...");

    let hasNextPage = true;
    let pageNum = 1;

    // --- 主迴圈 ---
    while (hasNextPage) {
        // 抓取本頁資料按鈕
        const viewButtonsIds = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('a.btn-primary'));
            return btns
                .filter(b => b.innerText.trim() === '檢視')
                .map(b => b.id); 
        });

        console.log(`\n📄 [第 ${pageNum} 頁] 共有 ${viewButtonsIds.length} 間學校...`);

        // --- 子迴圈：抓取單頁資料 ---
        for (let i = 0; i < viewButtonsIds.length; i++) {
            const btnId = viewButtonsIds[i];
            
            try {
                const newTargetPromise = new Promise<any>(resolve => browser.once('targetcreated', resolve));
                
                // 這裡也用上帝之手點檢視，比較穩
                await page.evaluate((id) => {
                    const btn = document.getElementById(id);
                    if(btn) btn.click();
                }, btnId);

                const newTarget = await newTargetPromise;
                const newPage = await newTarget.page();

                if (!newPage) continue;
                await newPage.bringToFront(); 
                
                try { await newPage.waitForNetworkIdle({ timeout: 3000 }); } catch(e) {}
                try { await newPage.waitForSelector('table', { timeout: 5000 }); } catch(e) {}
                
                const penalties = await newPage.evaluate(() => {
                    const results: any[] = [];
                    const titleText = document.querySelector('h3, span#lblTitle, .title')?.textContent || '';
                    const nameFromTitle = titleText.replace('裁罰結果', '').trim();
                    const rows = document.querySelectorAll('table tr');
                    rows.forEach(row => {
                        const cells = Array.from(row.querySelectorAll('td'));
                        if (cells.length >= 6) {
                            const txtDate = cells[0]?.innerText?.trim();
                            const txtName = cells[1]?.innerText?.trim() || nameFromTitle;
                            const txtReason = cells[4]?.innerText?.trim(); 
                            const txtContent = cells[6]?.innerText?.trim(); 
                            if (txtDate && /\d/.test(txtDate)) {
                                results.push({ date: txtDate, name: txtName, reason: txtReason, content: txtContent });
                            }
                        }
                    });
                    return results;
                });

                if (penalties.length > 0) process.stdout.write("➕"); 
                else process.stdout.write(".");

                for (const item of penalties) {
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
                        }
                    } catch (e) {}
                }
                await newPage.close();
            } catch (err: any) {
                const pages = await browser.pages();
                if (pages.length > 2) await pages[pages.length - 1].close().catch(() => {});
            }
            await new Promise(r => setTimeout(r, 100));
        }

        // --- 🔥 上帝之手翻頁區 (God Mode) ---
        console.log(`\n   🔄 第 ${pageNum} 頁完成，準備執行強制翻頁...`);
        
        // 直接使用 ID 執行 click()，無視遮罩與滑鼠位置
        const nextSuccess = await page.evaluate(() => {
            const nextBtn = document.getElementById('PageControl1_lbNextPage');
            if (nextBtn) {
                // 檢查是否被禁用 (class="aspNetDisabled")
                if (nextBtn.classList.contains('aspNetDisabled')) return false;
                
                // 強制點擊！
                nextBtn.click();
                return true;
            }
            return false;
        });

        if (nextSuccess) {
            console.log("      ⚡️ 已觸發下一頁點擊 (DOM Click)，等待載入...");
            
            // 等待 PostBack 完成 (因為 URL 不會變，只能硬等 + 檢查 DOM)
            await new Promise(r => setTimeout(r, 5000)); 
            
            // 嘗試等待檢視按鈕刷新 (舊的按鈕失效，新的出現)
            try { 
                await page.waitForFunction(() => {
                     // 簡單檢查：只要頁面上還有檢視按鈕就好
                     // 更嚴謹的話可以檢查 ID 變化，但這裡先求有
                     return document.querySelectorAll('a.btn-primary').length > 0;
                }, { timeout: 10000 });
            } catch(e){}
            
            pageNum++;
        } else {
            console.log("   🏁 找不到下一頁按鈕或按鈕已停用，任務全部完成！");
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

    console.log(`\n🎉 任務圓滿結束！共新增 ${totalNewCount} 筆詳細紀錄。`);

  } catch (error: any) {
    console.error("❌ 嚴重錯誤:", error.message);
  } finally {
    console.log("⏳ 瀏覽器將關閉...");
    await browser.close();
    if (import.meta.url === `file://${process.argv[1]}`) {
        process.exit(0);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    crawlECE_Popup();
}