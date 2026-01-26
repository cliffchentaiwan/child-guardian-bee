// src/server/scripts/crawlNews_Final.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

// 1. 搜尋用的廣泛關鍵字
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

// 2. 嚴格驗證關鍵字 (標題必須包含這些詞之一)
const VALIDATION_KEYWORDS = [
    '性剝削', '性騷', '猥褻', '性侵', '偷拍', '私密',
    '虐童', '虐待', '霸凌', '體罰', '不當管教', '呼巴掌', '餵藥',
    '幼兒園', '托嬰', '保母', '教保', '狼師', '補習班', '園長',
    '兒少', '未成年', '女童', '男童', '學生',
    '開罰', '裁罰', '違規', '停業', '撤照', '起訴', '判刑'
];

async function crawlNewsFinal() {
    console.log('📰 [雙引擎新聞爬蟲] 啟動！(雲端極速 + 嚴格過濾版)...');

    // 啟動參數優化 (針對 Render 環境)
    const browser = await puppeteer.launch({
        headless: true, // 雲端必須是 true
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // 避免記憶體不足
            '--disable-gpu',
            '--single-process', // 節省資源
            '--no-zygote'
        ]
    });

    let totalNewCount = 0;

    try {
        const page = await browser.newPage();
        
        // 🔥 1. 開啟請求攔截 (Request Interception) - 加速關鍵！
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            // 阻擋圖片、樣式表、字型、媒體，只讀取 Document 和 Script
            if (['image', 'stylesheet', 'font', 'media', 'other'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        for (const keyword of SEARCH_KEYWORDS) {
            console.log(`\n🔍 搜尋關鍵字：${keyword}`);
            
            // 優先嘗試 Yahoo，失敗轉 Google
            let items = await scrapeYahoo(page, keyword);
            
            if (items.length === 0) {
                console.log(`   ⚠️ Yahoo 找不到或太慢，切換 Google...`);
                items = await scrapeGoogle(page, keyword);
            }

            // 🔥 過濾階段
            const originalCount = items.length;
            items = items.filter(item => {
                // 檢查標題是否包含任一驗證關鍵字
                const isRelevant = VALIDATION_KEYWORDS.some(k => item.title.includes(k));
                return isRelevant;
            });

            console.log(`   👀 原始抓到 ${originalCount} 筆，經嚴格過濾後剩 ${items.length} 筆有效新聞`);

            // 寫入資料庫
            let savedCount = 0;
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
                            riskTags: JSON.stringify(['媒體報導', keyword]),
                            location: '網路',
                            caseDate: item.date || new Date().toISOString(),
                            description: `[${item.source || '新聞'}] ${item.snippet || item.title}`,
                            sourceType: 'news',
                            sourceLink: uniqueId,
                            verified: false,
                            createdAt: new Date()
                        });
                        savedCount++;
                        process.stdout.write("➕");
                    } else {
                        process.stdout.write(".");
                    }
                } catch (e) {}
            }
            console.log(""); // 換行
            totalNewCount += savedCount;
            
            // 休息一下
            await new Promise(r => setTimeout(r, 2000));
        }

        // 紀錄 Log
        if (totalNewCount >= 0) {
            await db.insert(dataSyncLogs).values({
                sourceName: 'News Crawler (Strict)',
                status: 'success',
                recordCount: totalNewCount,
                startedAt: new Date(),
                completedAt: new Date(),
            });
        }

        console.log(`\n🎉 新聞爬蟲任務完成！共新增 ${totalNewCount} 筆資料。`);

    } catch (error: any) {
        console.error("❌ 嚴重錯誤:", error.message);
    } finally {
        await browser.close();
        if (import.meta.url === `file://${process.argv[1]}`) {
            process.exit(0);
        }
    }
}

// Yahoo 爬蟲函式 (快速放棄版)
async function scrapeYahoo(page: any, keyword: string) {
    const targetUrl = `https://tw.news.yahoo.com/search?p=${encodeURIComponent(keyword)}`;
    try {
        // 🔥 Timeout 改回 30秒，抓不到就趕快換 Google，不要空等
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // 嘗試等待
        try { await page.waitForSelector('li.StreamMegaItem', { timeout: 5000 }); } catch(e) {}

        return await page.evaluate(() => {
            const results: any[] = [];
            document.querySelectorAll('li.StreamMegaItem').forEach(item => {
                const titleEl = item.querySelector('h3 a');
                const descEl = item.querySelector('p');
                const sourceEl = item.querySelector('.Source, .publisher');

                if (titleEl) {
                    const link = titleEl.getAttribute('href') || '';
                    results.push({
                        title: titleEl.textContent?.trim(),
                        link: link.startsWith('http') ? link : `https://tw.news.yahoo.com${link}`,
                        date: new Date().toISOString().split('T')[0],
                        snippet: descEl?.textContent?.trim() || '',
                        source: sourceEl?.textContent?.trim() || 'Yahoo 新聞'
                    });
                }
            });
            return results;
        });
    } catch (e: any) {
        // 這裡不印出錯誤 Stack，讓 Log 乾淨一點
        return [];
    }
}

// Google 爬蟲函式 (Lite 版)
async function scrapeGoogle(page: any, keyword: string) {
    const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=nws`;
    try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 }); // Google 給多一點時間

        return await page.evaluate(() => {
            const results: any[] = [];
            document.querySelectorAll('div.SoaBEf').forEach(item => {
                const titleEl = item.querySelector('div[role="heading"]');
                const linkEl = item.querySelector('a');
                const snippetEl = item.querySelector('.GI74Re');
                const sourceEl = item.querySelector('.NUnG9d span');

                if (titleEl && linkEl) {
                    results.push({
                        title: titleEl.textContent?.trim(),
                        link: linkEl.getAttribute('href'),
                        date: new Date().toISOString().split('T')[0], 
                        snippet: snippetEl?.textContent?.trim() || '',
                        source: sourceEl?.textContent?.trim() || 'Google 新聞'
                    });
                }
            });
            return results;
        });
    } catch (e: any) {
        console.log(`   ❌ Google 抓取錯誤: ${e.message}`);
        return [];
    }
}

// 🔥🔥 這裡就是重點！加上 export 讓 cron.ts 找得到它 🔥🔥
export { crawlNewsFinal };

// 保持這段，讓你手動也能跑
if (import.meta.url === `file://${process.argv[1]}`) {
    crawlNewsFinal();
}