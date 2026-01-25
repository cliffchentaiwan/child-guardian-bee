// src/server/scripts/debugCRC.ts
import puppeteer from 'puppeteer';

const TARGET_URL = 'https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction';

async function debugPageStructure() {
  console.log("🩻 啟動 CRC 網頁結構 X 光掃描 (TS 無敵版)...");
  
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--start-maximized']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`\n📄 前往：${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    await new Promise(r => setTimeout(r, 3000));

    console.log("\n🔎 正在掃描關鍵按鈕的 DNA...");

    // --- 核心診斷 ---
    const analysis = await page.evaluate(() => {
      const results: string[] = [];
      
      // 1. 找「查詢」相關
      const queryElements = document.querySelectorAll('button, input, a');
      queryElements.forEach(el => {
        // 使用 as any 強制讀取
        const text = (el as any).innerText || (el as any).value || '';
        if (text.includes('查詢') || text.includes('搜尋') || text.includes('Search')) {
           results.push(`[疑似查詢按鈕] <${el.tagName.toLowerCase()}> ID="${el.id}" Class="${el.className}" Text="${text}"`);
        }
      });

      // 2. 找「全選」相關
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
          if ((el as any).innerText?.trim() === '全選') {
              results.push(`[疑似全選文字] <${el.tagName.toLowerCase()}> Class="${el.className}" Parent=<${el.parentElement?.tagName.toLowerCase()}>`);
          }
      });

      // 3. 找 Checkbox
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      results.push(`[Checkbox 統計] 頁面上共有 ${checkboxes.length} 個勾選框`);
      if (checkboxes.length > 0) {
          // 這裡加上 as any，紅字就會消失
          const firstCb = checkboxes[0] as any; 
          results.push(`   - 第一個 Checkbox ID="${firstCb.id}" Name="${firstCb.name}"`);
      }

      return results;
    });

    console.log("\n📋 掃描報告：");
    console.log("---------------------------------------------------");
    if (analysis.length > 0) {
        analysis.forEach(line => console.log(line));
    } else {
        console.log("⚠️ 奇怪，完全找不到包含「查詢」或「全選」的元件。");
    }
    console.log("---------------------------------------------------");
    
    // 檢查表單
    const formInfo = await page.evaluate(() => {
        const form = document.querySelector('form');
        return form ? `Form Action="${form.action}" Method="${form.method}"` : '沒看到 <form> 標籤';
    });
    console.log(`🔹 表單結構: ${formInfo}`);

    console.log("\n😴 視窗停留 10 秒...");
    await new Promise(r => setTimeout(r, 10000));

  } catch (error: any) {
    console.error("❌ 掃描失敗:", error.message);
  } finally {
    await browser.close();
  }
}

debugPageStructure();