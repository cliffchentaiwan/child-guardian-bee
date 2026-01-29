// src/server/scripts/crawlJudicial_Real.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';
import { invokeLLM } from '../../../server/_core/llm';

const JUDICIAL_URL = 'https://judgment.judicial.gov.tw/FJUD/default.aspx';

export async function crawlJudicial() {
  console.log("⚖️ [司法院判決] 啟動！(鎖定 iframe-data 版)");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox'] 
  });

  let totalCount = 0;

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("📄 前往司法院查詢系統...");
    await page.goto(JUDICIAL_URL, { waitUntil: 'networkidle2' });

    // 自動填寫
    try { await page.type('#txtKW', "兒童及少年福利與權益保障法"); } catch(e) {}

    console.log("\n👇👇👇 [重要操作] 👇👇👇");
    console.log("1. 請手動輸入驗證碼。");
    console.log("2. 按下「查詢」。");
    console.log("⏳ 等待 60 秒... (請確保看到列表出現)");
    
    // 經典倒數
    for(let i=60; i>0; i-=5) {
        process.stdout.write(`還剩 ${i} 秒... `);
        await new Promise(r => setTimeout(r, 5000));
    }
    console.log("\n⚡️ 時間到！開始鎖定資料框架...");

    // 🔥 關鍵修正：直接尋找名為 "iframe-data" 的框架
    let targetFrame = page.frames().find(f => f.name() === 'iframe-data');
    
    if (!targetFrame) {
        console.log("⚠️ 找不到 'iframe-data' 框架，嘗試重新搜尋...");
        // 雙重保險：有時候名稱會變，改用 URL 特徵找
        targetFrame = page.frames().find(f => f.url().includes('qryresultlst.aspx'));
    }

    if (!targetFrame) {
        console.error("❌ 嚴重錯誤：完全找不到資料所在的 iframe！");
        console.log("   可能原因：查詢未成功、還在首頁、或驗證碼錯誤。");
        await browser.close();
        return;
    }

    console.log(`✅ 成功鎖定資料框架: ${targetFrame.url()}`);

    // --- 開始解析 ---
    let hasNextPage = true;
    let pageNum = 1;

    while (hasNextPage) {
        console.log(`\n📄 正在掃描第 ${pageNum} 頁...`);
        
        // 🔥 寬容模式：抓取所有表格行，不依賴特定 class
        // 我們在 iframe 裡找所有的 tr，然後過濾出像樣的資料
        const newCases = await targetFrame.evaluate(() => {
            const results: any[] = [];
            const rows = document.querySelectorAll('tr'); // 抓所有列

            rows.forEach(row => {
                const links = row.querySelectorAll('a');
                // 邏輯：如果這一行有超連結，且連結裡有 'FJUD' 字樣，通常就是判決書連結
                links.forEach(link => {
                    const href = link.getAttribute('href');
                    const title = link.innerText.trim();
                    
                    if (href && (href.includes('FJUD') || href.includes('data.aspx')) && title.length > 5) {
                        // 嘗試找日期 (通常在同一列的某個 td)
                        let date = '';
                        const cells = row.querySelectorAll('td');
                        cells.forEach(cell => {
                            const txt = cell.innerText.trim();
                            // 簡單的正則判斷日期格式 112.01.01
                            if (txt.match(/\d{2,3}\.\d{1,2}\.\d{1,2}/)) {
                                date = txt;
                            }
                        });

                        results.push({
                            title: title,
                            href: href,
                            date: date
                        });
                    }
                });
            });
            return results;
        });

        if (newCases.length === 0) {
            console.log("⚠️ 本頁無資料 (或選擇器未命中)。");
            break;
        }

        console.log(`   👀 本頁發現 ${newCases.length} 筆，寫入資料庫...`);
        if (newCases.length > 0) process.stdout.write("      ");

        // 寫入 Neon 資料庫
        for (const c of newCases) {
            try {
                // 日期格式化
                let dateStr = c.date;
                try {
                    const match = c.date.match(/(\d+)\.(\d+)\.(\d+)/);
                    if (match) {
                        dateStr = `${parseInt(match[1])+1911}-${match[2]}-${match[3]}`;
                    } else {
                        dateStr = new Date().toISOString().split('T')[0];
                    }
                } catch(e) {}

                // 產生 ID
                const safeTitle = c.title.replace(/[^\w\u4e00-\u9fa5]/g, '');
                const uniqueId = `JUDICIAL_${safeTitle}`.substring(0, 100);

                // 檢查重複
                const existing = await db.select().from(cases).where(eq(cases.id, uniqueId));
                
                if (existing.length === 0) {
                    let summary = '請點擊連結查看詳細判決書內容'; // 預設摘要
                    try {
                        process.stdout.write("🧠");
                        const aiResult = await invokeLLM({
                            messages: [
                                { role: 'system', content: '你是一位專業的兒少安全法務專家。請根據使用者提供的判決書標題，用台灣繁體中文，以客觀、簡潔、嚴厲的語氣，推測並總結可能的核心案情摘要。不超過50個字。' },
                                { role: 'user', content: `判決書標題: ${c.title}` }
                            ]
                        });
                        const aiSummary = aiResult.choices[0].message.content;
                        if (typeof aiSummary === 'string' && aiSummary.length > 1) {
                            summary = aiSummary.trim();
                        }
                    } catch (aiError: any) {
                        console.error(`\n⚠️ AI 分析判決書標題失敗，將使用預設描述。錯誤: ${aiError.message}`);
                    }

                    await db.insert(cases).values({
                        id: uniqueId,
                        name: c.title,
                        maskedName: c.title,
                        originalName: c.title,
                        location: '全國',
                        riskTags: '兒少保護,判決書',
                        riskLevel: 'high',
                        source: '司法院判決',
                        summary: summary,
                        url: c.href.startsWith('http') ? c.href : `https://judgment.judicial.gov.tw/FJUD/${c.href}`,
                        caseDate: dateStr,
                        crawledAt: new Date(),
                    });
                    process.stdout.write("➕"); 
                    totalCount++;
                } else {
                    process.stdout.write("."); 
                }
            } catch (err: any) {
                if (!err.message.includes('unique constraint')) {
                   console.error(`\n❌ 寫入DB時出錯: ${err.message}`);
                }
            }
        }
        console.log(""); 

        // 翻頁邏輯
        try {
            // 在 iframe 裡找下一頁按鈕
            const nextBtn = await targetFrame.$('#hlNext');
            if (nextBtn) {
                const isDisabled = await targetFrame.evaluate((el: any) => el.className.includes('disabled') || el.disabled, nextBtn);
                if (!isDisabled) {
                    await Promise.all([
                        nextBtn.click(),
                        new Promise(r => setTimeout(r, 3000))
                    ]);
                    pageNum++;
                } else {
                    console.log("   🏁 已到達最後一頁。");
                    hasNextPage = false;
                }
            } else {
                hasNextPage = false;
            }
        } catch (e) { hasNextPage = false; }
    }

    if (totalCount > 0) {
        try {
            await db.insert(dataSyncLogs).values({
                syncType: 'judicial',
                status: 'success',
                recordsAdded: totalCount,
                message: `成功抓取 ${totalCount} 筆判決`,
                createdAt: new Date(),
            });
        } catch(e) {}
    }
    console.log(`\n🎉 判決書任務完成！共新增 ${totalCount} 筆資料。`);

  } catch (error: any) {
    console.error("❌ 發生錯誤:", error.message);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    crawlJudicial().then(() => process.exit(0));
}