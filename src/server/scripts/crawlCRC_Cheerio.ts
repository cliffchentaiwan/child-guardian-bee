// src/server/scripts/crawlCRC_Cheerio.ts
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';

// 這是我們確認有效的黃金網址
const MAGIC_URL = 'https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction?page=1&pagesize=10&name=&target=all&city=0&startDate=&endDate=&dosearch=true';

async function harvestCheerio() {
  console.log("☢️ 啟動 CRC 核彈級爬蟲 (Cheerio 靜態解析版)...");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`\n📍 前往：${MAGIC_URL}`);
    // 等待久一點，確保畫面完全靜止
    await page.goto(MAGIC_URL, { waitUntil: 'networkidle2', timeout: 90000 });
    
    console.log("⏳ 等待 5 秒讓資料渲染...");
    await new Promise(r => setTimeout(r, 5000));

    // --- 關鍵步驟：掠奪 HTML ---
    console.log("📥 正在把所有視窗的 HTML 原始碼偷出來...");
    
    let allData: any[] = [];
    const allFrames = [page.mainFrame(), ...page.frames()];
    
    console.log(`   ℹ️ 掃描目標：共 ${allFrames.length} 個視窗區塊`);

    // 遍歷每一個 Frame，把 HTML 抓出來用 Cheerio 分析
    for (let i = 0; i < allFrames.length; i++) {
        const frame = allFrames[i];
        try {
            // 1. 抓取 HTML 字串 (不透過瀏覽器執行 JS，直接拿字串)
            const html = await frame.content();
            
            // 2. 載入 Cheerio
            const $ = cheerio.load(html);
            
            // 3. 檢查有沒有關鍵字
            const bodyText = $('body').text();
            if (bodyText.includes('姓名') && bodyText.includes('違反')) {
                console.log(`   ✨ 在第 ${i+1} 個視窗中發現資料特徵！開始解析...`);
                
                // 4. 使用 Cheerio 語法抓取 (類似 jQuery)
                $('tr').each((index, element) => {
                    const tds = $(element).find('td');
                    // 根據你的截圖，資料行通常有 5 格以上
                    if (tds.length >= 4) {
                        const location = $(tds[1]).text().trim();
                        const name = $(tds[2]).text().trim();
                        const reason = $(tds[3]).text().trim();
                        const date = $(tds[4]).text().trim();
                        
                        // 過濾雜訊
                        if (name && name !== '姓名' && name !== '公布姓名' && name.length > 1) {
                            allData.push({
                                name,
                                location,
                                reason,
                                date,
                                source: 'CRC - Cheerio'
                            });
                        }
                    }
                });
            }
        } catch (e) {
            console.log(`   ⚠️ 無法讀取 Frame ${i}: ${(e as any).message}`);
        }
    }

    // --- 結算 ---
    if (allData.length > 0) {
        console.log(`\n🎉 終於成功了！！！總共抓到 ${allData.length} 筆資料！`);
        console.log("👀 第一筆資料預覽：", allData[0]);

        const outputDir = path.join(process.cwd(), 'src', 'server', 'seedData');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        
        const filePath = path.join(outputDir, 'crc_raw.json');
        fs.writeFileSync(filePath, JSON.stringify(allData, null, 2));
        console.log(`💾 檔案已儲存至：${filePath}`);
    } else {
        console.log("❌ 真是見鬼了，連 HTML 裡都沒字？");
        console.log("📸 我把當下的 HTML 存下來，請務必打開來看看裡面到底是不是空的。");
        // 把主頁面的 HTML 存下來驗屍
        const mainHtml = await page.content();
        fs.writeFileSync('debug_ghost.html', mainHtml);
    }

    console.log("😴 任務結束，瀏覽器保留 10 秒...");
    await new Promise(r => setTimeout(r, 10000));

  } catch (error: any) {
    console.error("❌ 錯誤:", error.message);
  } finally {
    await browser.close();
  }
}

harvestCheerio();