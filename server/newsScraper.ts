import puppeteer from 'puppeteer';

export const NEWS_SOURCES = [
  { name: 'Yahoo News', category: '社會' }
];

export const CHILD_SAFETY_KEYWORDS = [
  '兒少性剝削', '虐童', '不當管教', '補習班 狼師', '教練 性騷'
];

// 模擬真實新聞資料擷取
export const fetchAllNewsFeeds = async () => {
  console.log("📰 啟動新聞爬蟲...");
  const browser = await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--single-process", 
      "--no-zygote",
    ],
    headless: true,
  });

  const newsItems: any[] = [];

  try {
    const page = await browser.newPage();
    // 偽裝成一般使用者
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Safari/537.36');

    // 搜尋 Yahoo 新聞中的 "兒少" 相關關鍵字
    const targetUrl = 'https://tw.news.yahoo.com/tag/兒少';
    console.log(`前往: ${targetUrl}`);
    
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 抓取新聞標題與連結 (Yahoo 新聞結構)
    const scrapedData = await page.evaluate(() => {
      const results: any[] = [];
      // Yahoo 的新聞列表選擇器 (可能會變動，但我們先抓通用的連結結構)
      const anchors = document.querySelectorAll('a[href*="/news/"]'); 
      
      anchors.forEach((a) => {
        const title = a.textContent?.trim();
        const link = (a as HTMLAnchorElement).href;
        
        // 簡單過濾：標題長度大於 10 且包含關鍵字才算有效新聞
        if (title && title.length > 10 && (title.includes('兒') || title.includes('童') || title.includes('師') || title.includes('教練'))) {
           results.push({
             title: title,
             link: link,
             source: 'Yahoo News',
             pubDate: new Date().toISOString(),
           });
        }
      });
      return results;
    });

    console.log(`找到 ${scrapedData.length} 則相關新聞`);
    
    // 整理資料格式
    for (const item of scrapedData) {
      // 避免重複
      if (!newsItems.some(n => n.title === item.title)) {
        newsItems.push({
            title: item.title,
            source: item.source,
            pubDate: item.pubDate,
            riskTags: ['媒體報導', '兒少安全'],
            extractedNames: [], // 暫時無法從標題精準提取人名，先留空
            link: item.link
        });
      }
    }

  } catch (error: any) {
    console.error("新聞爬蟲錯誤:", error.message);
  } finally {
    await browser.close();
  }

  return newsItems;
};

// 這是被 Router 呼叫的主功能
export const syncNewsData = async (
  onData: (data: any) => Promise<void>
) => {
  const news = await fetchAllNewsFeeds();
  let syncedCount = 0;

  for (const item of news) {
    // 轉換成資料庫格式
    await onData({
        maskedName: "新聞報導(點擊查看)", // 因為新聞標題不一定有人名，我們先用通用名稱
        role: "其他",
        riskTags: item.riskTags,
        location: "台灣",
        date: item.pubDate,
        description: item.title, // 標題當作描述
        sourceType: "媒體報導",
        sourceLink: item.link,
        verified: false,
    });
    syncedCount++;
  }

  return {
    success: true,
    synced: news.length,
    childRelated: news.length,
    error: undefined
  };
};