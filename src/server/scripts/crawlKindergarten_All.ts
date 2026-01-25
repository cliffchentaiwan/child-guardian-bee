// src/server/scripts/crawlKindergarten_All.ts
import 'dotenv/config';
import puppeteer from 'puppeteer';
import { db } from '../db';
import { cases, dataSyncLogs } from '../schema';
import { eq } from 'drizzle-orm';

const SEARCH_URL = 'https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx';
const DETAIL_BASE_URL = 'https://ap.ece.moe.edu.tw/webecems/dtl/punish_view.aspx';

// 🔥 設定：如果連續發現幾筆重複資料，就停止該縣市的掃描？
// 設定 15 筆大約是 1.5 頁的量，比較保險
const STOP_THRESHOLD = 15;

const TARGET_CITIES = [
    '基隆', '臺北', '新北', '桃園',
    '新竹市', '新竹縣', '苗栗', '臺中',
    '彰化', '南投', '雲林', '嘉義市',
    '嘉義縣', '臺南', '高雄', '屏東',
    '臺東', '花蓮', '宜蘭', '澎湖',
    '金門', '連江'
];

function analyzeRisk(text: string): string[] {
    const riskKeywords = ['體罰', '不當管教', '性騷擾', '虐待', '超收', '師生比', '進用未具資格'];
    return riskKeywords.filter(k => text.includes(k));
}

