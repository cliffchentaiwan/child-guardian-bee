/**
 * AI 增強版新聞同步模組
 * 
 * 使用 AI 模型優化姓名提取準確度
 */

import { fetchAllNewsFeeds, NewsItem, maskNewsName } from "./newsScraper";
import { extractNamesWithAI, normalizeRole, maskExtractedName } from "./aiNameExtractor";

/**
 * AI 增強的新聞同步結果
 */
export interface AINewsSyncResult {
  success: boolean;
  synced: number;
  childRelated: number;
  aiProcessed: number;
  errors: number;
  error?: string;
}

/**
 * 使用 AI 增強的新聞同步
 */
export async function syncNewsWithAI(
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
): Promise<AINewsSyncResult> {
  const result: AINewsSyncResult = {
    success: false,
    synced: 0,
    childRelated: 0,
    aiProcessed: 0,
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
        onProgress?.(processed, newsItems.length, `AI 分析: ${item.title.substring(0, 25)}...`);
        
        // 使用 AI 提取姓名
        const aiResult = await extractNamesWithAI(item.title, item.content || '');
        result.aiProcessed++;
        
        if (aiResult.names.length > 0) {
          // AI 成功提取到姓名
          for (const extracted of aiResult.names) {
            // 只處理信心度 >= 60 的結果
            // 過濾非姓名結果（如「哥哥」「父親」等親屬稱謂）
            const invalidNames = ['哥哥', '妹妹', '父親', '母親', '爸爸', '媽媽', '叔叔', '叔伯', '阿姨', '表哥', '表妹', '堂哥', '堂妹', '父', '母', '兄', '姐', '弟', '妹'];
            const isInvalidName = invalidNames.some(n => extracted.name.includes(n));
            
            if (extracted.confidence >= 60 && !isInvalidName && extracted.name.length >= 2) {
              const maskedName = maskExtractedName(extracted.name);
              const normalizedRole = normalizeRole(extracted.role);
              
              await saveToDb({
                maskedName,
                role: normalizedRole,
                riskTags: item.riskTags,
                location: '', // 新聞通常不會明確標示地點
                date: new Date(item.pubDate).toISOString().split('T')[0],
                description: `${item.title} (${aiResult.summary})`,
                sourceType: '媒體報導',
                sourceLink: item.link,
                verified: false, // 新聞報導標記為未證實
              });
            }
          }
        } else if (item.extractedNames.length > 0) {
          // AI 沒有提取到，使用原本的正則提取結果
          for (const name of item.extractedNames) {
            await saveToDb({
              maskedName: name,
              role: item.extractedRole,
              riskTags: item.riskTags,
              location: '',
              date: new Date(item.pubDate).toISOString().split('T')[0],
              description: item.title,
              sourceType: '媒體報導',
              sourceLink: item.link,
              verified: false,
            });
          }
        } else {
          // 都沒有提取到姓名，仍然記錄新聞
          await saveToDb({
            maskedName: '未知',
            role: item.extractedRole,
            riskTags: item.riskTags,
            location: '',
            date: new Date(item.pubDate).toISOString().split('T')[0],
            description: item.title,
            sourceType: '媒體報導',
            sourceLink: item.link,
            verified: false,
          });
        }
        
        // 避免 API 請求過於頻繁
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        result.errors++;
        console.error(`處理新聞時發生錯誤:`, error);
      }
    }
    
    result.success = true;
  } catch (error: any) {
    result.error = error.message || '同步失敗';
    console.error('AI 新聞同步時發生錯誤:', error);
  }

  return result;
}

/**
 * 測試 AI 姓名提取
 */
export async function testAIExtraction(): Promise<void> {
  console.log('開始測試 AI 姓名提取...');
  
  const newsItems = await fetchAllNewsFeeds();
  console.log(`共抓取到 ${newsItems.length} 則兒少相關新聞`);
  
  for (const item of newsItems.slice(0, 3)) {
    console.log('\n========================================');
    console.log(`標題: ${item.title}`);
    console.log(`來源: ${item.source}`);
    
    // 原本的正則提取
    console.log(`\n[正則提取] 姓名: ${item.extractedNames.join(', ') || '無'}`);
    
    // AI 提取
    const aiResult = await extractNamesWithAI(item.title, item.content || '');
    console.log(`\n[AI 提取] 結果:`);
    if (aiResult.names.length > 0) {
      for (const name of aiResult.names) {
        console.log(`  - ${name.name} (${name.role}, 信心度: ${name.confidence}%)`);
        console.log(`    上下文: ${name.context}`);
      }
    } else {
      console.log('  無');
    }
    console.log(`\n[AI 摘要] ${aiResult.summary}`);
  }
}
