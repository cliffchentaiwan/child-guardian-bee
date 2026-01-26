// src/server/scripts/crawlNews_Final.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

// 1. 搜尋用的廣泛關鍵字 (給搜尋引擎用的)
const SEARCH_KEYWORDS = [
    '兒少性剝削', 
    '拍攝未成年', 
    '違反兒少法', 
    '幼兒園 違規',
    '幼兒園 虐童',
    '補習班 性騷擾',
    '狼師',
    '托嬰中心 虐待',
    '持有兒少性影像'
]; 

// 🔥 2. [新增] 嚴格驗證關鍵字 (標題必須包含這些詞之一，才准進入資料庫)
// 這樣可以過濾掉「台積電」、「股市」、「藝人八卦」等無關新聞
const VALIDATION_KEYWORDS = [
    '性剝削', '性騷', '猥褻', '性侵', '偷拍', '私密',
    '虐童', '虐待', '霸凌', '體罰', '不當管教', '呼巴掌', '餵藥',
    '幼兒園', '托嬰', '保母', '教保', '狼師', '補習班', '園長',
    '兒少', '未成年', '女童', '男童', '學生',
    '開罰', '裁罰', '違規', '停業', '撤照', '起訴', '判刑'
];

async function crawlNewsFinal() {
  console.log("📰 [雙引擎新聞爬蟲] 啟動！(嚴格過濾模式)...");
  
  // 針對 Mac 本地執行優化，但保留對 Render 的相容性
  const browser = await puppeteer.launch({
    headless: true, // 改回 true 比較快，想看畫面改成 false
    defaultViewport: null,
    args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process' // 省記憶體
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  let totalNewCount = 0;

  try {
    for (const keyword of SEARCH_KEYWORDS) {
        console.log(`\n🔍 搜尋關鍵字：${keyword}`);
        
        // --- 第一階段：Yahoo ---
        let items = await scrapeYahoo(page, keyword);
        
        // --- 第二階段：Google (備援) ---
        if (items.length === 0) {
            console.log("   ⚠️ Yahoo 找不到資料，切換 Google...");
            items = await scrapeGoogle(page, keyword);
        }

        // 🔥 過濾階段：再次檢查標題是否相關
        const originalCount = items.length;
        items = items.filter(item => {
            // 檢查標題是否包含任一驗證關鍵字
            const isRelevant = VALIDATION_KEYWORDS.some(k => item.title.includes(k));
            if (!isRelevant) {
                // 如果您想看被過濾掉什麼，可以把下面這行註解打開
                // console.log(`   🗑️ 剔除無關新聞：${item.title}`);
            }
            return isRelevant;
        });

        console.log(`   👀 原始抓到 ${originalCount} 筆，經嚴格過濾後剩 ${items.length} 筆有效新聞`);

        // 寫入資料庫
        for (const item of items) {
            try {
                const uniqueId = `NEWS_${item.link}`;
                const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));
                
                if (existing.length === 0) {
                    await db.insert(cases).values({
                        maskedName: item.source || '網路新聞',
                        name: item.title,
                        originalName: item.title,
                        role: '媒體報導',
                        riskTags: JSON.stringify(['新聞', keyword]),
                        location: '網路',
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
                // 忽略重複鍵值
            }
        }
    }

    // 紀錄 Log
    if (totalNewCount >= 0) {
        await db.insert(dataSyncLogs).values({
            sourceName: 'News Crawler (Strict Mode)',
            status: 'success',
            recordCount: totalNewCount,
            startedAt: new Date(),
            completedAt: new Date(),
        });
    }

    console.log(`\n🎉 任務完成！共新增 ${totalNewCount} 筆有效資料。`);

  } catch (error: any) {
    console.error("❌ 嚴重錯誤:", error.message);
  } finally {
    await browser.close();
    // ⚠️ 這裡保持不自動退出，除非是獨立執行
    if (import.meta.url === `file://${process.argv[1]}`) {
        process.exit(0);
    }
  }
}

// === Yahoo 抓取邏輯 ===
async function scrapeYahoo(page: any, keyword: string) {
    try {
        const url = `https://tw.news.yahoo.com/search?p=${encodeURIComponent(keyword)}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await autoScroll(page);

        return await page.evaluate(() => {
            const results: any[] = [];
            const links = document.querySelectorAll('a');
            
            links.forEach((a: HTMLAnchorElement) => {
                const title = a.innerText.trim();
                const href = a.href;
                
                // 初步濾網
                if (title.length > 10 && href.includes('.html') && !href.includes('googlead')) {
                    let source = 'Yahoo 新聞';
                    try {
                        const parent = a.parentElement?.parentElement;
                        if(parent) {
                            const s = parent.querySelector('.Source, .publisher');
                            if(s) source = (s as HTMLElement).innerText;
                        }
                    } catch(e){}

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

// === Google 抓取邏輯 ===
async function scrapeGoogle(page: any, keyword: string) {
    try {
        const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=nws&tbs=qdr:y5&gl=tw`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 1500));

        return await page.evaluate(() => {
            const results: any[] = [];
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

async function autoScroll(page: any) {
    await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
            let totalHeight = 0;
            let distance = 200;
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
    await new Promise(r => setTimeout(r, 1000));
}

export { crawlNewsFinal };

// 🔥 修正：把這段「點火開關」加回來，這樣您在電腦上打指令才會跑！
if (import.meta.url === `file://${process.argv[1]}`) {
    crawlNewsFinal();
}