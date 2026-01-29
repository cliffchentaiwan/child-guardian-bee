// src/server/scripts/crawlECE_Popup.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';
import { invokeLLM } from '../../../server/_core/llm';
import { fileURLToPath } from 'url';

async function crawlECE_Popup() {
  console.log("🏫 [教育部教保網] 啟動 (AI + 日誌修正版)...");
  
  const browser = await puppeteer.launch({
    headless: false,
    slowMo: 50,
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
  });

  let totalNewCount = 0;
  const startTime = new Date();

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("📄 前往裁罰查詢頁面...");
    await page.goto('https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx', { waitUntil: 'domcontentloaded' });

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

    while (hasNextPage) {
        const viewButtonsIds = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('a.btn-primary'));
            return btns.filter(b => b.innerText.trim() === '檢視').map(b => b.id); 
        });

        console.log(`\n📄 [第 ${pageNum} 頁] 共有 ${viewButtonsIds.length} 間學校...`);
        if (viewButtonsIds.length > 0) process.stdout.write("      ");

        for (let i = 0; i < viewButtonsIds.length; i++) {
            const btnId = viewButtonsIds[i];
            
            try {
                const newTargetPromise = new Promise<any>(resolve => browser.once('targetcreated', resolve));
                await page.evaluate((id) => { document.getElementById(id)?.click(); }, btnId);
                const newTarget = await newTargetPromise;
                const newPage = await newTarget.page();

                if (!newPage) {
                    process.stdout.write("❓");
                    continue;
                }
                
                await newPage.bringToFront(); 
                try { await newPage.waitForSelector('table', { timeout: 5000 }); } catch(e) {}
                
                const penalties = await newPage.evaluate(() => {
                    const results: any[] = [];
                    const titleText = document.querySelector('h3, span#lblTitle, .title')?.textContent || '';
                    const nameFromTitle = titleText.replace('裁罰結果', '').trim();
                    document.querySelectorAll('table tr').forEach(row => {
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

                if (penalties.length === 0) {
                   process.stdout.write("▫️");
                }

                for (const item of penalties) {
                    try {
                        let dateStr = item.date;
                        const parts = dateStr.split('/');
                        let year = parseInt(parts[0]);
                        if (year < 1911) year += 1911;
                        const finalDate = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                        const uniqueId = `ECE_${item.name}_${finalDate}`;
                        
                        const existing = await db.select().from(cases).where(eq(cases.id, uniqueId));
                        
                        if (existing.length === 0) {
                            const description = `[${item.reason}] ${item.content}`;
                            let summary = description;

                            try {
                                process.stdout.write("🧠");
                                const aiResult = await invokeLLM({
                                    messages: [
                                        { role: 'system', content: '你是一位專業的兒少安全法務專家。請根據使用者提供的幼兒園裁罰內容，用台灣繁體中文，以客觀、簡潔、嚴厲的語氣，濃縮成一句話的摘要，指出最關鍵的違規事實。不超過50個字。' },
                                        { role: 'user', content: `幼兒園名稱: ${item.name}, 裁罰內容: ${description}` }
                                    ]
                                });
                                const aiSummary = aiResult.choices[0].message.content;
                                if (typeof aiSummary === 'string' && aiSummary.length > 1) {
                                    summary = aiSummary.trim();
                                }
                            } catch (aiError: any) {
                                console.error(`\n⚠️ AI 分析失敗 (${item.name})，將使用原始描述。錯誤: ${aiError.message}`);
                            }

                            await db.insert(cases).values({
                                id: uniqueId,
                                maskedName: item.name,
                                name: item.name,
                                originalName: item.name,
                                role: '幼兒園',
                                riskTags: '教育部裁罰',
                                location: '全台', 
                                caseDate: finalDate,
                                description: description,
                                summary: summary,
                                source: '教保網',
                                verified: true,
                            });
                            totalNewCount++;
                            process.stdout.write("➕");
                        } else {
                            process.stdout.write(".");
                        }
                    } catch (dbError: any) {
                        console.error(`\n❌ 處理紀錄 ${item.name} 時DB發生錯誤:`, dbError.message);
                    }
                }
                await newPage.close();
            } catch (pageError: any) {
                console.error(`\n❌ 處理彈出視窗時發生錯誤:`, pageError.message);
                const pages = await browser.pages();
                if (pages.length > 2) await pages[pages.length - 1].close().catch(() => {});
            }
        }
        console.log(""); 

        console.log(`   🔄 第 ${pageNum} 頁完成，準備翻頁...`);
        const nextSuccess = await page.evaluate(() => {
            const nextBtn = document.getElementById('PageControl1_lbNextPage');
            if (nextBtn && !nextBtn.classList.contains('aspNetDisabled')) {
                nextBtn.click();
                return true;
            }
            return false;
        });

        if (nextSuccess) {
            console.log("      ⚡️ 已觸發下一頁，等待載入...");
            await new Promise(r => setTimeout(r, 5000));
            try { 
                await page.waitForFunction(() => document.querySelectorAll('a.btn-primary').length > 0, { timeout: 10000 });
            } catch(e){}
            pageNum++;
        } else {
            console.log("   🏁 找不到下一頁按鈕或已達最後一頁，任務完成！");
            hasNextPage = false;
        }
    }

    await db.insert(dataSyncLogs).values({
        syncType: 'ece',
        status: 'success',
        recordsAdded: totalNewCount,
        createdAt: startTime,
    });
    console.log(`\n🎉 任務圓滿結束！共新增 ${totalNewCount} 筆詳細紀錄。`);

  } catch (error: any) {
    console.error("❌ 嚴重錯誤:", error.message);
    await db.insert(dataSyncLogs).values({
        syncType: 'ece',
        status: 'failed',
        message: error.message,
        createdAt: startTime,
    });
  } finally {
    console.log("⏳ 瀏覽器將關閉...");
    await browser.close();
    if (process.argv[1] === fileURLToPath(import.meta.url)) {
        process.exit(0);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    crawlECE_Popup();
}