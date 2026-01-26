// src/server/scripts/crawlNews_Final.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

// 1. 搜尋用的廣泛關鍵字 (天羅地網版)
const SEARCH_KEYWORDS = [
    // --- 🔴 第一層：核心紅線 (性犯罪/數位暴力) ---
    '兒少性剝削', 
    '持有兒少性影像', 
    '拍攝未成年', 
    '誘拐未成年',
    '妨害性自主', 
    '性侵', 
    '猥褻', 
    '性騷擾', 
    '數位性暴力', 
    '創意私房', 
    
    // --- 🟠 第二層：不當對待 ---
    '虐童', 
    '不當管教', 
    '體罰', 
    '霸凌', 
    '施暴', 
    '餵藥', 
    '呼巴掌', 
    '言語羞辱', 
    '強迫餵食',
    '幼兒園 違規', 
    '托嬰中心 違規',
    
    // --- 🟡 第三層：行政處分 ---
    '不適任教師', 
    '解聘', 
    '停職', 
    '撤銷執照', 
    '廢止設立許可',
    '終身不得聘任', 
    '列入黑名單', 
    '裁罰', 
    '開罰',
    
    // --- 🔵 第四層：高風險場域/角色 ---
    '狼師', 
    '惡保母', 
    '無照保母', 
    '月嫂 虐嬰',
    '補習班 狼師', 
    '教練 性侵', 
    '教練 性騷', 
    '家教 性侵', 
    '安置機構 虐待', 
    '校園 性平事件',
    
    // --- ⚫️ 第五層：特定重大案件 ---
    '黃子佼', 
    '幼兒園 餵藥案'
];

// 2. 嚴格驗證關鍵字
const VALIDATION_KEYWORDS = [
    '性剝削', '性騷', '猥褻', '性侵', '偷拍', '私密', '影像', '妨害性自主', '數位', '創意私房',
    '虐童', '虐待', '霸凌', '體罰', '不當管教', '呼巴掌', '餵藥', '施暴', '羞辱', '強迫',
    '幼兒園', '托嬰', '保母', '教保', '狼師', '補習班', '園長', '教練', '家教', '教師', '老師', '月嫂', '安置機構',
    '兒少', '未成年', '女童', '男童', '學生', '孩童', '嬰兒', '幼童',
    '黃子佼',
    '開罰', '裁罰', '違規', '停業', '撤照', '起訴', '判刑', '羈押', '通緝', 
    '解聘', '停職', '不適任', '黑名單', '廢止'
];

async function crawlNewsFinal() {
    console.log('📰 [雙引擎新聞爬蟲] 啟動！(全方位安全防護網版)...');

    // 啟動參數優化 (針對 Render 環境)
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--single-process',
            '--no-zygote'
        ]
    });

    let totalNewCount = 0;

    try {
        const page = await browser.newPage();
        
        // 請求攔截加速
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media', 'other'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        for (const keyword of SEARCH_KEYWORDS) {
            console.log(`\n🔍 搜尋關鍵字：${keyword}`);
            
            let items = await scrapeYahoo(page, keyword);
            
            if (items.length === 0) {
                console.log(`   ⚠️ Yahoo 找不到或太慢，切換 Google...`);
                items = await scrapeGoogle(page, keyword);
            }

            // 過濾
            const originalCount = items.length;
            items = items.filter(item => {
                const isRelevant = VALIDATION_KEYWORDS.some(k => item.title.includes(k));
                return isRelevant;
            });

            console.log(`   👀 原始抓到 ${originalCount} 筆，經嚴格驗證後剩 ${items.length} 筆有效新聞`);

            // 寫入 DB
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
                } catch (e) { }
            }
            console.log(""); 
            totalNewCount += savedCount;
            await new Promise(r => setTimeout(r, 2000));
        }

        if (totalNewCount >= 0) {
            await db.insert(dataSyncLogs).values({
                sourceName: 'News Crawler (Safety Net)',
                status: 'success',
                recordCount: totalNewCount,
                startedAt: new Date(),
                completedAt: new Date(),
            });
        }
        console.log(`\n🎉 任務圓滿完成！共新增 ${totalNewCount} 筆全方位防護資料。`);

    } catch (error: any) {
        console.error("❌ 嚴重錯誤:", error.message);
    } finally {
        await browser.close();
    }
}

// 輔助函式
async function scrapeYahoo(page: any, keyword: string) {
    const targetUrl = `https://tw.news.yahoo.com/search?p=${encodeURIComponent(keyword)}`;
    try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
    } catch (e: any) { return []; }
}

async function scrapeGoogle(page: any, keyword: string) {
    const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=nws`;
    try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
    } catch (e: any) { return []; }
}

// 🔥🔥 關鍵 Export：排程系統需要這個函式
export { crawlNewsFinal };

// 🛑 註解掉這裡！防止伺服器啟動時自動執行
/* if (import.meta.url === `file://${process.argv[1]}`) {
    crawlNewsFinal();
}
*/