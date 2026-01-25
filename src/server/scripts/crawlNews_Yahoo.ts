// src/server/scripts/crawlNews_Yahoo.ts
import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

// 關鍵字設定 (針對兒少議題)
const KEYWORDS = [
    '兒少性剝削', 
    '拍攝未成年', 
    '違反兒少法', 
    '幼兒園 違規',
    '幼兒園 虐童',
    '補習班 性騷擾',
    '狼師'
]; 

async function crawlNewsYahoo() {
  console.log("🕵️‍♀️ [Yahoo 新聞爬蟲] 啟動！使用輕量化 Axios 快速掃描...");
  
  let totalNewCount = 0;

  try {
    for (const keyword of KEYWORDS) {
      console.log(`\n🔎 正在搜尋：${keyword}...`);
      
      // Yahoo 新聞搜尋網址
      const url = `https://tw.news.yahoo.com/search?p=${encodeURIComponent(keyword)}`;
      
      // 1. 發送請求 (偽裝成瀏覽器)
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      // 2. 解析 HTML
      const $ = cheerio.load(data);
      
      // 3. 抓取新聞列表
      // Yahoo 的列表結構通常是 li，裡面包著新聞連結
      // 我們抓取包含 href 的連結
      const items: any[] = [];
      
      $('li div.dd, li.StreamMegaItem').each((i, el) => {
          const titleEl = $(el).find('h3 a');
          const title = titleEl.text().trim();
          const link = titleEl.attr('href');
          const source = $(el).find('.Source').text().trim() || 'Yahoo 新聞';
          const time = $(el).find('.fc-2nd').text().trim(); // Yahoo 的時間標籤

          if (title && link && title.length > 5) {
              items.push({ title, link, source, time });
          }
      });

      console.log(`   👀 找到 ${items.length} 則相關報導...`);

      // 4. 寫入資料庫
      for (const item of items) {
          try {
             const uniqueId = `NEWS_${item.link}`;
             const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));
             
             if (existing.length === 0) {
                 await db.insert(cases).values({
                    maskedName: item.source || '媒體報導',
                    name: item.title,
                    originalName: item.title,
                    role: '媒體報導', 
                    riskTags: JSON.stringify(['新聞', keyword]),
                    location: '全台',
                    caseDate: new Date().toISOString(), // Yahoo 時間較難解析，暫用當下時間
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
          } catch(e) {}
      }
      
      // 禮貌性暫停 1 秒，避免對 Yahoo 太兇
      await new Promise(r => setTimeout(r, 1000));
    }

    // 寫入同步紀錄
    if (totalNewCount >= 0) {
        await db.insert(dataSyncLogs).values({
            sourceName: 'Yahoo 新聞 (Axios)',
            status: 'success',
            recordCount: totalNewCount,
            startedAt: new Date(),
            completedAt: new Date(),
        });
    }

    console.log(`\n\n✅ 新聞爬取完成！共新增 ${totalNewCount} 筆資料。`);

  } catch (error: any) {
    console.error("❌ 爬蟲發生錯誤:", error.message);
  } finally {
    process.exit(0);
  }
}

crawlNewsYahoo();