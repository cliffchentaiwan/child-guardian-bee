import type { Page } from 'puppeteer';

// 定義回傳資料的格式
export interface CRCResult {
  county: string;
  name: string;
  law: string;
  date: string;
}

// 🔥 請確認這裡有 "export" 關鍵字
export async function searchCRC(page: Page, name: string): Promise<CRCResult[]> {
  try {
    console.log("   └─ [官方爬蟲] 正在查詢：衛福部 CRC...");
    await page.goto('https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction', { waitUntil: 'domcontentloaded' });
    
    // 稍微等待載入
    await new Promise(r => setTimeout(r, 1500));

    // 填寫姓名
    await page.evaluate((targetName) => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        const validInputs = inputs.filter(i => i.getBoundingClientRect().top > 150);
        if (validInputs.length > 0) {
            (validInputs[0] as HTMLInputElement).value = targetName;
            validInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        }
    }, name);

    // 點擊搜尋
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a, input[type="submit"]'));
        const searchBtn = btns.find(b => {
            const text = (b as HTMLElement).innerText || (b as HTMLInputElement).value || "";
            return text.includes('搜尋') && b.getBoundingClientRect().top > 150;
        });
        if (searchBtn) (searchBtn as HTMLElement).click();
    });

    // 等待結果
    try {
      await page.waitForFunction(
          (text) => document.body.innerText.includes(text),
          { timeout: 5000 },
          name
      );
    } catch (e) {}

    // 抓取資料 (Div 模式)
    const data = await page.evaluate((targetName) => {
      const results: CRCResult[] = [];
      const rows = document.querySelectorAll('div.tr, div[role="row"]');
      rows.forEach(row => {
          const text = (row as HTMLElement).innerText.replace(/\s/g, '');
          const cleanTarget = targetName.replace(/\s/g, '');
          if (text.includes("縣市名稱")) return;
          if (text.includes(cleanTarget)) {
              const cells = row.querySelectorAll('div[role="cell"], div.td');
              if (cells.length >= 5) {
                  results.push({
                      county: (cells[1] as HTMLElement)?.innerText?.trim() || "相關地區",
                      name: targetName,
                      law: (cells[3] as HTMLElement)?.innerText?.trim() || "違反兒少法規",
                      date: (cells[4] as HTMLElement)?.innerText?.trim() || "近期"
                  });
              }
          }
      });
      return results;
    }, name);

    if (data.length > 0) console.log(`      ✅ CRC 成功提取 ${data.length} 筆資料`);
    else console.log(`      ℹ️ CRC 無資料`);

    return data;

  } catch (e) {
    console.log("      ⚠️ CRC 錯誤", e);
    return [];
  }
}