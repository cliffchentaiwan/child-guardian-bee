// src/server/scripts/crawlCRC_Real.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';
import { invokeLLM } from '../../../server/_core/llm';
import { fileURLToPath } from 'url'; // 確保能正確判斷執行環境

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
    
    const cities = ['台北市', '臺北市', '新北市', '桃園市', '台中市', '臺中市', '台南市', '臺南市', '高雄市', '基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'];

    while (hasNextPage) {
        console.log(`\n📄 [第 ${pageNum} 頁] 掃描中...`);

        const fullText = await page.evaluate(() => document.body.innerText);
        const tokens = fullText.split(/\s+/);
        const items: any[] = [];
        
        let currentName = '';
        let currentLocation = '';
        let currentReasonBuffer = '';

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i].trim();
            if (cities.includes(token)) {
                currentLocation = token;
                const nextToken = tokens[i+1];
                // 🔥 放寬到 20 字
                if (nextToken && nextToken.length >= 2 && nextToken.length <= 20 && !cities.includes(nextToken)) {
                    currentName = nextToken;
                    currentReasonBuffer = ''; 
                }
            }
            if (currentName && token !== currentName && token !== currentLocation && !/\d{4}[./]/.test(token)) {
                 if (currentReasonBuffer.length < 50) currentReasonBuffer += token + ' ';
            }
            if (/\d{4}[./]\d{2}[./]\d{2}/.test(token)) {
                const date = token;
                if (currentName && currentName !== '姓名') {
                    let reason = currentReasonBuffer.replace(/違反|第\d+條|規定/g, '').trim();
                    if (reason.length === 0) reason = '詳見公告';
                    
                    const exists = items.find(it => it.name === currentName && it.date === date);
                    if (!exists) {
                        items.push({ name: currentName, location: currentLocation, date: date, reason: reason });
                    }
                    currentName = '';
                }
            }
        }

        console.log(`   👀 本頁發現 ${items.length} 筆資料...`);
        if (items.length > 0) process.stdout.write("      ");

        let newThisPage = 0;

        for (const item of items) {
            try {
                let dateStr = item.date.replace(/\./g, '/');
                const parts = dateStr.split('/');
                let year = parseInt(parts[0]);
                if (year < 1911) year += 1911;
                const finalDate = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                
                const uniqueId = `CRC_${item.name}_${finalDate}`;
                
                // 🔥【修正 1】改用 cases.id 檢查重複 (關鍵修正)
                const existing = await db.select().from(cases).where(eq(cases.id, uniqueId));
                
                if (existing.length === 0) {
                    const description = `違規內容：${item.reason}`;
                    let summary = description; // 預設摘要為原始描述

                    try {
                        process.stdout.write("🧠"); // 顯示 AI 思考圖示
                        const aiResult = await invokeLLM({
                            messages: [
                                { role: 'system', content: '你是一位專業的兒少安全法務專家。請根據使用者提供的裁罰內容，用台灣繁體中文，以客觀、簡潔、嚴厲的語氣，濃縮成一句話的摘要，指出最關鍵的人事時地物和違規事實。不超過50個字。' },
                                { role: 'user', content: `姓名: ${item.name}, 地點: ${item.location}, 內容: ${item.reason}` }
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
                        role: '個人/機構',
                        riskTags: '兒少權益法,裁罰', // 改為逗號分隔字串以保持一致
                        location: item.location || '全台',
                        caseDate: finalDate,
                        description: description,
                        summary: summary, // 使用 AI 生成或預設的摘要
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
        console.log(""); 

        console.log("   🔄 翻頁中...");
        const autoSuccess = await page.evaluate((currentPage) => {
            const links = Array.from(document.querySelectorAll('a, button, li, input[type="button"]'));
            const nextLink = links.find(el => {
                const t = (el as HTMLElement).innerText?.trim() || (el as HTMLInputElement).value?.trim();
                return t === '下一頁' || t === '>' || t === 'Next' || t === '...';
            });
            const numLink = links.find(el => {
                const t = (el as HTMLElement).innerText?.trim();
                return t === (currentPage + 1).toString();
            });

            const target = nextLink || numLink;
            if (target) {
                (target as HTMLElement).click();
                return true;
            }
            return false;
        }, pageNum);

        if (autoSuccess) {
            await new Promise(r => setTimeout(r, 4000));
            pageNum++;
        } else {
            console.log("   🏁 無法找到下一頁按鈕，或已達最後一頁。");
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
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    crawlCRC();
}

export { crawlCRC };