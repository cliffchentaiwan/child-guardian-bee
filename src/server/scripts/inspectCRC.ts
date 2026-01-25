// src/server/scripts/inspectCRC.ts
import puppeteer from 'puppeteer';

const TARGET_URL = 'https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction';

async function inspectCRC() {
  console.log("🩺 啟動 CRC 結構診斷工具...");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  try {
    const page = await browser.newPage();
    // 模擬您的螢幕寬度，確保重現卡片模式
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log(`\n📄 前往：${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

    console.log("🤖 自動搜尋中...");
    
    // 自動搜尋邏輯
    await page.evaluate(async () => {
        const options = Array.from(document.querySelectorAll('option'));
        const allOption = options.find(o => (o as any).innerText.includes('全選'));
        if (allOption) {
            const select = allOption.parentElement as HTMLSelectElement;
            select.value = (allOption as HTMLOptionElement).value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        await new Promise(r => setTimeout(r, 500));
        const btn = document.querySelector('.searchBtn') || 
                    Array.from(document.querySelectorAll('button, input')).find(b => (b as any).innerText?.includes('搜尋'));
        if (btn) (btn as HTMLElement).click();
    });

    console.log("⏳ 等待資料載入...");
    await new Promise(r => setTimeout(r, 5000));

    // --- 診斷核心 ---
    console.log("🔬 正在提取網頁結構...");

    const debugInfo = await page.evaluate(() => {
        // 1. 找到包含 "裁罰對象" 的那個元素
        const allElements = Array.from(document.querySelectorAll('*')); // 抓所有元素
        const label = allElements.find(el => 
            el.children.length === 0 && el.innerText?.trim() === '裁罰對象'
        );

        if (!label) return { error: "找不到「裁罰對象」這個關鍵字，可能網頁沒載入成功。" };

        // 2. 抓取它爸爸、爺爺的 HTML，讓我們看清楚家族結構
        const parent = label.parentElement;
        const grandParent = parent?.parentElement;
        const greatGrandParent = grandParent?.parentElement;

        return {
            labelTag: label.tagName,
            labelClass: label.className,
            // 抓取 label 附近的 HTML 結構
            nearHtml: grandParent ? grandParent.outerHTML : "無法取得結構",
            // 嘗試抓下一個兄弟
            nextSiblingHtml: label.nextElementSibling ? label.nextElementSibling.outerHTML : "無下一個兄弟",
            parentNextHtml: parent?.nextElementSibling ? parent.nextElementSibling.outerHTML : "父層無下一個兄弟"
        };
    });

    console.log("\n👇👇👇 請把下面這段內容貼給我 👇👇👇\n");
    console.log(JSON.stringify(debugInfo, null, 2));
    console.log("\n👆👆👆 診斷結束 👆👆👆\n");

  } catch (error: any) {
    console.error("❌ 錯誤:", error.message);
  } finally {
    await browser.close();
  }
}

inspectCRC();