// src/server/scripts/scoutCRC.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import fs from 'fs';

async function scout() {
  console.log("🕵️ CRC 偵察兵啟動...");
  const browser = await puppeteer.launch({ 
      headless: false, // 開啟視窗讓您看得到
      defaultViewport: null,
      args: ['--start-maximized'] 
  });
  
  const page = await browser.newPage();
  
  try {
    // 1. 前往網站
    await page.goto('https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction', { waitUntil: 'networkidle2' });
    console.log("📸 已抵達頁面...");

    // 2. 嘗試點擊搜尋（全選 + 查詢）
    await page.evaluate(() => {
        // 選全選
        const options = Array.from(document.querySelectorAll('option'));
        const allOption = options.find(o => o.innerText.includes('全選'));
        if (allOption && allOption.parentElement) {
            const select = allOption.parentElement as HTMLSelectElement;
            select.value = allOption.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        // 點按鈕
        const btn = document.querySelector('.searchBtn') as HTMLElement;
        if(btn) btn.click();
    });
    
    console.log("⏳ 等待 5 秒讓資料載入...");
    await new Promise(r => setTimeout(r, 5000));

    // 3. 【關鍵 Skill】截圖
    await page.screenshot({ path: 'crc_debug.png', fullPage: true });
    console.log("✅ 截圖已儲存：crc_debug.png");

    // 4. 【關鍵 Skill】Dump 結構
    // 我們把所有 Frame 的 HTML 都抓出來，這樣我就能幫您找正確的 Selector
    let fullHtml = '';
    for (const frame of page.frames()) {
        try {
            const content = await frame.content();
            fullHtml += `\n\n\n${content}`;
        } catch(e) {}
    }
    fs.writeFileSync('crc_dump.html', fullHtml);
    console.log("✅ 結構已儲存：crc_dump.html");

  } catch (e) {
    console.error(e);
  } finally {
    await browser.close();
  }
}
scout();