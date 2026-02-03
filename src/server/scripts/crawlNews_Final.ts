// src/server/scripts/crawlNews_Final.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';
import { invokeLLM } from '../../../server/_core/llm';
import { fileURLToPath } from 'url'; // 🔥【修正】導入 fileURLToPath 模組


// 🔍 除錯用：確認檔案被載入 (但不會自動執行)
console.log("📂 [系統] 載入新聞爬蟲模組 crawlNews_Final.ts (等待呼叫中)...");

// 1. 搜尋用的廣泛關鍵字
const SEARCH_KEYWORDS = [
    '兒少性剝削', '持有兒少性影像', '拍攝未成年', '誘拐未成年',
    '妨害性自主', '性侵', '猥褻', '性騷擾', '數位性暴力', '創意私房',
    '虐童', '不當管教', '體罰', '霸凌', '施暴', '餵藥', 
    '幼兒園 違規', '托嬰中心 違規', '不適任教師', '解聘', 
    '撤銷執照', '廢止設立許可', '終身不得聘任', '列入黑名單', 
    '裁罰', '開罰', '狼師', '惡保母', '無照保母', 
    '補習班 狼師', '教練 性侵', '教練 性騷', '家教 性侵', 
    '安置機構 虐待', '校園 性平事件', '黃子佼', '幼兒園 餵藥案'
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
    console.log('📰 [雙引擎新聞爬蟲] 啟動！(Neon 雲端版)...');

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    let totalNewCount = 0;

    try {
        const page = await browser.newPage();
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
                return VALIDATION_KEYWORDS.some(k => item.title.includes(k));
            });

            console.log(`   👀 原始抓到 ${originalCount} 筆，經嚴格驗證後剩 ${items.length} 筆有效新聞`);

const TAIWAN_CITIES = [
  '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市',
  '基隆市', '新竹市', '嘉義市',
  '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣',
  '澎湖縣', '金門縣', '連江縣',
  // 簡稱
  '台北', '新北', '桃園', '台中', '台南', '高雄',
  '基隆', '新竹', '嘉義', '苗栗', '彰化', '南投', '雲林', '屏東', '宜蘭', '花蓮', '台東', '澎湖', '金門'
];

// ... (省略部分輔助函式) ...

            // 寫入 DB (Neon 版)
            let savedCount = 0;
            for (const item of items) {
                try {
                    const uniqueId = `NEWS_${item.link}`.substring(0, 255); 
                    const existing = await db.select().from(cases).where(eq(cases.id, uniqueId));
                    
                    if (existing.length === 0) {
                        let summary = item.title;
                        let location = '網路'; // 預設地點

                        // 🔥【規則優先】從標題解析地點
                        for (const city of TAIWAN_CITIES) {
                            if (item.title.includes(city)) {
                                if (city.endsWith('市') || city.endsWith('縣')) {
                                    location = city;
                                } else {
                                    const fullName = TAIWAN_CITIES.find(c => c.startsWith(city) && (c.endsWith('市') || c.endsWith('縣')));
                                    location = fullName || city;
                                }
                                break; 
                            }
                        }

                        // 🔥【AI輔助】如果規則找不到地點，則要求 AI 一併分析 (AI 功能已禁用)
                        // try {
                        //     process.stdout.write("🧠");
                        //     const prompt = location === '網路' 
                        //         ? `請根據此新聞內容，完成兩件事：1. 濃縮成一句話的摘要。 2. 識別事件最主要的發生縣市(例如：臺北市、新北市)，如果沒有明確縣市則回傳「網路」。請嚴格用 {"summary": "摘要", "location": "縣市"} 的 JSON 格式回傳。新聞標題: ${item.title}，新聞片段: ${item.snippet}`
                        //         : `請根據此新聞內容，濃縮成一句話的摘要。新聞標題: ${item.title}，新聞片段: ${item.snippet}`;

                        //     const aiResult = await invokeLLM({
                        //         messages: [
                        //             { role: 'system', content: '你是一位專業的兒少安全法務專家，擅長分析新聞並提取關鍵資訊。' },
                        //             { role: 'user', content: prompt }
                        //         ]
                        //     });

                        //     let aiText = aiResult.choices[0].message.content || '';
                            
                        //     if (location === '網路' && aiText.includes('{')) {
                        //         // 嘗試解析 JSON
                        //         const jsonMatch = aiText.match(/\{.*\}/);
                        //         if (jsonMatch) {
                        //             const parsed = JSON.parse(jsonMatch[0]);
                        //             summary = parsed.summary || summary;
                        //             location = parsed.location || '網路';
                        //         }
                        //     } else if (aiText) {
                        //         summary = aiText.trim();
                        //     }

                        // } catch (aiError: any) {
                        //     console.error(`\n⚠️ AI 分析新聞失敗，將使用原始標題。錯誤: ${aiError.message}`);
                        // }

                        await db.insert(cases).values({
                            id: uniqueId,
                            maskedName: item.source || '網路新聞',
                            name: item.title,
                            originalName: item.title,
                            location: location,
                            riskTags: `媒體報導,${keyword}`,
                            riskLevel: 'medium',
                            source: '媒體報導',
                            summary: summary,
                            url: item.link,
                            caseDate: item.date || new Date().toISOString().split('T')[0],
                            crawledAt: new Date()
                        });
                        savedCount++;
                        process.stdout.write("➕");
                    } else {
                        process.stdout.write(".");
                    }
                } catch (e: any) { 
                    if (!e.message.includes('unique constraint')) {
                       console.error(`\n❌ 寫入DB時出錯: ${e.message}`);
                    }
                }
            }
            console.log(""); 
            totalNewCount += savedCount;
            // 休息一下避免被封鎖
            await new Promise(r => setTimeout(r, 2000));
        }

        if (totalNewCount >= 0) {
            try {
                await db.insert(dataSyncLogs).values({
                    syncType: 'news',
                    status: 'success',
                    recordsAdded: totalNewCount,
                    message: `News Crawler 任務完成`,
                    createdAt: new Date(),
                });
            } catch(e) {}
        }
        console.log(`\n🎉 任務圓滿完成！共新增 ${totalNewCount} 筆全方位防護資料。`);

    } catch (error: any) {
        console.error("❌ 嚴重錯誤:", error.message);
    } finally {
        await browser.close();
    }
}

// 輔助函式 (Yahoo)
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

// 輔助函式 (Google)
async function scrapeGoogle(page: any, keyword: string) {
    const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=nws&cr=countryTW`;
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

// 🔥 關鍵 Export：讓排程系統可以呼叫它
export { crawlNewsFinal };

// 🛑 移除了底部的自動執行區塊，防止 Render 部署時伺服器當機

// 確保可以被 import 也可以直接執行
if (process.argv[1]?.endsWith('crawlNews_Final.ts')) {
    crawlNewsFinal();
}