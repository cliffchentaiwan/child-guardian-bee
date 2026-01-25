// src/server/scripts/inspectDetail.ts
import puppeteer from 'puppeteer';

// 這是詳細頁面的基礎網址
const SEARCH_URL = 'https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx';

async function inspectDetail() {
  console.log("🕵️ [詳細頁面偵測] 啟動！我們來看看詳細頁面到底長怎樣...");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });

  try {
    const page = await browser.newPage();
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle2' });

    // 1. 直接按搜尋 (不需要選縣市，我們只要看結構，基隆的也可以)
    const searchBtnSelector = 'input[type="submit"][name*="btnSearch"]';
    await page.waitForSelector(searchBtnSelector);
    await Promise.all([
        page.click(searchBtnSelector),
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {})
    ]);

    // 2. 抓取第一筆資料的「加密代碼 (sch)」
    await page.waitForSelector('.kdCard-txt', { visible: true, timeout: 10000 });
    
    const targetLink = await page.evaluate(() => {
        // 找到第一個檢視按鈕
        const btn = document.querySelector('a[id*="lbView"]');
        if (!btn) return null;
        
        // 從 onclick="...punish_view.aspx?sch=XXX..." 提取 sch
        const onclickText = btn.getAttribute('onclick') || '';
        const match = onclickText.match(/punish_view\.aspx\?sch=([^'&]+)/);
        return match ? match[1] : null;
    });

    if (!targetLink) {
        console.log("❌ 找不到檢視按鈕或連結解析失敗");
        return;
    }

    console.log(`🔗 取得代碼：${targetLink}，正在進入詳細頁面...`);

    // 3. 進入詳細頁面
    const detailUrl = `https://ap.ece.moe.edu.tw/webecems/dtl/punish_view.aspx?sch=${targetLink}`;
    await page.goto(detailUrl, { waitUntil: 'networkidle2' });

    // 4. 🔥 關鍵：印出頁面結構
    const structure = await page.evaluate(() => {
        // 試著抓這裡面最大的容器
        const mainContent = document.querySelector('form') || document.body;
        
        // 為了不讓畫面太亂，我們只抓前 1000 個字，或者抓特定的區塊
        // 看看有沒有表格
        const tables = document.querySelectorAll('table');
        if (tables.length > 0) {
            return `✅ 發現 ${tables.length} 個表格！\n\n--- 表格 HTML (前500字) ---\n${tables[0].outerHTML.substring(0, 800)}...`;
        }

        // 如果沒有表格，抓 div 結構
        return `❌ 沒看到表格！\n\n--- 頁面文字前 500 字 ---\n${document.body.innerText.substring(0, 500)}\n\n--- HTML 結構 ---\n${mainContent.innerHTML.substring(0, 800)}...`;
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

inspectDetail();