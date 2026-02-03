// src/server/scripts/crawlCRC_Real.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';
import { invokeLLM } from '../../../server/_core/llm';
import { fileURLToPath } from 'url'; // 確保能正確判斷執行環境
import fs from 'fs-extra'; // 🔥【修正】導入 fs-extra 模組

async function crawlCRC() {
  console.log("🛡️ [CRC 兒少裁罰] 啟動！正在為您收割全台裁罰資料 (ID 修正版)...");
  
  const browser = await puppeteer.launch({
    headless: true, // 建議背景執行
    defaultViewport: null,
    args: [
        '--start-maximized', 
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
    ]
  });

  let totalNewCount = 0;
  const startTime = new Date();

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    console.log("📄 前往 CRC 網站...");
    await page.goto('https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // --- 自動搜尋流程 ---
    console.log("🤖 執行自動搜尋...");
    
    let searchClicked = false;
    for (const frame of page.frames()) {
        const btn = await frame.$('.searchBtn') || await frame.$('input[value="查詢"]');
        if (btn) {
            await frame.evaluate(() => {
                const options = Array.from(document.querySelectorAll('option'));
                const allOption = options.find(o => o.innerText.includes('全選'));
                if (allOption && allOption.parentElement) {
                    (allOption.parentElement as HTMLSelectElement).value = allOption.value;
                    allOption.parentElement.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
            await new Promise(r => setTimeout(r, 500));
            await btn.click();
            searchClicked = true;
            break;
        }
    }
    
    if (!searchClicked) {
        const mainBtn = await page.$('.searchBtn') || await page.$('input[value="查詢"]');
        if (mainBtn) {
             await mainBtn.click();
        }
    }

    console.log("⏳ 等待資料載入 (5秒)...");
    await new Promise(r => setTimeout(r, 5000));

    // --- 開始解析與翻頁 ---
    let pageNum = 1;
    let hasNextPage = true;
    
    while (hasNextPage) {
        console.log(`\n📄 [第 ${pageNum} 頁] 掃描中...`);

        // 🔥【最終修正】使用分析出的正確選擇器，解析 div-based table
        const items = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.table.filterTable .tr:not(.thead)'));
            const data = [];
            for (const row of rows) {
                const cells = row.querySelectorAll('div[role="cell"]');
                if (cells.length >= 6) { // 確保是包含所有資訊的有效資料行
                    const location = cells[1]?.innerText.trim();
                    const name = cells[2]?.innerText.trim();
                    const date = cells[4]?.innerText.trim();
                    const reason = cells[3]?.innerText.trim();

                    if (name && date) {
                        data.push({ name, location, date, reason });
                    }
                }
            }
            return data;
        });

        console.log(`   👀 本頁發現 ${items.length} 筆資料...`);
        if (items.length === 0) {
            console.log("   ⚠️ 本頁未發現可解析的資料，可能已達末頁或頁面結構變動。");
            hasNextPage = false;
            continue;
        }
        
        if (items.length > 0) process.stdout.write("      ");

        let newThisPage = 0;

        for (const item of items) {
            try {
                let dateStr = item.date.replace(/\./g, '/');
                const parts = dateStr.split('/');
                let year = parseInt(parts[0]);
                if (year < 1911) year += 1911; // 處理民國年
                const finalDate = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                
                const uniqueId = `CRC_${item.name}_${finalDate}`;
                
                const existing = await db.select().from(cases).where(eq(cases.id, uniqueId));
                
                if (existing.length === 0) {
                    const description = `違規內容：${item.reason}`;
                    let summary = description; // 預設摘要

                    // 🔥【AI 功能禁用】已註解 AI 摘要功能
                    // try {
                    //     process.stdout.write("🧠");
                    //     const aiResult = await invokeLLM({
                    //         messages: [
                    //             { role: 'system', content: '你是一位專業的兒少安全法務專家。請根據使用者提供的裁罰內容，用台灣繁體中文，以客觀、簡潔、嚴厲的語氣，濃縮成一句話的摘要，指出最關鍵的人事時地物和違規事實。不超過50個字。' },
                    //             { role: 'user', content: `姓名: ${item.name}, 地點: ${item.location}, 內容: ${item.reason}` }
                    //         ]
                    //     });
                    //     const aiSummary = aiResult.choices[0].message.content;
                    //     if (typeof aiSummary === 'string' && aiSummary.length > 1) {
                    //         summary = aiSummary.trim();
                    //     }
                    // } catch (aiError: any) {
                    //     console.error(`\n⚠️ AI 分析失敗 (${item.name})，將使用原始描述。錯誤: ${aiError.message}`);
                    // }

                    await db.insert(cases).values({
                        id: uniqueId,
                        maskedName: item.name,
                        name: item.name,
                        originalName: item.name,
                        role: '個人/機構',
                        riskTags: '兒少權益法,裁罰',
                        location: item.location || '全台', // Fallback in case location is empty
                        caseDate: finalDate,
                        description: description,
                        summary: summary,
                        source: '衛福部裁罰', 
                        verified: true,
                    });
                    newThisPage++;
                    process.stdout.write("➕");
                } else {
                    process.stdout.write(".");
                }
            } catch (e: any) {
                console.error(`\n❌ 處理紀錄 ${item.name} 時發生錯誤:`, e.message);
            }
        }
        totalNewCount += newThisPage;
        if (newThisPage > 0) console.log("");

        console.log("   🔄 翻頁中...");
        const hasNextPageButton = await page.evaluate(() => {
            const nextButton = Array.from(document.querySelectorAll('.pagination a, .pagination button')).find(el => (el as HTMLElement).innerText.includes('下一頁'));
            if (nextButton) {
                (nextButton as HTMLElement).click();
                return true;
            }
            return false;
        });

        if (hasNextPageButton) {
            await new Promise(r => setTimeout(r, 4000)); // 等待頁面跳轉
            pageNum++;
        } else {
            console.log("   🏁 已達最後一頁。");
            hasNextPage = false;
        }
    }

    await db.insert(dataSyncLogs).values({
        syncType: 'crc',
        status: 'success',
        recordsAdded: totalNewCount,
        createdAt: startTime,
    });

    console.log(`\n🎉 CRC 爬取完成！本次新增 ${totalNewCount} 筆資料。`);

  } catch (error: any) {
    console.error("❌ CRC 錯誤:", error.message);
    await db.insert(dataSyncLogs).values({
        syncType: 'crc',
        status: 'failed',
        message: error.message,
        createdAt: startTime,
    });
  } finally {
    await browser.close();
    if (process.argv[1] === fileURLToPath(import.meta.url)) {
        process.exit(0);
    }
  }
}

// 確保可以被 import 也可以直接執行
if (process.argv[1]?.endsWith('crawlCRC_Real.ts')) {
    crawlCRC();
}

export { crawlCRC };