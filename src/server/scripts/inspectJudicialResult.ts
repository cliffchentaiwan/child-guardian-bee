// src/server/scripts/inspectJudicialResult.ts
import puppeteer from 'puppeteer';

const JUDICIAL_URL = 'https://judgment.judicial.gov.tw/FJUD/default.aspx';

async function inspectJudicialResult() {
  console.log("🕵️ [司法院偵探] 啟動！目標：找出真正的結果表格...");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'] 
  });

  try {
    const page = await browser.newPage();
    await page.goto(JUDICIAL_URL, { waitUntil: 'networkidle2' });

    // 1. 自動填關鍵字
    try {
        await page.type('#txtKW', "幼兒園 虐童"); 
    } catch(e) {}

    console.log("\n👇👇👇 [請執行動作] 👇👇👇");
    console.log("1. 輸入驗證碼");
    console.log("2. 按查詢");
    console.log("3. 等待結果列表出現");
    console.log("----------------------------");

    // 2. 🔥 智慧等待：等到「裁判字號」這四個字出現
    // 這代表結果表格已經載入
    await page.waitForFunction(() => {
        return document.body.innerText.includes('裁判字號') && document.body.innerText.includes('裁判日期');
    }, { timeout: 300000 }); // 5分鐘

    console.log("🎉 偵測到結果表格！正在分析...");
    await new Promise(r => setTimeout(r, 2000));

    // 3. 抓取表格結構
    const tableStructure = await page.evaluate(() => {
        // 策略：找到包含 "裁判字號" 的那個 <tr>，然後往上找它的 <table>
        const headers = Array.from(document.querySelectorAll('th, td'));
        const targetHeader = headers.find(el => el.innerText.includes('裁判字號'));
        
        if (!targetHeader) return "❌ 找不到表頭 '裁判字號'";

        // 找到所在的表格
        let table = targetHeader.closest('table');
        if (!table) return "❌ 找不到父層表格";

        // 回傳前 3 列的 HTML 給開發者分析
        const rows = table.querySelectorAll('tr');
        let log = `✅ 鎖定表格！(共 ${rows.length} 列)\n`;
        
        // 抓前 3 列 (Row 0 是表頭, Row 1 是第一筆資料)
        for(let i=0; i<Math.min(rows.length, 3); i++) {
            log += `\n--- Row ${i} ---\n`;
            log += rows[i].innerHTML.trim().substring(0, 800);
        }
        return log;
    });

    console.log("\n👇👇👇 請把下面這段 HTML 貼給我 👇👇👇\n");
    console.log(tableStructure);
    console.log("\n👆👆👆 偵測結束 👆👆👆\n");

  } catch (error) {
    console.error(error);
  } finally {
    // browser.close(); // 先不關，讓你檢查
  }
}

inspectJudicialResult();