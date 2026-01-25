// src/server/scripts/scoutJudicial.ts
import puppeteer from 'puppeteer';

// 司法院裁判書查詢系統
const JUDICIAL_URL = 'https://judgment.judicial.gov.tw/FJUD/default.aspx';

async function scoutJudicial() {
  console.log("⚖️ [司法院偵察兵] 啟動！目標：判決書查詢系統...");
  console.log("⚠️ 注意：這個網站有驗證碼，等一下需要你「手動」幫忙輸入！");

  const browser = await puppeteer.launch({
    headless: false, // 必須開啟視窗，不然你看不到驗證碼
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'] 
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 1. 前往網站
    await page.goto(JUDICIAL_URL, { waitUntil: 'networkidle2' });
    console.log("📍 已抵達司法院網站。");

    // 2. 自動填入關鍵字 (幫你省力)
    const keyword = "幼兒園 虐童"; // 測試關鍵字
    const inputSelector = '#txtKW'; // 搜尋框 ID (通常是這個，若改版需調整)
    
    try {
        await page.waitForSelector(inputSelector, { timeout: 5000 });
        await page.type(inputSelector, keyword);
        console.log(`✅ 已自動填入關鍵字：${keyword}`);
    } catch (e) {
        console.log("⚠️ 找不到搜尋框，請手動輸入。");
    }

    // 3. 🔥 等待人類介入 (Wait for Human)
    console.log("\n👇👇👇 [請執行以下動作] 👇👇👇");
    console.log("1. 請在瀏覽器中，手動輸入「驗證碼」。");
    console.log("2. 按下「查詢」按鈕。");
    console.log("3. 等待搜尋結果列表出現...");
    console.log("----------------------------------");

    // 程式會在這裡死守，直到網址發生變化 (代表搜尋成功進入結果頁)
    // 司法院結果頁通常包含 "FJUD/data.aspx" 或類似結構
    await page.waitForNavigation({ timeout: 600000 }); // 給你 10 分鐘輸入驗證碼
    
    console.log("🎉 偵測到頁面跳轉！搜尋成功！");

    // 4. 抓取第一頁的結構給你看
    console.log("📸 正在分析搜尋結果結構...");
    
    const structure = await page.evaluate(() => {
        // 嘗試抓取列表中的案件標題
        // 通常結構是 table 或 div 列表
        const results: any[] = [];
        // 這裡需要根據實際 HTML 調整，我們先試著抓所有的連結
        const links = Array.from(document.querySelectorAll('a'));
        
        links.forEach(a => {
            if (a.innerText.includes('判決') || a.innerText.includes('裁定')) {
                results.push({
                    text: a.innerText,
                    href: a.getAttribute('href')
                });
            }
        });
        return results.slice(0, 5); // 只抓前 5 筆
    });

    console.log("\n👇 搜尋結果範例 (前 5 筆) 👇");
    console.log(JSON.stringify(structure, null, 2));
    console.log("\n✅ 偵察任務完成！如果看到上面的資料，代表我們可以開始寫正式爬蟲了。");

  } catch (error) {
    console.error("❌ 錯誤:", error);
  } finally {
    // 這裡先不關閉瀏覽器，讓你看看結果
    // await browser.close(); 
  }
}

scoutJudicial();