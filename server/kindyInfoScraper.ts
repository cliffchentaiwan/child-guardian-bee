/**
 * KindyInfo 幼園通裁罰紀錄爬蟲
 * 
 * 功能：
 * 1. 使用輕量 HTTP 請求 + cheerio 解析 HTML
 * 2. 全量爬取所有年度的裁罰紀錄
 * 3. 解析表格資料（處分日期、縣市、地區、名稱、筆數、裁處）
 * 4. 儲存到資料庫（自動去重）
 */

import * as cheerio from 'cheerio';
import { getDb } from './db';
import { cases } from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';

export interface KindyInfoRecord {
  date: string;        // 處分日期
  city: string;        // 縣市
  district: string;    // 地區
  name: string;        // 幼兒園名稱
  count: number;       // 筆數
  penalty: string;     // 裁處
  sourceLink: string;  // 來源連結
}

/**
 * 使用 HTTP 請求爬取 KindyInfo 裁罰紀錄頁面
 */
export async function scrapeKindyInfoPage(url: string): Promise<KindyInfoRecord[]> {
  try {
    console.log(`[KindyInfo] 開始爬取頁面：${url}`);
    
    // 使用 fetch 請求頁面
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log(`[KindyInfo] 頁面載入完成，HTML 長度：${html.length}`);
    
    // 使用 cheerio 解析 HTML
    const $ = cheerio.load(html);
    const records: KindyInfoRecord[] = [];
    
    // 找到所有表格
    $('table').each((tableIndex, table) => {
      const $table = $(table);
      
      // 解析每一行
      $table.find('tr').each((rowIndex, row) => {
        // 跳過標題行
        if (rowIndex === 0) return;
        
        const $row = $(row);
        const cells = $row.find('td');
        
        if (cells.length >= 5) {
          const date = $(cells[0]).text().trim();
          const city = $(cells[1]).text().trim();
          const district = $(cells[2]).text().trim();
          
          // 名稱可能是連結
          const $nameCell = $(cells[3]);
          const $nameLink = $nameCell.find('a');
          const name = $nameLink.length > 0 
            ? $nameLink.text().trim() 
            : $nameCell.text().trim();
          
          const countText = $(cells[4]).text().trim();
          const count = parseInt(countText, 10) || 1;
          
          const penalty = cells.length > 5 ? $(cells[5]).text().trim() : '';
          
          if (name && date) {
            records.push({
              date,
              city,
              district,
              name,
              count,
              penalty,
              sourceLink: url,
            });
          }
        }
      });
    });
    
    // 如果沒有找到表格，嘗試其他選擇器
    if (records.length === 0) {
      console.log('[KindyInfo] 未找到標準表格，嘗試其他選擇器...');
      
      // 嘗試找 div 結構的資料
      $('.penalty-record, .record-item, [data-record]').each((index, element) => {
        const $el = $(element);
        const name = $el.find('.name, .title, h3, h4').first().text().trim();
        const date = $el.find('.date, .time').first().text().trim();
        const city = $el.find('.city, .location').first().text().trim();
        const penalty = $el.find('.penalty, .description').first().text().trim();
        
        if (name) {
          records.push({
            date: date || '未知',
            city: city || '未知',
            district: '',
            name,
            count: 1,
            penalty,
            sourceLink: url,
          });
        }
      });
    }
    
    console.log(`[KindyInfo] 解析完成，找到 ${records.length} 筆紀錄`);
    
    return records;
    
  } catch (error: any) {
    console.error(`[KindyInfo] 爬取失敗：`, error.message);
    return [];
  }
}

/**
 * 爬取所有年度的裁罰紀錄
 */
