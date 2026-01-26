// src/server/scripts/debug_pagination.ts
import puppeteer from 'puppeteer';

async function debugPagination() {
  console.log("🕵️‍♂️ [偵探模式] 啟動！正在檢查分頁按鈕的真面目...");
  
  const browser = await puppeteer.launch({
    headless: false, // 開視窗讓您看
    defaultViewport: null,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  await page.goto('https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx');

  // 1. 點擊搜尋
  console.log("🤖 點擊搜尋...");
  const searchBtn = await page.waitForSelector('input[value="搜尋"]');
  await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(()=>{}),
      searchBtn?.click()
  ]);

  // 2. 等待資料出現
  console.log("⏳ 等待列表載入...");
  await page.waitForSelector('a.btn-primary', { timeout: 30000 });
  
  // 3. 滾動到底部
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 2000)); // 等一下讓它渲染

  // 4. 🔥 關鍵：抓取所有可能的「下一頁」按鈕資訊
  console.log("\n👇👇👇 請複製底下這段資訊給我 👇👇👇\n");
  
  const debugInfo = await page.evaluate(() => {
    // 抓取所有 a 標籤
    const allLinks = Array.from(document.querySelectorAll('a'));
    
    // 篩選出看起來像分頁的按鈕
    const targets = allLinks.filter(a => 
        a.innerText.includes('下一頁') || 
        a.innerText.includes('Next') || 
        a.innerText.includes('>') ||
        a.id.includes('PageControl')
    );

    return targets.map(a => ({
        text: a.innerText,
        id: a.id,
        class: a.className,
        href: a.getAttribute('href'),
        visible: (a.offsetWidth > 0 && a.offsetHeight > 0), // 檢查是否可見
        outerHTML: a.outerHTML // 最重要！直接把它的原始碼印出來
    }));
  });

  console.log(JSON.stringify(debugInfo, null, 2));
  console.log("\n👆👆👆 請複製上面這段資訊給我 👆👆👆\n");

  // 截圖存證
  await page.screenshot({ path: 'debug_pagination_view.png', fullPage: true });
  console.log("📸 已儲存網頁截圖：debug_pagination_view.png");

  await browser.close();
}

debugPagination();