// src/server/scripts/crawlCRC_Tabs.ts
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio'; // 這次我們用強大的 cheerio 來解析 HTML
import fs from 'fs';
import path from 'path';

const TARGET_URL = 'https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction';

async function harvestTabs() {
  console.log("📑 啟動 CRC 多重分頁捕獲程式...");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized'] // 最大化視窗
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`\n📄 前往：${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // 等待載入
    await new Promise(r => setTimeout(r, 3000));

    // --- 步驟 1: 操作 (全選 -> 搜尋) ---
    console.log("🎮 正在尋找按鈕並點擊...");
    
    // 我們同時在主頁面和所有 Frame 裡嘗試點擊
    const clicked = await page.evaluate(() => {
        // 嘗試找 Frame
        const frames = Array.from(window.frames);
        // 如果有 frame，嘗試進去點 (這裡只能做簡單觸發)
        // 為了保險，我們直接用暴力法：找按鈕就按
        const btn = document.querySelector('.searchBtn') || 
                    Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('搜尋'));
        
        if (btn) {
            (btn as HTMLElement).click();
            return true;
        }
        return false;
    });

    // 如果主頁面沒點到，試著遍歷 Puppeteer 的 Frames
    if (!clicked) {
        for (const frame of page.frames()) {
            await frame.evaluate(() => {
                const options = Array.from(document.querySelectorAll('option'));
                const allOption = options.find(o => (o as any).innerText.includes('全選'));
                if (allOption && allOption.parentElement) {
                    const select = allOption.parentElement as HTMLSelectElement;
                    select.value = (allOption as HTMLOptionElement).value;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
                const btn = document.querySelector('.searchBtn');
                if (btn) (btn as HTMLElement).click();
            });
        }
    }

    console.log("⏳ 已點擊，等待 10 秒讓資料出現 (或新分頁開啟)...");
    await new Promise(r => setTimeout(r, 10000));

    // --- 步驟 2: 檢查所有分頁 ---
    console.log("\n🕵️‍♂️ 開始檢查所有開啟的分頁 (Tabs)...");
    
    // 取得瀏覽器中所有的分頁
    const allPages = await browser.pages();
    console.log(`   ℹ️ 目前瀏覽器共有 ${allPages.length} 個分頁`);

    let foundData: any[] = [];

    // 一個一個分頁檢查
    for (let i = 0; i < allPages.length; i++) {
        const currentPage = allPages[i];
        const url = currentPage.url();
        console.log(`   📄 檢查分頁 ${i + 1}: ${url}`);

        // 拿到這個分頁的 HTML
        try {
            // 確保分頁是活著的
            await currentPage.bringToFront(); 
            const html = await currentPage.content();
            
            // 使用 Cheerio 解析 (比 Puppeteer 更強大，不怕 DOM 結構怪異)
            const $ = cheerio.load(html);
            const text = $('body').text();

            // 判斷依據：是否有「姓名」和「違反」相關字眼
            if (text.includes("姓名") && (text.includes("違反") || text.includes("法條"))) {
                console.log(`   ✨ 賓果！在分頁 ${i + 1} 發現目標資料！`);
                
                // 開始解析表格
                $('tr').each((idx, el) => {
                    const tds = $(el).find('td');
                    if (tds.length >= 4) {
                        const name = $(tds[2]).text().trim();
                        const location = $(tds[1]).text().trim();
                        const reason = $(tds[3]).text().trim();
                        const date = $(tds[4]).text().trim();

                        if (name && name !== '姓名') {
                            foundData.push({ name, location, reason, date, source: 'CRC' });
                        }
                    }
                });
            } else {
                console.log(`      (這個分頁看起來沒有資料)`);
            }
        } catch (e) {
            console.log(`      ⚠️ 無法讀取此分頁: ${(e as any).message}`);
        }
    }

    // --- 結算 ---
    if (foundData.length > 0) {
        console.log(`\n🎉 終於抓到了！共 ${foundData.length} 筆資料！`);
        console.log("👀 第一筆範例：", foundData[0]);

        const outputDir = path.join(process.cwd(), 'src', 'server', 'seedData');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        
        const filePath = path.join(outputDir, 'crc_raw.json');
        fs.writeFileSync(filePath, JSON.stringify(foundData, null, 2));
        console.log(`💾 檔案已儲存：${filePath}`);
    } else {
        console.log("❌ 所有分頁都找遍了還是沒有。");
        console.log("📸 我把最後一個分頁的 HTML 存下來給你檢查。");
        const lastPage = allPages[allPages.length - 1];
        fs.writeFileSync('debug_last_tab.html', await lastPage.content());
    }

    console.log("😴 任務結束，瀏覽器保留 10 秒...");
    await new Promise(r => setTimeout(r, 10000));

  } catch (error: any) {
    console.error("❌ 錯誤:", error.message);
  } finally {
    await browser.close();
  }
}

harvestTabs();