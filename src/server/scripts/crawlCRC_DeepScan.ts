// src/server/scripts/crawlCRC_DeepScan.ts
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const TARGET_URL = 'https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction';

async function harvestDeepScan() {
  console.log("🤿 啟動 CRC 深潛爬蟲 (穿透 Iframe 版)...");
  
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
    
    // 等待網頁載入框架
    console.log("⏳ 等待 5 秒讓 Iframe 載入...");
    await new Promise(r => setTimeout(r, 5000));

    // --- 步驟 1: 尋找正確的 Frame (玻璃箱) ---
    console.log("🔍 正在尋找藏有資料的 Frame...");
    
    // 取得所有 frames
    const frames = page.frames();
    console.log(`ℹ️  網頁共有 ${frames.length} 個 Frame (內嵌視窗)`);

    let targetFrame = page.mainFrame(); // 預設先設為主視窗
    let foundFrame = false;

    // 遍歷所有 Frame，尋找含有「全選」或「查詢」的那個
    for (const frame of frames) {
        const text = await frame.evaluate(() => document.body?.innerText || '');
        if (text.includes('全選') || text.includes('查詢') || text.includes('searchBtn')) {
            console.log(`   ✅ 找到目標 Frame！(URL: ${frame.url()})`);
            targetFrame = frame;
            foundFrame = true;
            break;
        }
    }

    if (!foundFrame) {
        console.log("⚠️ 沒找到特定 Frame，將嘗試在主視窗操作...");
    }

    // --- 步驟 2: 在正確的 Frame 裡操作 ---
    console.log("🔽 設定下拉選單 (在 Frame 內部)...");
    await targetFrame.evaluate(() => {
      const options = Array.from(document.querySelectorAll('option'));
      const allOption = options.find(o => (o as any).innerText.includes('全選'));
      if (allOption && allOption.parentElement) {
         const select = allOption.parentElement as HTMLSelectElement;
         select.value = (allOption as HTMLOptionElement).value;
         select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    console.log("🔎 點擊搜尋按鈕 (在 Frame 內部)...");
    // 嘗試多種選擇器
    const clicked = await targetFrame.evaluate(() => {
        const btn = document.querySelector('.searchBtn') || 
                    document.querySelector('input[value="搜尋"]') ||
                    document.querySelector('button');
        if (btn) {
            (btn as HTMLElement).click();
            return true;
        }
        return false;
    });

    if (clicked) console.log("   ✅ 按鈕點擊成功！");
    else console.log("   ❌ 找不到按鈕點擊！");

    console.log("⏳ 等待 5 秒讓資料載入...");
    await new Promise(r => setTimeout(r, 5000));

    // --- 步驟 3: 在所有 Frame 裡暴力搜索表格 ---
    console.log("🌾 開始全域掃描資料...");
    
    let allData: any[] = [];

    // 我們再次遍歷所有 frame，因為資料可能跑出來在另一個 frame (雖然很少見)
    for (const frame of page.frames()) {
        const frameData = await frame.evaluate(() => {
            const rows: any[] = [];
            const trs = document.querySelectorAll('tr');
            
            trs.forEach((tr, index) => {
                const tds = tr.querySelectorAll('td');
                // 有效資料通常有 3 欄以上
                if (tds.length >= 3) {
                    const rawText = (tr as HTMLElement).innerText.replace(/\s+/g, ' ').trim();
                    // 簡單過濾掉標題列 (通常標題列會有 '姓名' 兩個字)
                    if (rawText.length > 5 && !rawText.includes("顯示第")) {
                        rows.push({
                            rawText: rawText,
                            htmlSnippet: tr.innerHTML.substring(0, 100) // 截取一點 HTML 確認用
                        });
                    }
                }
            });
            return rows;
        });

        if (frameData.length > 0) {
            console.log(`   ✨ 在某個 Frame 裡發現了 ${frameData.length} 筆資料！`);
            allData = allData.concat(frameData);
        }
    }

    // --- 存檔 ---
    if (allData.length > 0) {
        console.log(`\n🎉 總共抓到 ${allData.length} 筆資料！`);
        console.log("👀 第一筆預覽：", allData[0]);

        const outputDir = path.join(process.cwd(), 'src', 'server', 'seedData');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const filePath = path.join(outputDir, 'crc_raw.json');
        fs.writeFileSync(filePath, JSON.stringify(allData, null, 2));
        console.log(`\n💾 檔案已儲存至：${filePath}`);
    } else {
        console.log("❌ 依然是 0 筆。這代表可能還是在載入中，或者是 Shadow DOM。");
    }

    console.log("😴 瀏覽器將停留 10 秒...");
    await new Promise(r => setTimeout(r, 10000));

  } catch (error: any) {
    console.error("❌ 失敗:", error.message);
  } finally {
    await browser.close();
  }
}

harvestDeepScan();