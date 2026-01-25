// src/server/scripts/crawlCRC_Network.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

const TARGET_URL = 'https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction';

async function harvestNetwork() {
  console.log("🔥 啟動 CRC 爬蟲 (網路封包攔截版)...");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  let totalNewCount = 0;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // --- 1. 設定「封包監聽器」 (這是核心！) ---
    // 只要有回應進來，我們就檢查它是不是我們要的資料
    page.on('response', async (response) => {
        const url = response.url();
        const resourceType = response.request().resourceType();

        // 過濾掉圖片、CSS、字型，只看 Document (HTML) 或 XHR (資料)
        if (['image', 'stylesheet', 'font', 'script'].includes(resourceType)) return;

        try {
            // 嘗試讀取封包內容
            const text = await response.text();

            // 🔥 關鍵判斷：如果封包內容包含 "裁罰對象" 和 "裁罰日期"，這就是我們要的！
            if (text.includes('裁罰對象') && text.includes('裁罰日期')) {
                console.log(`\n🎯 攔截到資料封包！來源: ${url.substring(0, 50)}...`);
                
                // --- 直接解析封包內容 (不依賴網頁渲染) ---
                // 使用暴力正則表達式，直接從 HTML 原始碼挖資料
                const rawLines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                const items: any[] = [];

                for (let i = 0; i < rawLines.length; i++) {
                    const line = rawLines[i];
                    
                    // 看到關鍵字，啟動雷達
                    if (line.includes('裁罰對象') || line.includes('姓名')) {
                        // 往後找名字 (通常在標籤後面的 <span...>名字</span> 或直接是名字)
                        // 我們簡單一點，往後找 5 行，看有沒有不含標籤的純文字
                        let name = '';
                        let date = '';
                        let location = '未分類';

                        // 在接下來的 20 行內搜尋
                        for (let k = 1; k < 20; k++) {
                            const nextLine = rawLines[i + k];
                            if (!nextLine) break;
                            
                            // 移除 HTML 標籤的干擾，只留文字
                            const cleanText = nextLine.replace(/<[^>]*>/g, '').trim();
                            if (!cleanText) continue;

                            // 找名字：如果是緊跟在標題後的第一個有意義文字
                            if (!name && cleanText !== '裁罰對象' && cleanText !== '姓名' && cleanText !== '全部') {
                                name = cleanText;
                            }

                            // 找日期：符合日期格式
                            if (/\d{3,4}[./]\d{1,2}[./]\d{1,2}/.test(cleanText)) {
                                date = cleanText;
                            }
                            
                            // 找縣市
                            if (cleanText === '縣市名稱') {
                                // 預告下一行可能是縣市，繼續迴圈找
                            }
                        }

                        if (name && date) {
                            // 再次過濾雜訊
                            if (name !== '全部' && name !== '行為人' && !name.includes('選擇')) {
                                items.push({ name, date, location });
                            }
                        }
                    }
                }

                if (items.length > 0) {
                    console.log(`   📦 在此封包中解析出 ${items.length} 筆資料...`);
                    // 寫入資料庫
                    for (const item of items) {
                        await saveToDB(item);
                    }
                }
            }
        } catch (err) {
            // 有些封包可能是二進位或其他格式，讀取會失敗，忽略即可
        }
    });

    // 輔助寫入函式
    async function saveToDB(item: any) {
        try {
            let dateStr = item.date;
            const dateMatch = dateStr.match(/(\d{3,4})[./](\d{1,2})[./](\d{1,2})/);
            if (!dateMatch) return;

            let year = parseInt(dateMatch[1]);
            const month = dateMatch[2].padStart(2, '0');
            const day = dateMatch[3].padStart(2, '0');
            if (year < 1911) year += 1911;

            const finalIsoDate = `${year}-${month}-${day}`;
            const uniqueId = `CRC_${item.name}_${finalIsoDate}`;

            const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));

            if (existing.length === 0) {
                await db.insert(cases).values({
                    maskedName: item.name,
                    name: item.name,
                    originalName: item.name,
                    role: '個人',
                    riskTags: JSON.stringify(['兒少權益法', '裁罰']),
                    location: item.location,
                    caseDate: new Date(finalIsoDate).toISOString(),
                    description: `CRC 裁罰紀錄`,
                    sourceType: 'gov_crc',
                    sourceLink: uniqueId,
                    verified: true,
                    createdAt: new Date(),
                });
                totalNewCount++;
                process.stdout.write("✅");
            } else {
                process.stdout.write("."); // 已存在
            }
        } catch (e) {}
    }

    console.log(`\n📄 前往：${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // --- 2. 觸發搜尋 (只要按下按鈕，網路封包就會飛，監聽器就會抓) ---
    console.log("🤖 觸發搜尋...");
    
    // 嘗試在主頁或 Frame 裡點擊
    let clicked = false;
    for (const frame of page.frames()) {
        const btn = await frame.$('.searchBtn');
        if (btn) {
            console.log(`   👆 在 Frame ${frame.url()} 點擊搜尋...`);
            await btn.click();
            clicked = true;
            break;
        }
    }
    
    // 如果沒找到按鈕，嘗試用 JS 強制觸發
    if (!clicked) {
        await page.evaluate(`
             const btn = document.querySelector('.searchBtn') || Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('搜尋'));
             if (btn) btn.click();
        `);
    }

    console.log("⏳ 等待封包攔截 (保持瀏覽器開啟)...");
    
    // --- 3. 自動翻頁 (觸發更多封包) ---
    // 我們每隔 5 秒檢查一次有沒有「下一頁」按鈕，有的話就按
    for (let pageNum = 1; pageNum <= 20; pageNum++) { // 限制最多翻 20 頁防止無窮迴圈
        console.log(`\n📄 --- 第 ${pageNum} 頁掃描中 ---`);
        await new Promise(r => setTimeout(r, 5000)); // 等待封包回來

        // 找下一頁按鈕並點擊
        const nextClicked = await page.evaluate(`
            (() => {
                const links = Array.from(document.querySelectorAll('a, button, li'));
                const nextLink = links.find(el => {
                    const txt = el.innerText.trim();
                    return txt === '>' || txt === '下一頁' || txt === 'Next';
                });
                // 檢查是否隱藏或 disable
                if (nextLink && !nextLink.className.includes('disabled') && nextLink.offsetParent !== null) {
                    nextLink.click();
                    return true;
                }
                // 有時候是在 Frame 裡
                return false;
            })()
        `);

        // 如果主頁沒找到，去 Frame 找
        if (!nextClicked) {
            let frameNextClicked = false;
            for (const frame of page.frames()) {
                 const clicked = await frame.evaluate(`
                    (() => {
                        const links = Array.from(document.querySelectorAll('a, button, li'));
                        const nextLink = links.find(el => {
                            const txt = el.innerText.trim();
                            return txt === '>' || txt === '下一頁' || txt === 'Next';
                        });
                        if (nextLink && !nextLink.className.includes('disabled')) {
                            nextLink.click();
                            return true;
                        }
                        return false;
                    })()
                `);
                if (clicked) {
                    frameNextClicked = true;
                    break;
                }
            }
            if (!frameNextClicked) {
                console.log("🏁 沒有下一頁了，或無法翻頁。");
                break;
            }
        }
        console.log("   ➡️ 點擊下一頁，等待新封包...");
    }

    if (totalNewCount >= 0) {
        await db.insert(dataSyncLogs).values({
            sourceName: 'CRC (封包攔截版)',
            status: 'success',
            recordCount: totalNewCount,
            startedAt: new Date(),
            completedAt: new Date(),
        });
    }

    console.log(`\n🎉 CRC 任務結束！共新增 ${totalNewCount} 筆資料。`);

  } catch (error: any) {
    console.error("❌ 錯誤:", error.message);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

harvestNetwork();