export async function scrapeAllKindyInfoRecords(): Promise<KindyInfoRecord[]> {
  const allRecords: KindyInfoRecord[] = [];
  
  // KindyInfo 裁罰紀錄頁面列表
  const pages = [
    'https://www.kindyinfo.com/blog/preschool-penalties',      // 2025/2026 最新
    'https://www.kindyinfo.com/blog/preschool-penalties/2024', // 2024年
    'https://www.kindyinfo.com/blog/preschool-penalties/2023', // 2023年
  ];
  
  for (const pageUrl of pages) {
    console.log(`\n[KindyInfo] 處理頁面：${pageUrl}`);
    const records = await scrapeKindyInfoPage(pageUrl);
    allRecords.push(...records);
    
    // 避免請求過於頻繁
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n[KindyInfo] 全部完成，共 ${allRecords.length} 筆紀錄`);
  
  return allRecords;
}

/**
 * 將 KindyInfo 紀錄轉換為案例格式並儲存到資料庫
 */
export async function saveKindyInfoRecordsToDatabase(records: KindyInfoRecord[]): Promise<{
  inserted: number;
  skipped: number;
}> {
  let inserted = 0;
  let skipped = 0;
  
  for (const record of records) {
    try {
      const db = await getDb();
      if (!db) {
        console.warn('[KindyInfo] 資料庫未連線，跳過儲存');
        skipped++;
        continue;
      }
      
      // 檢查是否已存在（使用名稱+日期+地點作為唯一識別）
      const existing = await db.select()
        .from(cases)
        .where(
          and(
            eq(cases.maskedName, record.name),
            eq(cases.caseDate, record.date),
            eq(cases.location, `${record.city}${record.district}`)
          )
        )
        .limit(1);
      
      if (existing.length > 0) {
        skipped++;
        continue;
      }
      
      // 新增案例
      await db.insert(cases).values({
        maskedName: record.name,
        originalName: record.name,
        role: '其他', // 幼兒園歸類為其他
        location: `${record.city}${record.district}`,
        riskTags: ['裁罰紀錄'],
        description: `${record.penalty}（${record.count} 筆）`,
        sourceType: '政府公告',
        sourceLink: record.sourceLink,
        verified: true, // 政府公開資料視為已驗證
        caseDate: record.date,
      });
      
      inserted++;
      
    } catch (error: any) {
      console.error(`[KindyInfo] 儲存失敗：${record.name}`, error.message);
    }
  }
  
  console.log(`[KindyInfo] 儲存完成：新增 ${inserted} 筆，跳過 ${skipped} 筆（已存在）`);
  
  return { inserted, skipped };
}

/**
 * 執行完整的 KindyInfo 同步流程
 */
export async function syncKindyInfo(): Promise<{
  totalRecords: number;
  inserted: number;
  skipped: number;
}> {
  console.log('='.repeat(50));
  console.log('[KindyInfo] 開始全量同步');
  console.log('='.repeat(50));
  
  // 爬取所有紀錄
  const records = await scrapeAllKindyInfoRecords();
  
  if (records.length === 0) {
    console.log('[KindyInfo] 沒有爬取到任何紀錄');
    return { totalRecords: 0, inserted: 0, skipped: 0 };
  }
  
  // 儲存到資料庫
  const { inserted, skipped } = await saveKindyInfoRecordsToDatabase(records);
  
  console.log('='.repeat(50));
  console.log(`[KindyInfo] 同步完成`);
  console.log(`  總紀錄數：${records.length}`);
  console.log(`  新增：${inserted}`);
  console.log(`  跳過（已存在）：${skipped}`);
  console.log('='.repeat(50));
  
  return {
    totalRecords: records.length,
    inserted,
    skipped,
  };
}

/**
 * 測試爬取單一頁面（用於除錯）
 */
export async function testScrape(): Promise<void> {
  const testUrl = 'https://www.kindyinfo.com/blog/2024%E5%B9%B4-%E5%B9%BC%E5%85%92%E5%9C%92%E8%A3%81%E7%BD%B0%E7%B4%80%E9%8C%84%E6%B8%85%E5%96%AE';
  console.log('開始測試爬取...');
  const records = await scrapeKindyInfoPage(testUrl);
  console.log('測試結果：', records.slice(0, 5));
}
