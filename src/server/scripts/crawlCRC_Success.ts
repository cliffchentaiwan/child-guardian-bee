// src/server/scripts/crawlCRC_Success.ts
import 'dotenv/config';
import puppeteer, { Frame } from 'puppeteer';
import readline from 'readline'; // 引入指揮官工具
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

const TARGET_URL = 'https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function harvestSuccess() {
  console.log("🌟 啟動 CRC 爬蟲 (人類指揮官版)...");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  let newCount = 0;

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`\n📄 前往：${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    await new Promise(r => setTimeout(r, 2000));

    // --- 階段一：自動點擊 ---
    console.log("🎮 正在尋找按鈕幫你點擊...");
    let controlFrame: Frame | null = null;
    
    for (const frame of page.frames()) {
        const hasButton = await frame.evaluate(() => {
            return document.body.innerText.includes('全選') || !!document.querySelector('.searchBtn');
        });
        if (hasButton) {
            controlFrame = frame;
            break;
        }
    }

    if (!controlFrame) controlFrame = page.mainFrame();

    console.log("🔽 執行：全選 -> 查詢...");
    await controlFrame.evaluate(() => {
        const options = Array.from(document.querySelectorAll('option'));
        const allOption = options.find(o => (o as any).innerText.includes('全選'));
        if (allOption && allOption.parentElement) {
            const select = allOption.parentElement as HTMLSelectElement;
            select.value = (allOption as HTMLOptionElement).value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const btn = document.querySelector('.searchBtn') || 
                    Array.from(document.querySelectorAll('button, input')).find(b => (b as any).innerText?.includes('搜尋'));
        if (btn) (btn as HTMLElement).click();
    });

    // --- 階段二：人類確認 ---
    console.log("\n🛑 暫停！請看瀏覽器畫面...");
    console.log("-------------------------------------------------");
    console.log("👉 如果【資料還沒出來】，請等待它跑出來。");
    console.log("👉 如果【按鈕沒反應】，請你手動再按一次「搜尋」。");
    console.log("👉 當你確定【看到滿滿的資料】後...");
    console.log("-------------------------------------------------");
    
    await new Promise<void>(resolve => {
        rl.question('⌨️ 請回到這裡，按下 [Enter] 鍵開始收割！', () => {
            resolve();
            rl.close();
        });
    });

    console.log("⚡️ 收到指令！全面搜查所有視窗...");

    // --- 階段三：全面通緝資料 ---
    let targetData: any[] = [];
    const currentFrames = page.frames();

    for (const frame of currentFrames) {
        const frameResult = await frame.evaluate(() => {
            const text = document.body.innerText;
            // 只要有「姓名」而且有「日期格式」的文字，就抓！
            if (text.includes('姓名') && /\d{2,3}[\/.]\d{1,2}[\/.]\d{1,2}/.test(text)) {
                const rows: any[] = [];
                const trs = document.querySelectorAll('tr');
                trs.forEach(tr => {
                    const tds = tr.querySelectorAll('td');
                    if (tds.length >= 4) {
                        const t1 = tds[1]?.innerText?.trim() || '';
                        const t2 = tds[2]?.innerText?.trim() || '';
                        const t3 = tds[3]?.innerText?.trim() || '';
                        const t4 = tds[4]?.innerText?.trim() || '';

                        let name = '', location = '', reason = '', date = '';

                        // 判斷邏輯
                        if (t4.includes('/') || t4.includes('.')) {
                            date = t4; name = t2; location = t1; reason = t3;
                        } else if (t3.includes('/') || t3.includes('.')) {
                            date = t3; name = t2; location = '未知'; reason = t1;
                        }

                        if (name && name !== '姓名' && date.length > 5) {
                            rows.push({ name, location, reason, date });
                        }
                    }
                });
                return { found: true, data: rows };
            }
            return { found: false, data: [] };
        });

        if (frameResult.found && frameResult.data.length > 0) {
            console.log(`   ✨ 抓到了！在這個 Frame 發現 ${frameResult.data.length} 筆資料`);
            targetData = targetData.concat(frameResult.data);
        }
    }

    // --- 階段四：寫入資料庫 ---
    if (targetData.length > 0) {
        console.log(`\n📦 準備寫入 ${targetData.length} 筆資料...`);

        for (const item of targetData) {
            let dateStr = item.date;
            dateStr = dateStr.replace(/\./g, '/');
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    const year = parseInt(parts[0]) + 1911;
                    dateStr = `${year}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                }
            }

            const uniqueId = `CRC_${item.name}_${dateStr}`;
            const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));

            if (existing.length === 0) {
                await db.insert(cases).values({
                    maskedName: item.name,
                    name: item.name,
                    originalName: item.name,
                    role: '個人',
                    riskTags: JSON.stringify(['兒少權益法', '裁罰']),
                    location: item.location,
                    caseDate: new Date(dateStr).toISOString(),
                    description: `違反法規：${item.reason}`,
                    sourceType: 'gov_crc',
                    sourceLink: uniqueId,
                    verified: true,
                    createdAt: new Date(),
                });
                newCount++;
            }
        }
        console.log(`✅ 成功寫入 ${newCount} 筆新資料！`);
    } else {
        console.log("❌ 還是 0 筆？這代表資料可能不是表格，或者 Frame 又跑掉了。");
    }

    // Log
    if (newCount >= 0) {
        await db.insert(dataSyncLogs).values({
            sourceName: 'CRC 兒少裁罰 (指揮官版)',
            status: 'success',
            recordCount: newCount,
            startedAt: new Date(),
            completedAt: new Date(),
        });
    }

    console.log("😴 任務結束。");

  } catch (error: any) {
    console.error("❌ 錯誤:", error.message);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

harvestSuccess();