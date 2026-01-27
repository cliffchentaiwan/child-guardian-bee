import puppeteer from 'puppeteer';
import fs from 'fs';

// 這是專門用來「抓兇手」的偵探腳本
async function debug() {
  console.log("🕵️‍♂️ [診斷模式] 啟動！");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized', '--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  try {
    console.log("📄 前往司法院查詢系統...");
    await page.goto('https://judgment.judicial.gov.tw/FJUD/default.aspx');
    
    // 自動填入關鍵字方便您操作
    try { await page.type('#txtKW', "兒童及少年福利與權益保障法"); } catch(e) {}

    console.log("\n👇👇👇 [請執行操作] 👇👇👇");
    console.log("1. 請手動輸入驗證碼。");
    console.log("2. 按下「查詢」，直到您看到「判決列表」出現。");
    console.log("⏳ 我會等待 60 秒，請確保這期間畫面停在「列表頁」...");

    // 倒數 60 秒
    for(let i=60; i>0; i-=5) {
        process.stdout.write(`還剩 ${i} 秒... `);
        await new Promise(r => setTimeout(r, 5000));
    }
    console.log("\n⚡️ 時間到！開始蒐證...");

    // 1. 拍下程式看到的畫面 (確認是否真的在列表頁)
    await page.screenshot({ path: 'debug_screenshot.png', fullPage: true });
    console.log("📸 已截圖：debug_screenshot.png");

    // 2. 存下網頁原始碼 (確認 HTML 結構)
    const html = await page.content();
    fs.writeFileSync('debug_html.html', html);
    console.log("📝 已儲存原始碼：debug_html.html");

    // 3. 檢查 Frame (是否有 iframe 搞鬼)
    const frames = page.frames();
    console.log(`👀 偵測到 ${frames.length} 個 Frame`);
    
    let foundRows = 0;
    for (const frame of frames) {
        const rows = await frame.$$('.tab-list tbody tr'); // 這是我們原本用的選擇器
        if (rows.length > 0) {
            console.log(`✅ 在 Frame (${frame.url()}) 找到 ${rows.length} 筆資料！`);
            foundRows += rows.length;
            
            // 順便把這個 Frame 的 HTML 也存下來
            const frameHtml = await frame.content();
            fs.writeFileSync('debug_frame.html', frameHtml);
            console.log("📝 已儲存 Frame 原始碼：debug_frame.html");
        }
    }

    if (foundRows === 0) {
        console.log("❌ 全域搜索失敗：完全找不到 `.tab-list tbody tr` 選擇器。");
        console.log("👉 請提供截圖與 HTML 檔案，讓我修正選擇器。");
    }

  } catch (e) {
    console.error("錯誤:", e);
  } finally {
    await browser.close();
  }
}

debug();