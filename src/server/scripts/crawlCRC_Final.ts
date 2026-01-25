// src/server/scripts/crawlCRC_Final.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

const TARGET_URL = 'https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction';
const STOP_THRESHOLD = 30; // CRC 資料較亂，設寬鬆一點，連續 30 筆重複才停

async function crawlCRCFinal() {
  console.log("🛡️ [CRC 最終救星版] 啟動！改用 Table 結構精準抓取 + 聰明煞車...");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  let totalNewCount = 0;
  let consecutiveDuplicates = 0; // 🔥 煞車計數器

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log(`\n📄 前往：${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // --- 1. 觸發搜尋 ---
    console.log("🤖 觸發搜尋...");
    let controlFrame = page.mainFrame();
    for (const frame of page.frames()) {
        if (await frame.$('.searchBtn')) { controlFrame = frame; break; }
    }

    await controlFrame.evaluate(() => {
        const options = Array.from(document.querySelectorAll('option'));
        const allOption = options.find(o => o.innerText.includes('全選'));
        if (allOption && allOption.parentElement) {
            const select = allOption.parentElement as HTMLSelectElement;
            select.value = allOption.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const btn = document.querySelector('.searchBtn') || document.querySelector('input[type="submit"]');
        if (btn) (btn as HTMLElement).click();
    });

    console.log("⏳ 等待資料載入...");
    await new Promise(r => setTimeout(r, 5000));

    // --- 2. 鎖定資料 Frame ---
    let dataFrame = null;
    for (const frame of page.frames()) {
        const tableCount = await frame.$$eval('table', tables => tables.length);
        if (tableCount > 0) {
            const rowCount = await frame.$$eval('tr', rows => rows.length);
            if (rowCount > 5) {
                dataFrame = frame;
                console.log(`   ✅ 鎖定 Frame (含有 ${rowCount} 列資料)`);
                break;
            }
        }
    }
    if (!dataFrame) dataFrame = page.mainFrame();

    // --- 3. 開始抓取 ---
    let hasNextPage = true;
    let pageNum = 1;

    while (hasNextPage) {
        console.log(`\n📄 正在掃描第 ${pageNum} 頁...`);

        // A. 抓取
        const items = await dataFrame.evaluate(() => {
            const results: any[] = [];
            const rows = document.querySelectorAll('tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 4) {
                    const texts = Array.from(cells).map(c => c.innerText.trim());
                    // 找日期 112/01/01
                    const dateIdx = texts.findIndex(t => /\d{3}[/.]\d{2}[/.]\d{2}/.test(t));
                    if (dateIdx !== -1) {
                        const date = texts[dateIdx];
                        let name = '', location = '', reason = '';
                        if (texts[1] && texts[1].length < 5) location = texts[1];
                        if (texts[dateIdx + 1]) name = texts[dateIdx + 1];
                        if (texts[dateIdx + 2]) reason = texts[dateIdx + 2];

                        if (name && name !== '姓名' && name !== '裁罰對象') {
                            results.push({ name, date, location, reason });
                        }
                    }
                }
            });
            return results;
        });

        console.log(`   👀 本頁發現 ${items.length} 筆...`);

        // B. 寫入
        for (const item of items) {
            // 🔥 煞車檢查
            if (consecutiveDuplicates >= STOP_THRESHOLD) {
                console.log(`   🛑 連續發現 ${consecutiveDuplicates} 筆重複，停止掃描！`);
                hasNextPage = false; // 停止 while
                break; // 停止 for
            }

            try {
                let dateStr = item.date.replace(/\./g, '/');
                const parts = dateStr.split('/');
                let year = parseInt(parts[0]);
                if (year < 1911) year += 1911;
                const finalDate = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                
                const uniqueId = `CRC_${item.name}_${finalDate}`;
                const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));
                
                if (existing.length === 0) {
                    await db.insert(cases).values({
                        maskedName: item.name,
                        name: item.name,
                        originalName: item.name,
                        role: '個人/機構',
                        riskTags: JSON.stringify(['兒少權益法', '裁罰']),
                        location: item.location || '未知',
                        caseDate: new Date(finalDate).toISOString(),
                        description: item.reason,
                        sourceType: 'gov_crc',
                        sourceLink: uniqueId,
                        verified: true,
                        createdAt: new Date(),
                    });
                    totalNewCount++;
                    consecutiveDuplicates = 0; // 🔥 重置
                    process.stdout.write("➕");
                } else {
                    consecutiveDuplicates++; // 🔥 增加
                    process.stdout.write(".");
                }
            } catch (e) {}
        }
        console.log("");
        
        if (!hasNextPage) break; // 如果觸發煞車，跳出迴圈

        // C. 翻頁
        const nextSuccess = await dataFrame.evaluate(() => {
            const pager = document.querySelector('.pagination') || document.querySelector('.pager') || document.body;
            const links = Array.from(pager.querySelectorAll('a, button'));
            const nextLink = links.find(el => {
                const t = (el as HTMLElement).innerText.trim();
                return t === '下一頁' || t === '>' || t === 'Next';
            });
            if (nextLink && !(nextLink as HTMLElement).className.includes('disabled')) {
                (nextLink as HTMLElement).click();
                return true;
            }
            return false;
        });

        if (nextSuccess) {
            await new Promise(r => setTimeout(r, 3000));
            pageNum++;
        } else {
            console.log("   🏁 翻頁結束。");
            hasNextPage = false;
        }
    }

    if (totalNewCount >= 0) {
        await db.insert(dataSyncLogs).values({
            sourceName: 'CRC (最終救星版)',
            status: 'success',
            recordCount: totalNewCount,
            startedAt: new Date(),
            completedAt: new Date(),
        });
    }

    console.log(`\n🎉 任務完成！共撈回 ${totalNewCount} 筆資料。`);

  } catch (error: any) {
    console.error("❌ 錯誤:", error.message);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

crawlCRCFinal();