// src/server/scripts/crawlKindergarten_Deep.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { cases, dataSyncLogs } from '../../../drizzle/schema'; 
import { eq } from 'drizzle-orm';

const SEARCH_URL = 'https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx';
const DETAIL_BASE_URL = 'https://ap.ece.moe.edu.tw/webecems/dtl/punish_view.aspx';

async function crawlKindergartenDeep() {
  console.log("🏫 [幼兒園深潛爬蟲 最終版] 啟動！鎖定 GridView1 表格...");
  
  const browser = await puppeteer.launch({
    headless: false, // 讓你看得到它在工作
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'] 
  });

  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(connection);
  let newCount = 0;

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // ==========================================
    // 🚀 第一階段：蒐集名單 (Get List)
    // ==========================================
    console.log("📋 階段一：進入搜尋頁面，蒐集目標...");
    await page.goto(SEARCH_URL, { waitUntil: 'networkidle2' });

    // 1. 選取臺北市 (這次我們加強等待，避免變成基隆)
    try {
        const selectSelector = 'select'; 
        await page.waitForSelector(selectSelector);
        
        // 抓取選項
        const options = await page.$$eval(`${selectSelector} option`, opts => opts.map(o => ({ val: o.value, text: o.innerText })));
        const targetCity = options.find(o => o.text.includes('臺北') || o.text.includes('台北'));
        
        if (targetCity) {
            console.log(`👉 切換城市：${targetCity.text} (Value: ${targetCity.val})`);
            
            // 監聽導航事件，因為選縣市會刷新頁面
            const navigationPromise = page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(()=>console.log("Reload timed out"));
            await page.select(selectSelector, targetCity.val);
            await navigationPromise; // 等待刷新完成
            console.log("✅ 城市切換完成！");
        }
    } catch (e) { 
        console.log("⚠️ 城市選取可能有誤，嘗試直接搜尋..."); 
    }

    // 2. 點擊搜尋
    const searchBtnSelector = 'input[type="submit"][name*="btnSearch"]';
    await page.waitForSelector(searchBtnSelector);
    await Promise.all([
        page.click(searchBtnSelector),
        page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {})
    ]);

    // 3. 提取連結
    await page.waitForSelector('.kdCard-txt', { visible: true, timeout: 15000 });
    
    const schoolList = await page.evaluate(() => {
        const results: any[] = [];
        const cards = document.querySelectorAll('.kdCard-txt');
        cards.forEach(card => {
            const nameEl = card.querySelector('h4 span');
            const name = nameEl ? (nameEl as HTMLElement).innerText.trim() : '未知名稱';
            const linkEl = card.querySelector('a[id*="lbView"]');
            if (linkEl) {
                const match = (linkEl.getAttribute('onclick') || '').match(/punish_view\.aspx\?sch=([^'&]+)/);
                if (match) results.push({ name, schId: match[1] });
            }
        });
        return results;
    });

    console.log(`📋 找到 ${schoolList.length} 間幼兒園，準備深入詳細頁面...`);

    // ==========================================
    // 🏊 第二階段：潛入詳細頁面 (Deep Dive)
    // ==========================================
    
    // 為了展示效果，我們先抓前 10 筆 (如果要抓全部，請把 .slice(0, 10) 拿掉)
    const targets = schoolList; 

    for (const school of targets) {
        const detailUrl = `${DETAIL_BASE_URL}?sch=${school.schId}`;
        console.log(`\n🕵️ [${school.name}] 正在讀取裁罰紀錄...`);

        try {
            await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
            
            // 🔥 關鍵修正：鎖定 #GridView1 表格
            try {
                await page.waitForSelector('#GridView1', { timeout: 5000 });
            } catch {
                console.log("   ⚠️ 沒看到表格，可能是查無資料或格式不同。");
                continue;
            }

            const details = await page.evaluate(() => {
                const results: any[] = [];
                // 排除表頭 (listHd_c)
                const rows = document.querySelectorAll('#GridView1 tr:not(.listHd_c)');
                
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    // 根據你的截圖，欄位順序推測：
                    // [0] 處分日期
                    // [1] 園名
                    // [2] 文號
                    // [3] 違反法規 (推測)
                    // [4] 處分內容/事由 (推測)
                    
                    if (cells.length >= 4) {
                        const date = cells[0]?.innerText.trim();
                        // 把後面幾欄組合成完整原因
                        const law = cells[3]?.innerText.trim() || '';
                        const reason = cells[4]?.innerText.trim() || '';
                        const fullReason = `違反法規：${law}。處分內容：${reason}`;
                        
                        // 簡單驗證日期格式
                        if (date.match(/\d+\/\d+\/\d+/)) {
                            results.push({ date, fullReason });
                        }
                    }
                });
                return results;
            });

            if (details.length > 0) {
                console.log(`   ✅ 發現 ${details.length} 筆違規！`);
                
                for (const d of details) {
                    // 日期轉換 (112/01/01 -> 2023-01-01)
                    let dateStr = d.date;
                    if (dateStr.includes('/')) {
                        const parts = dateStr.split('/');
                        const year = parseInt(parts[0]) + 1911;
                        dateStr = `${year}-${parts[1]}-${parts[2]}`;
                    }

                    const uniqueId = `KINDY_${school.name}_${dateStr}`;
                    const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));
                    
                    if (existing.length === 0) {
                        await db.insert(cases).values({
                            maskedName: school.name, 
                            originalName: school.name,
                            role: '幼兒園/機構',
                            riskTags: '幼兒園裁罰',
                            location: school.name.substring(0, 3), 
                            caseDate: new Date(dateStr),
                            description: d.fullReason,
                            sourceType: 'kindergarten',
                            sourceLink: uniqueId,
                            verified: true,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        });
                        newCount++;
                        console.log(`      ➕ 已入庫：${d.fullReason.substring(0, 15)}...`);
                    }
                }
            } else {
                console.log("   ⚪️ 表格內無有效資料");
            }

        } catch (err) {
            console.log(`   ❌ 讀取詳細頁失敗: ${err}`);
        }

        // 稍微休息，避免被 Ban
        await new Promise(r => setTimeout(r, 800));
    }

    // 寫入紀錄
    if (newCount > 0) {
        await db.insert(dataSyncLogs).values({
          sourceName: 'real_kindergarten_crawler_deep',
          status: 'success',
          recordCount: newCount,
          startedAt: new Date(),
          completedAt: new Date(),
        });
    }

    console.log(`\n🎉 任務圓滿完成！共新增 ${newCount} 筆詳細裁罰資料。`);

  } catch (error: any) {
    console.error("❌ 系統錯誤:", error.message);
  } finally {
    await browser.close();
    await connection.end();
    process.exit(0);
  }
}

crawlKindergartenDeep();