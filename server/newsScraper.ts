import type { Page } from 'puppeteer';

// 定義搜尋結果介面
interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

// 風險關鍵字 (共用)
const RISK_KEYWORDS = [
  "判決", "徒刑", "起訴", "裁罰", "違法", "罰鍰", 
  "虐童", "不當管教", "施暴", "猥褻", "性騷", "性侵",
  "兒少", "幼兒園", "托嬰", "老師", "教保", "園長", 
  "黑名單", "違規", "涉嫌", "告訴", "敗訴", "賠償"
];

/**
 * Yahoo 通用搜尋函式
 * @param page Puppeteer Page 物件
 * @param taskName 任務名稱 (用於 Log)
 * @param query 搜尋關鍵字
 * @param maxResults 最大筆數
 * @param strictMode 是否開啟嚴格過濾 (只有媒體需要嚴格過濾，官方資料庫通常不用)
 */
export async function searchYahoo(
  page: Page, 
  taskName: string, 
  query: string, 
  maxResults: number = 5,
  strictMode: boolean = false
): Promise<SearchResult[]> {
  try {
    console.log(`   └─ [Yahoo引擎] 正在查詢：${taskName}...`);
    
    // 導向 Yahoo 搜尋
    await page.goto(`https://tw.search.yahoo.com/search?p=${encodeURIComponent(query)}`, { waitUntil: 'networkidle2' });
    
    // 基本清理 (Esc, Click)
    await page.keyboard.press('Escape');
    try { await page.mouse.click(10, 10); } catch (e) {}

    // 抓取與初步過濾
    const rawItems = await page.evaluate((limit, riskKeys, isStrict) => {
      const results: { title: string, link: string, snippet: string }[] = [];
      const containers = Array.from(document.querySelectorAll('div.algo, li.first, li'));

      for (const container of containers) {
        const titleLink = container.querySelector('h3 a, .title a') as HTMLAnchorElement;
        if (!titleLink) continue;

        const title = titleLink.innerText.trim();
        const link = titleLink.href;

        // 排除 Yahoo 內部連結與明顯廣告
        if (link.includes("search.yahoo") || title.includes("相關報導")) continue;

        // 抓取摘要
        let snippet = "";
        const snippetEl = container.querySelector('.compText, .fc-2nd, .abstract, .lh-19') as HTMLElement;
        if (snippetEl) {
            snippet = snippetEl.innerText.trim();
        } else {
            snippet = (container as HTMLElement).innerText.replace(title, "").trim();
        }

        // 資料清洗
        snippet = snippet.replace(/(https?:\/\/[^\s]+)/g, "");
        snippet = snippet.replace(/^\d+\s*(小時|天|週|月)前\s*[-—]\s*/, "");
        snippet = snippet.replace(/\s+/g, " ").trim();
        
        const fullText = (title + snippet);

        // 嚴格模式 (媒體搜尋)：必須包含風險關鍵字
        if (isStrict) {
            const hasRiskKeyword = riskKeys.some((k: string) => fullText.includes(k));
            const isTrash = fullText.includes("買房") || fullText.includes("房地產");
            
            if (!hasRiskKeyword || isTrash) continue;
        }

        if (results.length < limit) {
          results.push({ title, link, snippet });
        }
      }
      return results;
    }, maxResults, RISK_KEYWORDS, strictMode);

    // 🔥 後端去重覆邏輯 (Deduplication)
    // 根據 "Link" 和 "Title" 來判斷是否重複
    const uniqueItems = rawItems.filter((item, index, self) => 
      index === self.findIndex((t) => (
        t.link === item.link || t.title === item.title
      ))
    );

    console.log(`      📊 ${taskName} 抓取結果: ${uniqueItems.length} 筆 (原始: ${rawItems.length})`);
    return uniqueItems;

  } catch (e) {
    console.log(`      ⚠️ ${taskName} 發生錯誤`, e);
    return [];
  }
}