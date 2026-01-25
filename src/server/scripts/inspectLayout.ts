// src/server/scripts/inspectLayout.ts
import puppeteer from 'puppeteer';

const TARGET_URL = 'https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx';

async function inspectLayout() {
  console.log("🕵️ 啟動偵探模式！正在分析網頁結構...");
  
  const browser = await puppeteer.launch({
    headless: false, 
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });

  try {
    const page = await browser.newPage();
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

    // 1. 自動選取臺北市 (複製之前的成功邏輯)
    const selectSelector = 'select'; 
    await page.waitForSelector(selectSelector);
    const options = await page.$$eval(`${selectSelector} option`, opts => opts.map(o => ({ val: o.value, text: o.innerText })));
    const targetCity = options.find(o => o.text.includes('臺北') || o.text.includes('台北'));
    
    if (targetCity) {
        console.log(`✅ 選取：${targetCity.text}`);
        await page.select(selectSelector, targetCity.val);
        await new Promise(r => setTimeout(r, 2000));
    }

    // 2. 點擊搜尋
    const searchBtnSelector = 'input[type="submit"][name*="btnSearch"]';
    await page.click(searchBtnSelector);
    console.log("⏳ 等待資料載入...");
    await new Promise(r => setTimeout(r, 5000)); // 等久一點確保載入

    // 3. 🔥 關鍵：印出第一筆資料的 HTML 結構
    const structure = await page.evaluate(() => {
        // 抓取主要的表格
        const table = document.querySelector('table[id*="GridView"]'); // 通常是 GridView
        if (!table) return "❌ 找不到 GridView 表格，可能用的是 div 列表";

        // 抓取前 3 個 tr (列) 的內容
        const rows = table.querySelectorAll('tr');
        if (rows.length === 0) return "❌ 表格裡面沒有 tr";

        let log = "✅ 成功抓到表格結構！\n";
        for (let i = 0; i < Math.min(rows.length, 3); i++) {
            log += `\n--- 第 ${i+1} 列 (Row ${i+1}) ---\n`;
            log += rows[i].innerHTML.trim().substring(0, 500); // 只取前500字避免太長
            log += "\n--------------------------\n";
        }
        return log;
    });

    console.log("\n👇👇👇 請把下面這段結果貼給我 👇👇👇\n");
    console.log(structure);
    console.log("\n👆👆👆 偵測結束 👆👆👆\n");

  } catch (error) {
    console.error("❌ 錯誤:", error);
  } finally {
    await browser.close();
  }
}

inspectLayout();