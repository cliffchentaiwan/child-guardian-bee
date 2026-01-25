// src/server/scripts/cameraCRC.ts
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const TARGET_URL = 'https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction';

async function takeEvidence() {
  console.log("📸 啟動 CRC 照相機與證據保全...");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`\n📄 前往：${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    await new Promise(r => setTimeout(r, 2000));

    // --- 動作 1: 選取全選 ---
    console.log("🔽 設定下拉選單...");
    await page.evaluate(() => {
      const options = Array.from(document.querySelectorAll('option'));
      const allOption = options.find(o => (o as any).innerText.includes('全選'));
      if (allOption && allOption.parentElement) {
         const select = allOption.parentElement as HTMLSelectElement;
         select.value = (allOption as HTMLOptionElement).value;
         select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // --- 動作 2: 點擊搜尋 ---
    console.log("🔎 點擊搜尋按鈕...");
    await page.evaluate(() => {
        const btn = document.querySelector('.searchBtn');
        if (btn) (btn as HTMLElement).click();
    });

    console.log("⏳ 等待 5 秒讓資料載入...");
    await new Promise(r => setTimeout(r, 5000));

    // --- 關鍵動作：拍照存證 ---
    console.log("📸 正在截圖...");
    const screenshotPath = path.join(process.cwd(), 'debug_screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    
    // --- 關鍵動作：存下 HTML ---
    console.log("💾 正在儲存網頁原始碼...");
    const htmlContent = await page.content();
    const htmlPath = path.join(process.cwd(), 'debug_page.html');
    fs.writeFileSync(htmlPath, htmlContent);

    console.log("\n✅ 證據已保存！");
    console.log(`   👉 圖片路徑: ${screenshotPath}`);
    console.log(`   👉 原始碼路徑: ${htmlPath}`);

    // --- 簡單分析 ---
    const textSample = await page.evaluate(() => document.body.innerText);
    if (textSample.includes("此條件查無資料") || textSample.includes("沒有資料")) {
        console.log("⚠️ 偵測到網頁顯示「查無資料」，可能是選項沒生效。");
    } else if (textSample.includes("違反兒少法") && textSample.length > 500) {
        console.log("✨ 網頁文字量很大，看起來資料有跑出來！可能是選擇器選錯了。");
    }

    console.log("\n😴 瀏覽器將停留 30 秒，請您手動操作確認資料是否真的在上面...");
    await new Promise(r => setTimeout(r, 30000));

  } catch (error: any) {
    console.error("❌ 失敗:", error.message);
  } finally {
    await browser.close();
  }
}

takeEvidence();