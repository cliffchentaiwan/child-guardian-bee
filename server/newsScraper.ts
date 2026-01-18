/**
 * 新聞爬蟲模組
 * 
 * 從台灣主要新聞媒體的 RSS Feed 抓取兒少相關新聞
 * 支援：中央社、自由時報、聯合新聞網
 */

import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import axios from 'axios';

const parser = new Parser({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; ChildGuardianBee/1.0; +https://child-guardian-bee.manus.space)'
  }
});

/**
 * RSS 來源設定
 */
export const NEWS_SOURCES = [
  // 中央社（使用 FeedBurner）
  {
    name: '中央社',
    url: 'https://feeds.feedburner.com/rsscna/politics',
    category: '政治'
  },
  {
    name: '中央社',
    url: 'https://feeds.feedburner.com/rsscna/society',
    category: '社會'
  },
  // 自由時報
  {
    name: '自由時報',
    url: 'https://news.ltn.com.tw/rss/society.xml',
    category: '社會'
  },
  {
    name: '自由時報',
    url: 'https://news.ltn.com.tw/rss/life.xml',
    category: '生活'
  },
  {
    name: '自由時報',
    url: 'https://news.ltn.com.tw/rss/all.xml',
    category: '即時新聞'
  },
];

/**
 * 兒少相關關鍵字
 */
export const CHILD_SAFETY_KEYWORDS = [
  // 性侵害相關
  '性侵', '強制性交', '猥褻', '性騷擾', '妨害性自主', '偷拍',
  // 兒虐相關
  '虐童', '虐待', '凌虐', '家暴', '遺棄',
  // 對象相關
  '兒童', '少年', '幼童', '未成年', '學童', '幼兒園', '托嬰',
  // 角色相關
  '保母', '家教', '補習班', '老師', '教練', '安親班',
  // 法規相關
  '兒少', '兒童及少年'
];

/**
 * 角色識別關鍵字
 */
const ROLE_KEYWORDS: Record<string, string[]> = {
  '保母': ['保母', '托嬰', '托育'],
  '家教': ['家教'],
  '才藝老師': ['才藝', '鋼琴老師', '美術老師', '舞蹈老師'],
  '補習班老師': ['補習班', '補教'],
  '學校老師': ['老師', '教師', '導師', '學校'],
  '教練': ['教練', '游泳教練', '體育教練'],
};

/**
 * 新聞項目
 */
export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  category: string;
  content?: string;
  isChildRelated: boolean;
  matchedKeywords: string[];
  extractedNames: string[];
  extractedRole: string;
  riskTags: string[];
}

/**
 * 檢查標題或內容是否包含兒少相關關鍵字
 */
export function isChildRelatedNews(title: string, content: string = ''): { isRelated: boolean; matchedKeywords: string[] } {
  const text = (title + ' ' + content).toLowerCase();
  const matchedKeywords: string[] = [];
  
  for (const keyword of CHILD_SAFETY_KEYWORDS) {
    if (text.includes(keyword.toLowerCase())) {
      matchedKeywords.push(keyword);
    }
  }
  
  return {
    isRelated: matchedKeywords.length > 0,
    matchedKeywords
  };
}

/**
 * 識別角色類型
 */
export function identifyRole(text: string): string {
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return role;
      }
    }
  }
  return '其他';
}

/**
 * 提取風險標籤
 */
export function extractNewsRiskTags(text: string): string[] {
  const tags: string[] = [];
  const lowerText = text.toLowerCase();
  
  const tagPatterns = [
    { keywords: ['性侵', '強制性交', '妨害性自主'], tag: '性侵害' },
    { keywords: ['猥褻', '強制猥褻'], tag: '猥褻' },
    { keywords: ['性騷擾'], tag: '性騷擾' },
    { keywords: ['偷拍', '竊錄'], tag: '偷拍' },
    { keywords: ['虐童', '虐待', '凌虐'], tag: '兒童虐待' },
    { keywords: ['家暴'], tag: '家庭暴力' },
    { keywords: ['遺棄'], tag: '遺棄' },
  ];
  
  for (const { keywords, tag } of tagPatterns) {
    if (keywords.some(kw => lowerText.includes(kw))) {
      tags.push(tag);
    }
  }
  
  return tags;
}

/**
 * 從新聞內容中提取姓名
 * 新聞中的姓名通常會以「某某某」或「○○○」遮罩
 */
export function extractNamesFromNews(text: string): string[] {
  const names: string[] = [];
  
  // 常見的姓名模式
  // 姓氏列表（常見姓氏）
  const surnames = '王李張劉陳楊黃趙周吳徐孫胡朱高林何郭馬羅梁宋鄭謝韓唐馮于董蕭程曹袁鄧許傅沈曾彭呂蘇盧蔣蔡賈丁魏薛葉閻餘潘杖戴夏鐘汪田任姜範方石姚譚廖鄒熊金陸郝孔白崔康毛邱秦江史顧侯邵孟龍萬段雷錢湯尹黎易常武喬賀賴龔文樓南宮歐陽司馬上官諸葛皇甫令狐譜殳區淡台南宮史司徒宇文長孫慕容司馬司徒司空上官歐陽夏侯諸葛聞人東方赫連皇甫尉遲公孫軸轅令狐鍾離宇文長孫慕容鮮于閭宮西門司馬上官歐陽夏侯諸葛聞人東方赫連皇甫尉遲公孫軸轅令狐鍾離宇文長孫慕容鮮于閭宮西門';
  
  // 常見的姓名模式
  const patterns = [
    // 「被告王○○」「嫌犯李某某」 - 匹配姓氏 + 1-3 個字（包含○或某）
    new RegExp(`(?:被告|嫌犯|嫌疑人|涉案人|男子|女子|男性|女性)([${surnames}][○某\u4e00-\u9fa5]{1,3})`, 'g'),
    // 「姓王的男子」「姓李的保母」
    /姓([\u4e00-\u9fa5])的/g,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim();
      // 過濾明顯不是姓名的結果
      if (name.length >= 2 && name.length <= 4 && !names.includes(name)) {
        names.push(name);
      }
    }
  }
  
  return names;
}