async function crawlKindergartenAll() {
  console.log("🏫 [全台幼兒園爬蟲 v12 聰明煞車版] 啟動！");
  console.log(`💡 策略：如果連續發現 ${STOP_THRESHOLD} 筆重複資料，將自動跳過該縣市剩餘頁面。`);
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'] 
  });

  let totalNewCount = 0;

  try {
    for (const cityKey of TARGET_CITIES) {
        console.log(`\n🚗 [${cityKey}] 準備出發...`);
        
        let searchPage = null;
        // 🔥 重置連續重複計數器
        let consecutiveDuplicates = 0;
        let stopCityScan = false;

        try {
            searchPage = await browser.newPage();
            await searchPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            await searchPage.goto(SEARCH_URL, { waitUntil: 'networkidle2', timeout: 60000 });
            
            // --- 選單操作 (省略重複代碼，邏輯不變) ---
            const citySelectId = await searchPage.evaluate(() => {
                const selects = Array.from(document.querySelectorAll('select'));
                for (const sel of selects) {
                    if (sel.innerHTML.includes('基隆') && sel.innerHTML.includes('臺北')) return sel.id;
                }
                return null;
            });
            if (!citySelectId) throw new Error("找不到縣市選單");

            const targetOption = await searchPage.evaluate((selId, key) => {
                const sel = document.getElementById(selId) as HTMLSelectElement;
                const options = Array.from(sel.options);
                const target = options.find(o => o.text.includes(key) || (key.includes('臺') && o.text.includes(key.replace('臺', '台'))));
                return target ? { val: target.value, text: target.text } : null;
            }, citySelectId, cityKey);

            if (!targetOption) {
                if (searchPage) await searchPage.close();
                continue;
            }

            const navPromise = searchPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
            await searchPage.select('#' + citySelectId, targetOption.val);
            await navPromise;
            await new Promise(r => setTimeout(r, 1000));

            const searchBtnSelector = 'input[type="submit"][name*="btnSearch"]';
            await searchPage.waitForSelector(searchBtnSelector);
            await Promise.all([
                searchPage.click(searchBtnSelector),
                new Promise(r => setTimeout(r, 3000))
            ]);

            const hasData = await searchPage.$('.kdCard-txt') !== null;
            if (!hasData) {
                console.log(`   ⚪️ ${targetOption.text} 無違規資料。`);
                if (searchPage) await searchPage.close();
                continue;
            }

            // --- 分頁迴圈 ---
            let pageNum = 1;
            let hasNextPage = true;

            while (hasNextPage && !stopCityScan) {
                console.log(`   📄 [${targetOption.text}] 第 ${pageNum} 頁掃描中...`);

                const schoolList = await searchPage.evaluate(() => {
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

                console.log(`      👀 本頁 ${schoolList.length} 筆，採集中...`);

                const detailPage = await browser.newPage();
                
                for (const school of schoolList) {
                    // 如果已經連續重複太多次，就標記停止
                    if (consecutiveDuplicates >= STOP_THRESHOLD) {
                        console.log(`      🛑 已連續發現 ${consecutiveDuplicates} 筆舊資料，判斷後續皆已抓取。`);
                        console.log(`      🚀 跳過 [${targetOption.text}] 剩餘頁面！`);
                        stopCityScan = true; 
                        break; 
                    }

                    const detailUrl = DETAIL_BASE_URL + "?sch=" + school.schId;
                    try {
                        await detailPage.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        try { await detailPage.waitForSelector('#GridView1', { timeout: 3000 }); } catch { continue; }

                        const details = await detailPage.evaluate(() => {
                            const results: any[] = [];
                            const rows = document.querySelectorAll('#GridView1 tr:not(.listHd_c)');
                            rows.forEach(row => {
                                const cells = row.querySelectorAll('td');
                                if (cells.length >= 4) {
                                    const date = cells[0]?.innerText.trim();
                                    const law = cells[3]?.innerText.trim() || '';
                                    const reason = cells[4]?.innerText.trim() || '';
                                    const fullReason = '違反法規：' + law + '。處分內容：' + reason;
                                    if (date.match(/\d+\/\d+\/\d+/)) {
                                        results.push({ date, fullReason, reason });
                                    }
                                }
                            });
                            return results;
                        });

                        if (details.length > 0) {
                            for (const d of details) {
                                let dateStr = d.date;
                                if (dateStr.includes('/')) {
                                    const parts = dateStr.split('/');
                                    const year = parseInt(parts[0]) + 1911;
                                    const month = parts[1].padStart(2, '0');
                                    const day = parts[2].padStart(2, '0');
                                    dateStr = `${year}-${month}-${day}`;
                                }
                                
                                const uniqueId = 'KINDY_' + school.name + '_' + dateStr;
                                const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));
                                
                                if (existing.length === 0) {
                                    // ✨ 發現新資料！
                                    await db.insert(cases).values({
                                        maskedName: school.name,
                                        name: school.name, 
                                        originalName: school.name,
                                        role: '機構',
                                        riskTags: JSON.stringify(analyzeRisk(d.reason)),
                                        location: targetOption.text,
                                        caseDate: new Date(dateStr).toISOString(),
                                        description: d.fullReason,
                                        sourceType: 'gov_kindergarten',
                                        sourceLink: uniqueId,
                                        verified: true,
                                        createdAt: new Date(),
                                    });
                                    totalNewCount++;
                                    consecutiveDuplicates = 0; // 🔥 重置計數器
                                    process.stdout.write("➕");
                                } else {
                                    // 😴 資料已存在
                                    consecutiveDuplicates++; // 🔥 增加計數器
                                    process.stdout.write(".");
                                }
                            }
                        }
                    } catch (err) {}
                    await new Promise(r => setTimeout(r, 100));
                }
                
                await detailPage.close();

                if (stopCityScan) break; // 跳出 while 迴圈

                // --- 翻頁邏輯 ---
                const nextBtnSelector = '#PageControl1_lbNextPage';
                const nextBtnState = await searchPage.evaluate((sel) => {
                    const btn = document.querySelector(sel);
                    if (!btn) return { exists: false, disabled: true };
                    return { 
                        exists: true, 
                        disabled: btn.className.includes('aspNetDisabled') 
                    };
                }, nextBtnSelector);

                if (nextBtnState.exists && !nextBtnState.disabled) {
                    await Promise.all([
                        searchPage.evaluate((sel) => { (document.querySelector(sel) as HTMLElement).click(); }, nextBtnSelector),
                        new Promise(r => setTimeout(r, 3000)) 
                    ]);
                    pageNum++;
                } else {
                    console.log(`      🏁 [${targetOption.text}] 掃描完畢。`);
                    hasNextPage = false;
                }
            } 

        } catch (error) {
            console.error(`   ❌ ${cityKey} 發生錯誤:`, error);
        } finally {
            if (searchPage) try { await searchPage.close(); } catch(e) {}
        }
    } 

    if (totalNewCount >= 0) { 
        await db.insert(dataSyncLogs).values({
          sourceName: '全國教保資訊網',
          status: 'success',
          recordCount: totalNewCount,
          startedAt: new Date(),
          completedAt: new Date(),
        });
    }

    console.log(`\n🎉 任務完成！本次新增 ${totalNewCount} 筆資料。`);

  } catch (error: any) {
    console.error("❌ 系統錯誤:", error.message);
  } finally {
    await browser.close();
    process.exit(0);
  }
}

crawlKindergartenAll();