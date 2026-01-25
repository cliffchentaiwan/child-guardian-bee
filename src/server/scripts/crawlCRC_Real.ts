// src/server/scripts/crawlCRC.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

async function crawlCRC() {
  console.log("🛡️ [CRC 全自動版] 啟動！正在為您收割全台兒少裁罰資料...");
  
  const browser = await puppeteer.launch({
    headless: false, // 如果您想在背景跑，改成 true
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  // 偽裝成一般使用者
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  try {
    console.log("📄 前往 CRC 網站...");
    await page.goto('https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction', { waitUntil: 'domcontentloaded' });

    // --- 自動搜尋流程 ---
    console.log("🤖 執行自動搜尋...");
    
    // 1. 嘗試選全選 & 點搜尋 (支援 Main Frame 與 Iframe)
    let searchClicked = false;
    
    // 策略：掃描所有 Frame 嘗試操作
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
    
    // 如果 Frame 裡沒找到，試試主頁面
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
    let totalNewCount = 0;
    let hasNextPage = true;
    
    // 錨點縣市列表
    const cities = ['台北市', '臺北市', '新北市', '桃園市', '台中市', '臺中市', '台南市', '臺南市', '高雄市', '基隆市', '新竹市', '嘉義市', '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'];

    while (hasNextPage) {
        console.log(`\n📄 [第 ${pageNum} 頁] 掃描中...`);

        // 1. 抓取純文字
        const fullText = await page.evaluate(() => document.body.innerText);
        const tokens = fullText.split(/\s+/);
        const items: any[] = [];
        
        let currentName = '';
        let currentLocation = '';
        let currentReasonBuffer = '';

        // 2. 解析邏輯 (成功驗證版)
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i].trim();
            // 找縣市
            if (cities.includes(token)) {
                currentLocation = token;
                const nextToken = tokens[i+1];
                if (nextToken && nextToken.length >= 2 && nextToken.length <= 5 && !cities.includes(nextToken)) {
                    currentName = nextToken;
                    currentReasonBuffer = ''; 
                }
            }
            // 找原因
            if (currentName && token !== currentName && token !== currentLocation && !/\d{4}[./]/.test(token)) {
                 if (currentReasonBuffer.length < 50) currentReasonBuffer += token + ' ';
            }
            // 找日期 (結尾)
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

        // 3. 寫入資料庫
        let newThisPage = 0;
        for (const item of items) {
            try {
                let dateStr = item.date.replace(/\./g, '/');
                const parts = dateStr.split('/');
                let year = parseInt(parts[0]);
                if (year < 1911) year += 1911;
                const finalDate = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                
                const uniqueId = `CRC_${item.name}_${finalDate}`;
                const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));
                
                if (existing.length === 0) {
                    await db.insert(cases).values({
                        maskedName: item.name,
                        name: item.name,
                        originalName: item.name,
                        role: '個人/機構',
                        riskTags: JSON.stringify(['兒少權益法', '裁罰']),
                        location: item.location || '全台',
                        caseDate: new Date(finalDate).toISOString(),
                        description: `違規內容：${item.reason}`,
                        sourceType: 'gov_crc',
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
        totalNewCount += newThisPage;
        console.log(""); 

        // 4. 自動翻頁 (嘗試找按鈕)
        console.log("   🔄 翻頁中...");
        
        const autoSuccess = await page.evaluate((currentPage) => {
            const links = Array.from(document.querySelectorAll('a, button, li, input[type="button"]'));
            // 找 > 或 下一頁
            const nextLink = links.find(el => {
                const t = (el as HTMLElement).innerText?.trim() || (el as HTMLInputElement).value?.trim();
                return t === '下一頁' || t === '>' || t === 'Next' || t === '...';
            });
            // 找 數字+1
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
            await new Promise(r => setTimeout(r, 4000)); // 等待載入
            pageNum++;
        } else {
            console.log("   🏁 無法找到下一頁按鈕，或已達最後一頁。任務完成！");
            hasNextPage = false;
        }
    }

    // 紀錄 Log
    if (totalNewCount >= 0) {
        await db.insert(dataSyncLogs).values({
            sourceName: 'CRC (gov_crc)',
            status: 'success',
            recordCount: totalNewCount,
            startedAt: new Date(),
            completedAt: new Date(),
        });
    }

    console.log(`\n🎉🎉🎉 全部完成！本次新增 ${totalNewCount} 筆資料。`);

  } catch (error: any) {
    console.error("❌ 錯誤:", error.message);
  } finally {
    await browser.close();
    // 不要在這裡 process.exit(0)，因為 runAll 還要跑別的
  }
}

// 匯出函數供 runAll 使用
export { crawlCRC };

// 如果直接執行此檔案 (npx tsx ...) 則執行主程式
if (import.meta.url === `file://${process.argv[1]}`) {
    crawlCRC().then(() => process.exit(0));
}