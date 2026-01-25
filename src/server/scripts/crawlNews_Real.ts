// src/server/scripts/crawlNews_Real.ts
import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
// 🔥 修正：使用 SQLite 連線
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

const KEYWORDS = ['兒少性剝削', '拍攝未成年', '違反兒少法', '幼兒園 違規']; 

async function crawlRealNews() {
  console.log("🕵️‍♀️ [新聞爬蟲] 啟動！正在掃描 Yahoo 新聞...");
  
  let newCount = 0;

  try {
    for (const keyword of KEYWORDS) {
      console.log(`🔎 正在搜尋：${keyword}...`);
      
      const url = `https://tw.news.yahoo.com/search?p=${encodeURIComponent(keyword)}`;
      
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const $ = cheerio.load(data);
      // Yahoo 新聞結構可能會變，這裡抓取通用的列表項目
      const listItems = $('li.StreamMegaItem'); 

      for (const element of listItems) {
        const title = $(element).find('h3 a').text();
        const link = $(element).find('h3 a').attr('href');
        
        if (!title || !link || title.length < 5) continue;

        const existing = await db.select().from(cases).where(eq(cases.sourceLink, link));
        
        if (existing.length === 0) {
          console.log(`✨ 發現新案件：${title.substring(0, 30)}...`);
          
          await db.insert(cases).values({
            maskedName: '新聞報導',
            name: '新聞報導',
            originalName: title.substring(0, 50),
            role: '待確認', 
            riskTags: JSON.stringify([keyword, '媒體報導']), // 轉 JSON 字串
            location: '網路來源',
            // 🔥 修正：日期轉 ISO 字串
            caseDate: new Date().toISOString(),
            description: title,
            sourceType: 'news',
            sourceLink: link,
            verified: false,
            createdAt: new Date(),
          });
          newCount++;
        }
      }
      // 禮貌性暫停
      await new Promise(r => setTimeout(r, 1000));
    }

    // 寫入同步紀錄
    if (newCount >= 0) {
        await db.insert(dataSyncLogs).values({
            sourceName: 'Yahoo 新聞爬蟲',
            status: 'success',
            recordCount: newCount,
            startedAt: new Date(),
            completedAt: new Date(),
        });
    }

    console.log(`✅ 新聞爬取完成！共新增 ${newCount} 筆資料。`);

  } catch (error) {
    console.error("❌ 爬蟲發生錯誤:", error);
  } finally {
    process.exit(0);
  }
}

crawlRealNews();