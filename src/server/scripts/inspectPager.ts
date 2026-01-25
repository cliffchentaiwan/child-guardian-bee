// src/server/scripts/inspectPager.ts
import puppeteer from 'puppeteer';

const SEARCH_URL = 'https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx';

async function inspectPager() {
  console.log("🕵️ [分頁偵探] 啟動！正在尋找「分頁按鈕」的構造...");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'] 
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto(SEARCH_URL, { waitUntil: 'networkidle2' });

    // 1. 鎖定並切換到「臺北市」 (確保有多頁資料)
    console.log("📍 正在切換到臺北市...");
    
    // 使用 v9 的智慧定位法
    const citySelectId = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const sel of selects) {
            if (sel.innerHTML.includes('基隆') && sel.innerHTML.includes('臺北')) return sel.id;
        }
        return null;
    });

    if (citySelectId) {
        const tpValue = await page.evaluate((id) => {
            const sel = document.getElementById(id) as HTMLSelectElement;
            const opt = Array.from(sel.options).find(o => o.text.includes('臺北'));
            return opt ? opt.value : null;
        }, citySelectId);

        if (tpValue) {
            const navPromise = page.waitForNavigation().catch(()=>{});
            await page.select(`#${citySelectId}`, tpValue);
            await navPromise;
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    // 2. 點擊搜尋
    const searchBtnSelector = 'input[type="submit"][name*="btnSearch"]';
    await page.waitForSelector(searchBtnSelector);
    await Promise.all([
        page.click(searchBtnSelector),
        new Promise(r => setTimeout(r, 4000))
    ]);

    // 3. 🔥 抓取表格底部的分頁 HTML
    console.log("📸 正在擷取分頁區塊...");
    
    const pagerInfo = await page.evaluate(() => {
        const table = document.querySelector('#GridView1');
        if (!table) return "❌ 找不到表格 #GridView1";
        
        const rows = table.querySelectorAll('tr');
        if (rows.length === 0) return "❌ 表格無內容";

        // ASP.NET GridView 的分頁通常在最後一列 (Last Row)
        const lastRow = rows[rows.length - 1];
        
        // 檢查這一列是否有分頁特徵 (例如有 table 或是 數字連結)
        return {
            tagName: lastRow.tagName,
            className: lastRow.className,
            html: lastRow.innerHTML.trim(),
            text: (lastRow as HTMLElement).innerText.trim()
        };
    });

    console.log("\n👇👇👇 請把下面這段結果貼給我 👇👇👇\n");
    console.log(JSON.stringify(pagerInfo, null, 2));
    console.log("\n👆👆👆 偵測結束 👆👆👆\n");

  } catch (error) {
    console.error("❌ 錯誤:", error);
  } finally {
    await browser.close();
  }
}

inspectPager();