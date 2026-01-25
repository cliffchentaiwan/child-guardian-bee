// src/server/scripts/inspectPager_v2.ts
import puppeteer from 'puppeteer';

const SEARCH_URL = 'https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx';

async function inspectPagerV2() {
  console.log("🕵️ [分頁偵探 v2] 啟動！這次我們直接搜索關鍵字...");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'] 
  });

  try {
    const page = await browser.newPage();
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle2' });

    // 1. 切換到臺北市 (確保資料夠多)
    console.log("📍 切換城市中...");
    const citySelectId = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const sel of selects) {
            if (sel.innerHTML.includes('臺北')) return sel.id;
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
            await page.select(`#${citySelectId}`, tpValue);
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    // 2. 點擊搜尋
    const searchBtnSelector = 'input[type="submit"][name*="btnSearch"]';
    await page.waitForSelector(searchBtnSelector);
    await Promise.all([
        page.click(searchBtnSelector),
        new Promise(r => setTimeout(r, 5000)) // 等久一點
    ]);

    // 3. 🔥 全域搜索分頁特徵
    console.log("🔍 正在尋找分頁按鈕...");
    
    const pagerDebug = await page.evaluate(() => {
        // 策略 A: 找含有 "..." 的連結
        const links = Array.from(document.querySelectorAll('a'));
        const nextDots = links.find(a => a.innerText.includes('...') || a.innerText.includes('下一頁'));
        
        // 策略 B: 找數字 "2" 的連結 (通常是第2頁)
        const pageTwo = links.find(a => a.innerText.trim() === '2');

        if (nextDots || pageTwo) {
            const target = nextDots || pageTwo;
            const parent = target?.parentElement;
            const grandParent = parent?.parentElement;
            
            return {
                found: true,
                text: target?.innerText,
                href: target?.getAttribute('href'),
                // 回傳父層 HTML 讓我們看看結構
                parentHtml: parent?.outerHTML.substring(0, 500),
                grandParentHtml: grandParent?.outerHTML.substring(0, 500)
            };
        } else {
            // 策略 C: 真的沒分頁？檢查一下總筆數
            const bodyText = document.body.innerText;
            return {
                found: false,
                hasData: bodyText.includes('嘉朵'), // 確認有抓到資料
                context: "找不到 '...' 或 '2' 的連結"
            };
        }
    });

    console.log("\n👇👇👇 請把下面這段結果貼給我 👇👇👇\n");
    console.log(JSON.stringify(pagerDebug, null, 2));
    console.log("\n👆👆👆 偵測結束 👆👆👆\n");

  } catch (error) {
    console.error(error);
  } finally {
    await browser.close();
  }
}

inspectPagerV2();