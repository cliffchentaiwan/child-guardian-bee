// src/server/scripts/crawlNews.ts
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

// 關鍵字：鎖定台灣、近五年、排除政策討論
const KEYWORDS = [
    "台灣 幼兒園 虐童 -修法 -草案 -立委 -中國 -大陸",
    "台灣 補習班 性騷擾 -修法 -政策 -中國",
    "台灣 保母 虐待 -修法 -公聽會",
    "台灣 狼師 性侵 -電影 -戲劇",
    "黃子佼 兒少性剝削",
    "幼兒園 不當管教 裁罰"
];

async function crawlNews() {
  console.log("📰 啟動媒體收割機 (可視化除錯版)...");
  
  // 🔥 修改 1：開啟視窗 (headless: false)，讓你看得到瀏覽器
  const browser = await puppeteer.launch({
    headless: false, // 👈 改成 false，瀏覽器會彈出來
    defaultViewport: null, // 使用預設視窗大小
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // 偽裝 User-Agent
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const allNews: any[] = [];

  for (const keyword of KEYWORDS) {
      console.log(`\n🔍 正在搜尋：${keyword}`);
      
      try {
          const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=nws&tbs=qdr:y5&gl=tw`;
          
          // 🔥 修改 2：改用 domcontentloaded，不用等全部轉圈圈結束，只要文字出來就抓
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          // 等待一下，確保內容渲染
          await new Promise(r => setTimeout(r, 2000));

          // 抓取新聞
          const newsItems = await page.evaluate(() => {
              const items: any[] = [];
              // Google News 的通用結構 (嘗試多種選擇器以防萬一)
              // 選擇器 1: 標準新聞卡片
              let elements = document.querySelectorAll('div.SoaBEf');
              
              // 選擇器 2: 如果上面的沒抓到，試試看通用的搜尋結果容器
              if (elements.length === 0) {
                  elements = document.querySelectorAll('[data-hveid] div[role="heading"]'); 
                  // 這裡邏輯會比較複雜，先維持主要選擇器，如果真的抓不到我們再換
              }

              elements.forEach(el => {
                  const titleEl = el.querySelector('div[role="heading"]');
                  const linkEl = el.querySelector('a');
                  const descEl = el.querySelector('.GI74Re'); 
                  const sourceEl = el.querySelector('.NUnG9d span'); 
                  const timeEl = el.querySelector('.OSrXXb span'); 
                  
                  if (titleEl && linkEl) {
                      const title = titleEl.textContent || "";
                      // 簡單過濾
                      if (title.includes("修法") || title.includes("讀者投書") || title.includes("懶人包")) return;

                      items.push({
                          title: title,
                          url: linkEl.href,
                          description: descEl ? descEl.textContent : "",
                          source: sourceEl ? sourceEl.textContent : "新聞媒體",
                          time: timeEl ? timeEl.textContent : "",
                          keyword: "" 
                      });
                  }
              });
              return items;
          });

          console.log(`   ✅ 抓到 ${newsItems.length} 則新聞`);
          
          newsItems.forEach(item => {
              const cleanKeyword = keyword.split(' ')[1] || keyword;
              item.keyword = cleanKeyword;
              allNews.push(item);
          });

          // 休息 2 秒 (你看得到它在休息)
          await new Promise(r => setTimeout(r, 2000));

      } catch (e: any) {
          console.error(`   ❌ 搜尋失敗: ${e.message}`);
      }
  }

  // 存檔
  if (allNews.length > 0) {
      const outputDir = path.join(process.cwd(), 'src', 'server', 'seedData');
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      const filePath = path.join(outputDir, 'news_raw.json');
      fs.writeFileSync(filePath, JSON.stringify(allNews, null, 2));
      console.log(`\n💾 已儲存 ${allNews.length} 筆新聞資料！`);
  } else {
      console.log("\n⚠️ 沒抓到資料。如果你看到瀏覽器跳出 '我不是機器人'，請手動點擊它！");
  }

  await browser.close();
}

crawlNews();