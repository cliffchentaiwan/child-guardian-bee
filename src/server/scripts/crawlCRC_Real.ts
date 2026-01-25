// src/server/scripts/crawlCRC_Real.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

async function crawlCRC() {
  console.log("🛡️ [CRC 兒少裁罰] 啟動！正在為您收割全台裁罰資料...");
  
  // 🔥 Render 專用：極限省記憶體設定
  const browser = await puppeteer.launch({
    headless: true, // 雲端必備：無頭模式
    defaultViewport: null,
    args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // 關鍵：避免 Docker 記憶體不足
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // ⚠️ 關鍵：強制單一進程，大幅降低記憶體消耗
        '--disable-extensions'
    ]
  });

  let totalNewCount = 0;

  try {
    const page = await browser.newPage();
    // 偽裝成一般使用者
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    console.log("📄 前往 CRC 網站...");
    await page.goto('https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // --- 自動搜尋流程 ---
    console.log("🤖 執行自動搜尋...");
    
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

        // 1. 抓取純文字
        const fullText = await page.evaluate(() => document.body.innerText);
        const tokens = fullText.split(/\s+/);
        const items: any[] = [];
        
        let currentName = '';
        let currentLocation = '';
        let currentReasonBuffer = '';

        // 2. 解析邏輯
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i].trim();
            if (cities.includes(token)) {
                currentLocation = token;
                const nextToken = tokens[i+1];
                if (nextToken && nextToken.length >= 2 && nextToken.length <= 5 && !cities.includes(nextToken)) {
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
                    
                    // 去重檢查 (本頁內)
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
                const finalDate = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`; // 格式: 2024-01-01
                
                const uniqueId = `CRC_${item.name}_${finalDate}`;
                const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));
                
                if (existing.length === 0) {
                    await db.insert(cases).values({
                        maskedName: item.name,
                        name: item.name,
                        originalName: item.name,
                        role: '個人/機構',
                        riskTags: JSON.stringify(['兒少權益法', '裁罰']),
                        location: item.location || '全台', // 這裡會讓選單抓到！
                        caseDate: finalDate, // 存入標準格式
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

        // 4. 自動翻頁
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

    // 紀錄 Log
    if (totalNewCount >= 0) {
        await db.insert(dataSyncLogs).values({
            sourceName: 'gov_crc', // 統一用這個名稱
            status: 'success',
            recordCount: totalNewCount,
            startedAt: new Date(),
            completedAt: new Date(),
        });
    }

    console.log(`\n🎉 CRC 爬取完成！本次新增 ${totalNewCount} 筆資料。`);

  } catch (error: any) {
    console.error("❌ CRC 錯誤:", error.message);
  } finally {
    await browser.close();
    // 只有在直接執行時才退出，避免影響被呼叫的情況
    if (import.meta.url === `file://${process.argv[1]}`) {
        process.exit(0);
    }
  }
}

export { crawlCRC };

// 支援直接執行
if (import.meta.url === `file://${process.argv[1]}`) {
    crawlCRC().then(() => process.exit(0));
}