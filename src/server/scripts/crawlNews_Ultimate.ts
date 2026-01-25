// src/server/scripts/crawlNews_Ultimate.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

// 關鍵字列表
const KEYWORDS = [
    '兒少性剝削', 
    '拍攝未成年', 
    '違反兒少法', 
    '幼兒園 違規',
    '幼兒園 虐童',
    '補習班 性騷擾',
    '狼師',
    '托嬰中心 虐待'
]; 

async function crawlNewsUltimate() {
  console.log("📰 [Yahoo 新聞終極版] 啟動！Puppeteer 自動捲動抓取...");
  
  // 啟動瀏覽器 (headless: false 讓您可以看到它在捲動)
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox']
  });

  const page = await browser.newPage();
  
  // 偽裝 User-Agent
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  let totalNewCount = 0;

  try {
    for (const keyword of KEYWORDS) {
        console.log(`\n🔍 正在搜尋：${keyword}`);
        
        // Yahoo 搜尋網址
        const url = `https://tw.news.yahoo.com/search?p=${encodeURIComponent(keyword)}`;
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        // 1. 【關鍵技術】自動捲動 (Auto Scroll)
        // Yahoo 新聞是無限捲動的，我們要往下捲幾次讓資料載入
        console.log("   ⬇️ 正在往下捲動載入更多...");
        await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
                let totalHeight = 0;
                let distance = 100;
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    // 捲動超過 3000px 或到底就停 (約可抓 20-30 筆)
                    if(totalHeight >= 3000){
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
        
        // 等待一下讓內容渲染
        await new Promise(r => setTimeout(r, 2000));

        // 2. 抓取新聞 (使用寬鬆選擇器)
        const newsItems = await page.evaluate(() => {
            const results: any[] = [];
            
            // 抓取所有看起來像新聞標題的連結
            // Yahoo 的結構很亂，我們直接找 h3 > a 或者 h4 > a
            const elements = document.querySelectorAll('h3 a, h4 a, .StreamMegaItem a');
            
            elements.forEach((el) => {
                const anchor = el as HTMLAnchorElement;
                const title = anchor.innerText.trim();
                const link = anchor.href;
                
                // 簡單過濾：長度夠長、不是廣告、不是 Yahoo 首頁連結
                if (title.length > 8 && link.includes('yahoo.com') && !title.includes('隱私權')) {
                     // 嘗試找一下附近的「媒體來源」
                     // 往上找父層，再找 .Source 或類似 class
                     let source = 'Yahoo 新聞';
                     try {
                         const parent = anchor.closest('li') || anchor.closest('div');
                         if (parent) {
                             const sourceEl = parent.querySelector('.Source, .publisher, .sub span');
                             if (sourceEl) source = (sourceEl as HTMLElement).innerText;
                         }
                     } catch(e) {}

                    results.push({ title, link, source });
                }
            });
            return results;
        });

        console.log(`   👀 找到 ${newsItems.length} 則相關報導...`);

        // 3. 寫入資料庫
        for (const item of newsItems) {
            try {
                const uniqueId = `NEWS_${item.link}`;
                const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));
                
                if (existing.length === 0) {
                    await db.insert(cases).values({
                        maskedName: item.source,
                        name: item.title,
                        originalName: item.title,
                        role: '媒體報導',
                        riskTags: JSON.stringify(['新聞', keyword]),
                        location: '全台',
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
            } catch (e) {}
        }
    }

    if (totalNewCount >= 0) {
        await db.insert(dataSyncLogs).values({
            sourceName: 'Yahoo 新聞 (Puppeteer)',
            status: 'success',
            recordCount: totalNewCount,
            startedAt: new Date(),
            completedAt: new Date(),
        });
    }

    console.log(`\n🎉 新聞收割完成！共新增 ${totalNewCount} 筆資料。`);

  } catch (error: any) {
    console.error("❌ 錯誤:", error.message);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

crawlNewsUltimate();