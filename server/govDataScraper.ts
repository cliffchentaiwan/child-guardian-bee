import puppeteer from 'puppeteer';

// 定義搜尋來源
const GOV_SITES = [
  { 
    name: '全國教保資訊網', 
    domain: 'ap.ece.moe.edu.tw', 
    type: '不適任/裁罰' 
  },
  { 
    name: 'CRC 兒少權益網', 
    domain: 'crc.mohw.gov.tw', 
    type: '兒少法裁罰' 
  },
  {
    name: '各縣市教育局公告',
    domain: 'edu.tw', 
    type: '補習班違規'
  }
];

export const getGovDataSourcesStatus = () => {
  return {
    available: true,
    message: "DuckDuckGo 即時搜尋引擎 (Bot Friendly)",
    sources: GOV_SITES.map(s => s.name)
  };
};

// 核心功能：使用 DuckDuckGo Lite 進行即時搜尋 (真實爬蟲)
export const searchGovLive = async (keyword: string) => {
  if (!keyword || keyword.length < 2) return [];

  console.log(`🦆 啟動 DuckDuckGo 搜尋，目標：${keyword}`);
  
  const browser = await puppeteer.launch({
    args: [
        "--no-sandbox", 
        "--disable-setuid-sandbox", 
        "--single-process", 
        "--no-zygote",
        "--disable-blink-features=AutomationControlled"
    ],
    headless: true,
  });

  const results: any[] = [];

  try {
    const page = await browser.newPage();
    // 偽裝 User Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    // 構建 DuckDuckGo 語法
    const siteQuery = GOV_SITES.map(s => `site:${s.domain}`).join(' OR ');
    const fullQuery = `${siteQuery} "${keyword}"`;
    
    // 使用 DuckDuckGo HTML 版
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(fullQuery)}`;

    console.log(`前往搜尋: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 20000 });

    const scrapedItems = await page.evaluate(() => {
      const items: any[] = [];
      const resultNodes = document.querySelectorAll('.result');
      
      resultNodes.forEach((node) => {
        const titleNode = node.querySelector('.result__a');
        const snippetNode = node.querySelector('.result__snippet');
        const linkNode = node.querySelector('.result__url'); 

        if (titleNode) {
          const title = titleNode.textContent?.trim() || '';
          const rawLink = (titleNode as HTMLAnchorElement).href;
          const snippet = snippetNode ? snippetNode.textContent?.trim() : '';

          if (title && rawLink) {
             items.push({
               title,
               link: rawLink,
               snippet: snippet || '點擊查看詳情'
             });
          }
        }
      });
      return items;
    });

    console.log(`🦆 找到 ${scrapedItems.length} 筆資料`);

    for (const item of scrapedItems) {
      let sourceName = '政府公開資訊';
      if (item.link.includes('ece.moe')) sourceName = '全國教保資訊網';
      else if (item.link.includes('crc.mohw')) sourceName = 'CRC 兒少權益網';
      else if (item.link.includes('edu.tw')) sourceName = '教育局公告';

      if (item.title.includes(keyword) || (item.snippet && item.snippet.includes(keyword))) {
          results.push({
            maskedName: keyword,
            role: "查詢對象",
            riskTags: ["政府公開紀錄", sourceName],
            location: "台灣",
            caseDate: new Date().toISOString(),
            description: `【${sourceName}】${item.title}\n${item.snippet}`,
            sourceType: "政府公告",
            sourceLink: item.link,
            verified: true
          });
      }
    }

  } catch (error: any) {
    console.error("搜尋引擎連線錯誤:", error.message);
  } finally {
    if (browser) await browser.close();
  }

  return results;
};

// 相容舊介面 (雖然不會用到，但留著避免報錯)
export const syncAllGovData = async (onData: (data: any) => Promise<void>) => {
  return { success: true, message: "已切換為即時搜尋模式" };
};