// src/server/scripts/inspectJudicial_Manual.ts
import puppeteer from 'puppeteer';
import readline from 'readline';

const JUDICIAL_URL = 'https://judgment.judicial.gov.tw/FJUD/default.aspx';

// 建立終端機輸入介面
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function inspectJudicialManual() {
  console.log("⚖️ [司法院手動偵測] 啟動！");
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized'] 
  });

  try {
    const page = await browser.newPage();
    await page.goto(JUDICIAL_URL, { waitUntil: 'networkidle2' });

    // 1. 自動填關鍵字
    try { await page.type('#txtKW', "幼兒園 虐童"); } catch(e) {}

    // 2. 🔥 等待人類指令
    console.log("\n👇👇👇 [請執行以下動作] 👇👇👇");
    console.log("1. 在瀏覽器輸入驗證碼。");
    console.log("2. 按下「查詢」。");
    console.log("3. 當你親眼看到「裁判字號、裁判日期」的表格出現後...");
    console.log("👉 請回到這裡，按下 [Enter] 鍵！");
    console.log("----------------------------------");

    await new Promise<void>(resolve => {
        rl.question('等待按下 Enter...', () => {
            resolve();
            rl.close();
        });
    });

    console.log("⚡️ 收到指令！正在掃描所有 Frame (框架)...");

    // 3. 遍歷所有 Frame 尋找表格
    let found = false;
    
    // page.frames() 會回傳頁面上所有的框架 (包含主頁面和 iframe)
    for (const frame of page.frames()) {
        try {
            // 檢查這個 frame 裡面有沒有我們要的關鍵字
            const frameContent = await frame.content(); // 抓取該 frame 的 HTML
            if (frameContent.includes('裁判字號') && frameContent.includes('裁判日期')) {
                console.log(`✅ 在 Frame [${frame.name() || 'unnamed'}] 找到目標表格！`);
                
                // 抓取表格 HTML
                const tableHtml = await frame.evaluate(() => {
                    // 尋找包含 "裁判字號" 的 tr
                    const headers = Array.from(document.querySelectorAll('th, td'));
                    const targetHeader = headers.find(el => (el as HTMLElement).innerText.includes('裁判字號'));
                    
                    if (!targetHeader) return null;
                    const table = targetHeader.closest('table');
                    if (!table) return null;

                    // 回傳前 3 列
                    const rows = table.querySelectorAll('tr');
                    let log = `--- 表格結構 (共 ${rows.length} 列) ---\n`;
                    for(let i=0; i<Math.min(rows.length, 3); i++) {
                        log += `\n[Row ${i}]\n${rows[i].innerHTML.trim().substring(0, 500)}\n`;
                    }
                    return log;
                });

                if (tableHtml) {
                    console.log("\n👇👇👇 請把下面這段貼給我 👇👇👇\n");
                    console.log(tableHtml);
                    console.log("\n👆👆👆 偵測結束 👆👆👆\n");
                    found = true;
                    break; // 找到了就收工
                }
            }
        } catch (e) {
            // 有些 frame 可能會因為跨域問題讀不到，跳過即可
        }
    }

    if (!found) {
        console.log("❌ 掃描了所有 Frame 都沒看到 '裁判字號'，請確認瀏覽器畫面是否正確。");
    }

  } catch (error) {
    console.error(error);
  } finally {
    // browser.close(); // 保持開啟讓你檢查
    process.exit(0);
  }
}

inspectJudicialManual();