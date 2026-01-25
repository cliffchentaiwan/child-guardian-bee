// src/server/scripts/inspectContent.ts
import puppeteer from 'puppeteer';

const TARGET_URL = 'https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx';

async function inspectContent() {
  console.log("🕵️ 啟動讀心術模式！正在讀取卡片內容...");
  
  const browser = await puppeteer.launch({
    headless: false, // 開啟視窗
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });

  try {
    const page = await browser.newPage();
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

    // 1. 點擊搜尋
    const searchBtnSelector = 'input[type="submit"][name*="btnSearch"]';
    await page.waitForSelector(searchBtnSelector);
    await Promise.all([
        page.click(searchBtnSelector),
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {})
    ]);

    // 2. 等待卡片出現
    await page.waitForSelector('.kdCard-txt', { visible: true, timeout: 10000 });

    // 3. 🔥 關鍵：把第一張卡片的文字全部印出來
    const cardContent = await page.evaluate(() => {
        const firstCard = document.querySelector('.kdCard-txt');
        if (!firstCard) return "❌ 找不到卡片";
        
        // 回傳該元素的純文字內容 (innerText) 和 HTML
        return {
            text: (firstCard as HTMLElement).innerText,
            html: firstCard.innerHTML
        };
    });

    console.log("\n👇👇👇 請把下面這段結果貼給我 👇👇👇\n");
    console.log("--- 卡片純文字 (Text) ---");
    console.log(cardContent.text);
    console.log("\n--- 卡片原始碼 (HTML) ---");
    console.log(cardContent.html); // 這一行可能會很長，沒關係
    console.log("\n👆👆👆 偵測結束 👆👆👆\n");

  } catch (error) {
    console.error("❌ 錯誤:", error);
  } finally {
    await browser.close();
  }
}

inspectContent();