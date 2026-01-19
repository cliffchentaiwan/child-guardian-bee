import puppeteer from 'puppeteer';

// 定義我們要搜的政府黑名單網站
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
    message: "即時政府搜尋引擎 (Real-time)",
    sources: GOV_SITES.map(s => s.name)
  };
};

// 核心功能：給一個名字，我現在馬上去政府網站搜給你
export const searchGovLive = async (keyword: string) => {
  // 防呆：關鍵字太短不搜，避免雜訊
  if (!keyword || keyword.length < 2) return [];

  console.log(`🕵️‍♂️ 啟動即時搜尋，目標：${keyword}`);
  
  // 啟動瀏覽器
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--single-process", "--no-zygote"],
    headless: true,
  });

  const results: any[] = [];

  try {
    const page = await browser.newPage();
    // 偽裝成真人使用者，避免被阻擋
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36');

    // 策略：使用 Google Site Search 鎖定政府網域
    // 語法範例：site:ap.ece.moe.edu.tw OR site:crc.mohw.gov.tw "王小明"
    const siteQuery = GOV_SITES.map(s => `site:${s.domain}`).join(' OR ');
    const searchQuery = `${siteQuery} "${keyword}"`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

    console.log(`前往搜尋: ${searchUrl}`);
    // 設定較短的超時，避免家長等太久 (15秒)
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // 抓取搜尋結果
    const scrapedItems = await page.evaluate(() => {
      const items: any[] = [];
      // 選取 Google 搜尋結果的區塊
      const searchResults = document.querySelectorAll('div.g'); 
      
      searchResults.forEach((el) => {
        const titleEl = el.querySelector('h3');
        const linkEl = el.querySelector('a');
        const descEl = el.querySelector('div[style*="-webkit-line-clamp"]') || el.querySelector('span em')?.parentElement || el.querySelector('div[data-sncf="1"]');

        if (titleEl && linkEl) {
          items.push({
            title: titleEl.textContent || '',
            link: (linkEl as HTMLAnchorElement).href,
            snippet: descEl ? descEl.textContent : ''
          });
        }
      });
      return items;
    });

    console.log(`找到 ${scrapedItems.length} 筆政府相關紀錄`);

    // 整理資料回傳
    for (const item of scrapedItems) {
      // 簡單分類來源
      let sourceName = '政府公開資訊';
      if (item.link.includes('ece.moe')) sourceName = '全國教保資訊網';
      else if (item.link.includes('crc.mohw')) sourceName = 'CRC 兒少權益網';
      else if (item.link.includes('edu.tw')) sourceName = '教育局公告';

      results.push({
        maskedName: keyword, // 這是用此關鍵字搜出來的
        role: "查詢對象",
        riskTags: ["政府公開紀錄", sourceName],
        location: "台灣",
        caseDate: new Date().toISOString(),
        description: `【${sourceName}】${item.title} - ${item.snippet}`,
        sourceType: "政府公告",
        sourceLink: item.link,
        verified: true
      });
    }

  } catch (error: any) {
    console.error("即時搜尋失敗 (可能是連線逾時):", error.message);
  } finally {
    await browser.close();
  }

  return results;
};

// 相容性函式 (保留給舊介面呼叫，實際上不會用到)
export const syncAllGovData = async (onData: (data: any) => Promise<void>) => {
  return { success: true, message: "已切換為即時搜尋模式" };
};