/**
 * 遮罩姓名
 */
export function maskNewsName(name: string): string {
  if (name.length <= 1) return name + '○○';
  if (name.length === 2) return name[0] + '○';
  
  const chars = name.split('');
  for (let i = 1; i < chars.length - 1; i++) {
    chars[i] = '○';
  }
  return chars.join('');
}

/**
 * 抓取單一 RSS Feed
 */
async function fetchRssFeed(source: typeof NEWS_SOURCES[0]): Promise<NewsItem[]> {
  try {
    const feed = await parser.parseURL(source.url);
    const items: NewsItem[] = [];
    
    for (const item of feed.items || []) {
      const title = item.title || '';
      const content = item.contentSnippet || item.content || '';
      const { isRelated, matchedKeywords } = isChildRelatedNews(title, content);
      
      if (isRelated) {
        const fullText = title + ' ' + content;
        const extractedNames = extractNamesFromNews(fullText);
        const role = identifyRole(fullText);
        const riskTags = extractNewsRiskTags(fullText);
        
        items.push({
          title,
          link: item.link || '',
          pubDate: item.pubDate || new Date().toISOString(),
          source: source.name,
          category: source.category,
          content,
          isChildRelated: true,
          matchedKeywords,
          extractedNames: extractedNames.map(maskNewsName),
          extractedRole: role,
          riskTags
        });
      }
    }
    
    return items;
  } catch (error) {
    console.error(`抓取 ${source.name} RSS 失敗:`, error);
    return [];
  }
}

/**
 * 抓取所有新聞來源
 */
export async function fetchAllNewsFeeds(): Promise<NewsItem[]> {
  const allItems: NewsItem[] = [];
  
  for (const source of NEWS_SOURCES) {
    try {
      const items = await fetchRssFeed(source);
      allItems.push(...items);
      // 避免請求過於頻繁
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`處理 ${source.name} 時發生錯誤:`, error);
    }
  }
  
  // 去除重複（根據連結）
  const uniqueItems = allItems.filter((item, index, self) =>
    index === self.findIndex(t => t.link === item.link)
  );
  
  return uniqueItems;
}

/**
 * 同步新聞資料到資料庫
 */
export async function syncNewsData(
  saveToDb: (data: {
    maskedName: string;
    role: string;
    riskTags: string[];
    location: string;
    date: string;
    description: string;
    sourceType: string;
    sourceLink: string;
    verified: boolean;
  }) => Promise<void>,
  onProgress?: (current: number, total: number, message: string) => void
): Promise<{
  success: boolean;
  synced: number;
  childRelated: number;
  errors: number;
  error?: string;
}> {
  const result: {
    success: boolean;
    synced: number;
    childRelated: number;
    errors: number;
    error?: string;
  } = {
    success: false,
    synced: 0,
    childRelated: 0,
    errors: 0
  };

  try {
    onProgress?.(0, 0, '抓取新聞 RSS Feed...');
    const newsItems = await fetchAllNewsFeeds();
    
    result.synced = newsItems.length;
    result.childRelated = newsItems.length;
    
    let processed = 0;
    for (const item of newsItems) {
      try {
        processed++;
        onProgress?.(processed, newsItems.length, `處理: ${item.title.substring(0, 30)}...`);
        
        // 如果有提取到姓名，為每個姓名建立記錄
        if (item.extractedNames.length > 0) {
          for (const name of item.extractedNames) {
            await saveToDb({
              maskedName: name,
              role: item.extractedRole as any,
              riskTags: item.riskTags,
              location: '', // 新聞通常不會明確標示地點
              date: new Date(item.pubDate).toISOString().split('T')[0],
              description: item.title,
              sourceType: '媒體報導',
              sourceLink: item.link,
              verified: false, // 新聞報導標記為未證實
            });
          }
        } else {
          // 沒有提取到姓名，仍然記錄新聞
          await saveToDb({
            maskedName: '未知',
            role: item.extractedRole as any,
            riskTags: item.riskTags,
            location: '',
            date: new Date(item.pubDate).toISOString().split('T')[0],
            description: item.title,
            sourceType: '媒體報導',
            sourceLink: item.link,
            verified: false,
          });
        }
      } catch (error) {
        result.errors++;
        console.error(`處理新聞時發生錯誤:`, error);
      }
    }
    
    result.success = true;
  } catch (error: any) {
    result.error = error.message || '同步失敗';
    console.error('同步新聞資料時發生錯誤:', error);
  }

  return result;
}

/**
 * 測試抓取新聞（用於開發測試）
 */
export async function testFetchNews(): Promise<void> {
  console.log('開始測試新聞抓取...');
  const items = await fetchAllNewsFeeds();
  console.log(`共抓取到 ${items.length} 則兒少相關新聞`);
  
  for (const item of items.slice(0, 5)) {
    console.log('---');
    console.log(`標題: ${item.title}`);
    console.log(`來源: ${item.source}`);
    console.log(`關鍵字: ${item.matchedKeywords.join(', ')}`);
    console.log(`風險標籤: ${item.riskTags.join(', ')}`);
    console.log(`提取姓名: ${item.extractedNames.join(', ') || '無'}`);
    console.log(`連結: ${item.link}`);
  }
}
