// src/server/scripts/crawlNews_Final.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

// 關鍵字列表 (專注於行為與罪名，而非特定人名)
const KEYWORDS = [
    '兒少性剝削', 
    '拍攝未成年', 
    '違反兒少法', 
    '幼兒園 違規',
    '幼兒園 虐童',
    '補習班 性騷擾',
    '狼師',
    '托嬰中心 虐待',
    '持有兒少性影像' // 針對近期重大案件增加
]; 

async function crawlNewsFinal() {
  console.log("📰 [雙引擎新聞爬蟲] 啟動！優先 Yahoo，失敗自動切換 Google...");
  
  // 🔥 關鍵修正：針對 Render 雲端環境的最佳化設定
  const browser = await puppeteer.launch({
    headless: true, // ⚠️ 必須設為 true，因為雲端主機沒有螢幕
    defaultViewport: null,
    args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // 避免記憶體不足
        '--disable-gpu'
    ]
  });

  const page = await browser.newPage();
  // 偽裝 User-Agent
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  let totalNewCount = 0;

  try {
    for (const keyword of KEYWORDS) {
        console.log(`\n🔍 關鍵字：${keyword}`);
        
        // --- 第一階段：嘗試 Yahoo (速度快，干擾少) ---
        let items = await scrapeYahoo(page, keyword);
        
        // --- 第二階段：如果 Yahoo 沒抓到，切換 Google ---
        if (items.length === 0) {
            console.log("   ⚠️ Yahoo 找不到資料，啟動 Google 備援引擎...");
            items = await scrapeGoogle(page, keyword);
        }

        console.log(`   👀 最終找到 ${items.length} 則報導...`);

        // 寫入資料庫
        for (const item of items) {
            try {
                const uniqueId = `NEWS_${item.link}`;
                const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));
                
                if (existing.length === 0) {
                    await db.insert(cases).values({
                        maskedName: item.source || '網路新聞', // 在列表顯示媒體名稱 (如：Yahoo新聞)
                        name: item.title,                      // 通用名稱存標題 (如：藝人黃子佼...)
                        originalName: item.title,              // 原始名稱存標題 (供模糊搜尋用)
                        role: '媒體報導',
                        riskTags: JSON.stringify(['新聞', keyword]),
                        location: '網路',                      // 設為「網路」以配合我們新寫的搜尋邏輯
                        caseDate: new Date().toISOString(),
                        description: `[${item.source}] ${item.title}`,
                        sourceType: 'news',
                        sourceLink: uniqueId,
                        verified: false,
                        createdAt: new Date(),
                    });
                    totalNewCount++;
                    process.stdout.write("➕");
                } else {
                    process.stdout.write(".");
                }
            } catch (e) {
                // 忽略重複鍵值錯誤
            }
        }
    }

    // 紀錄 Log
    if (totalNewCount >= 0) {
        await db.insert(dataSyncLogs).values({
            sourceName: 'News Crawler (Dual Engine)',
            status: 'success',
            recordCount: totalNewCount,
            startedAt: new Date(),
            completedAt: new Date(),
        });
    }

    console.log(`\n🎉 任務全部完成！共新增 ${totalNewCount} 筆資料。`);

  } catch (error: any) {
    console.error("❌ 嚴重錯誤:", error.message);
  } finally {
    await browser.close();
    // 只有在直接執行時才退出，避免影響被呼叫的情況
    if (import.meta.url === `file://${process.argv[1]}`) {
        process.exit(0);
    }
  }
}

// === Yahoo 抓取邏輯 (廣域連結版) ===
async function scrapeYahoo(page: any, keyword: string) {
    try {
        const url = `https://tw.news.yahoo.com/search?p=${encodeURIComponent(keyword)}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // 自動捲動 (Yahoo 是無限捲動，必須捲才會有資料)
        await autoScroll(page);

        // 抓取所有連結，然後用正則表達式過濾
        // Yahoo 新聞網址特徵：結尾是 .html 且網域包含 yahoo
        return await page.evaluate(() => {
            const results: any[] = [];
            const links = document.querySelectorAll('a'); // 抓全頁所有連結
            
            links.forEach((a: HTMLAnchorElement) => {
                const title = a.innerText.trim();
                const href = a.href;
                
                // 濾網：
                // 1. 標題長度 > 10 (過濾掉 "首頁"、"登入" 等短連結)
                // 2. 網址包含 .html (Yahoo 新聞內頁特徵)
                // 3. 排除廣告 (googlead, doubleclick)
                if (title.length > 10 && href.includes('.html') && !href.includes('googlead')) {
                    // 嘗試找來源 (通常在附近的 .Source class)
                    let source = 'Yahoo 新聞';
                    try {
                        // 往上找兩層看有沒有來源標籤
                        const parent = a.parentElement?.parentElement;
                        if(parent) {
                            const s = parent.querySelector('.Source, .publisher');
                            if(s) source = (s as HTMLElement).innerText;
                        }
                    } catch(e){}

                    // 避免重複
                    if (!results.find(r => r.link === href)) {
                        results.push({ title, link: href, source });
                    }
                }
            });
            return results;
        });
    } catch (e) {
        console.log("   ❌ Yahoo 抓取錯誤:", e);
        return [];
    }
}

// === Google 抓取邏輯 (備援) ===
async function scrapeGoogle(page: any, keyword: string) {
    try {
        // tbm=nws (新聞模式), tbs=qdr:y5 (過去5年), gl=tw (台灣)
        const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=nws&tbs=qdr:y5&gl=tw`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        await new Promise(r => setTimeout(r, 1500)); // 等一下

        return await page.evaluate(() => {
            const results: any[] = [];
            // Google 新聞卡片容器
            const elements = document.querySelectorAll('div.SoaBEf, [data-hveid] div[role="heading"]');
            
            elements.forEach(el => {
                const titleEl = el.querySelector('div[role="heading"], h3');
                const linkEl = el.querySelector('a');
                const sourceEl = el.querySelector('.NUnG9d span, .MgUUmf span');

                if (titleEl && linkEl) {
                    const title = (titleEl as HTMLElement).innerText;
                    const link = (linkEl as HTMLAnchorElement).href;
                    const source = sourceEl ? (sourceEl as HTMLElement).innerText : 'Google 新聞';

                    if (title && link) {
                        results.push({ title, link, source });
                    }
                }
            });
            return results;
        });
    } catch (e) {
        console.log("   ❌ Google 抓取錯誤:", e);
        return [];
    }
}

// 捲動輔助函式
async function autoScroll(page: any) {
    await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
            let totalHeight = 0;
            let distance = 200;
            // 捲動 10 次就好，不用太多，大概能抓 20-30 筆
            let count = 0;
            let timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;
                count++;
                if (count >= 15) { 
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
    await new Promise(r => setTimeout(r, 1000)); // 捲完再等一下
}

// 匯出函數供外部呼叫
export { crawlNewsFinal };


