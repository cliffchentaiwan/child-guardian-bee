/**
 * CRC 兒少法裁罰公告爬蟲
 * 資料來源：https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction
 * 
 * 資料結構：
 * - 縣市名稱
 * - 裁罰對象（姓名）
 * - 違法條文
 * - 裁罰日期
 * - 詳情連結
 */

import * as cheerio from 'cheerio';

// CRC 裁罰紀錄類型
export interface CrcPenaltyRecord {
  id: string;           // 從詳情連結提取的 ID
  city: string;         // 縣市名稱
  name: string;         // 裁罰對象（姓名）
  violation: string;    // 違法條文
  date: string;         // 裁罰日期 (YYYY.MM.DD)
  detailUrl: string;    // 詳情連結
  sourceType: string;   // 資料來源類型
}

// 爬取結果
export interface CrcScraperResult {
  success: boolean;
  records: CrcPenaltyRecord[];
  totalPages: number;
  error?: string;
}

// 縣市代碼對照
const CITY_CODES: Record<string, string> = {
  '0': '全選',
  '1': '臺北市',
  '2': '基隆市',
  '3': '新北市',
  '4': '宜蘭縣',
  '5': '桃園市',
  '6': '新竹縣',
  '7': '苗栗縣',
  '8': '南投縣',
  '9': '彰化縣',
  '10': '雲林縣',
  '11': '嘉義縣',
  '12': '高雄市',
  '13': '屏東縣',
  '14': '花蓮縣',
  '15': '臺東縣',
  '16': '澎湖縣',
  '17': '金門縣',
  '18': '連江縣',
  '19': '臺中市',
  '20': '臺南市',
  '21': '新竹市',
  '22': '嘉義市',
};

// 違法類型分類
export function categorizeViolation(violation: string): string {
  if (violation.includes('第9款') || violation.includes('猥褻') || violation.includes('性交')) {
    return '性侵害';
  }
  if (violation.includes('第2款') || violation.includes('身心虐待')) {
    return '身心虐待';
  }
  if (violation.includes('第15款')) {
    return '不當行為';
  }
  return '其他違規';
}

// Cookie 檔案路徑（用於處理 session）
const COOKIE_FILE = '/tmp/crc_cookies.txt';

/**
 * 爬取單頁 CRC 裁罰資料
 */
async function fetchPage(page: number, pageSize: number = 30): Promise<{ records: CrcPenaltyRecord[]; totalPages: number }> {
  const url = `https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction?page=${page}&pagesize=${pageSize}&name=&target=all&city=0&startDate=&endDate=&dosearch=true`;
  
  // 使用 child_process 執行 curl 來處理重定向和 cookies
  const { execSync } = await import('child_process');
  
  const html = execSync(
    `curl -sL "${url}" -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -c ${COOKIE_FILE} -b ${COOKIE_FILE} --max-redirs 10`,
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  );
  const $ = cheerio.load(html);
  
  const records: CrcPenaltyRecord[] = [];
  
  // 解析資料行
  $('div.tr[role="row"]').each((_, row) => {
    const cells = $(row).find('div[role="cell"]');
    if (cells.length < 5) return; // 跳過表頭
    
    const city = $(cells[1]).find('span').text().trim();
    const name = $(cells[2]).find('span').text().trim();
    const violation = $(cells[3]).find('span').text().trim().replace(/<br\s*\/?>/gi, ' ');
    const date = $(cells[4]).find('span').text().trim();
    const detailLink = $(cells[5]).find('a').attr('href') || '';
    
    // 提取 ID
    const idMatch = detailLink.match(/\/Detail\/(\d+)/);
    const id = idMatch ? idMatch[1] : `crc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    if (name && city) {
      records.push({
        id,
        city,
        name,
        violation: violation.replace(/\s+/g, ' ').trim(),
        date,
        detailUrl: detailLink ? `https://crc.sfaa.gov.tw${detailLink}` : '',
        sourceType: 'CRC兒少法',
      });
    }
  });
  
  // 解析總頁數
  let totalPages = 1;
  const pageText = $('body').text();
  const pageMatch = pageText.match(/共\s*(\d+)\s*頁/);
  if (pageMatch) {
    totalPages = parseInt(pageMatch[1], 10);
  }
  
  return { records, totalPages };
}

/**
 * 爬取所有 CRC 裁罰資料
 */
export async function scrapeAllCrcRecords(options?: {
  maxPages?: number;
  pageSize?: number;
  delayMs?: number;
  onProgress?: (current: number, total: number, records: number) => void;
}): Promise<CrcScraperResult> {
  const {
    maxPages = 200,
    pageSize = 30,
    delayMs = 500,
    onProgress,
  } = options || {};

  try {
    // 先取得第一頁，確認總頁數
    const firstPage = await fetchPage(1, pageSize);
    const totalPages = Math.min(firstPage.totalPages, maxPages);
    
    const allRecords: CrcPenaltyRecord[] = [...firstPage.records];
    
    if (onProgress) {
      onProgress(1, totalPages, allRecords.length);
    }
    
    // 爬取剩餘頁面
    for (let page = 2; page <= totalPages; page++) {
      // 延遲避免過度請求
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      try {
        const { records } = await fetchPage(page, pageSize);
        allRecords.push(...records);
        
        if (onProgress) {
          onProgress(page, totalPages, allRecords.length);
        }
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error);
        // 繼續爬取下一頁
      }
    }
    
    return {
      success: true,
      records: allRecords,
      totalPages,
    };
  } catch (error) {
    return {
      success: false,
      records: [],
      totalPages: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 將 CRC 日期格式轉換為標準格式
 * 輸入: "2026.01.14"
 * 輸出: "2026-01-14"
 */
export function normalizeCrcDate(dateStr: string): string {
  return dateStr.replace(/\./g, '-');
}

/**
 * 將 CRC 紀錄轉換為資料庫格式
 */
export function convertToCaseRecord(record: CrcPenaltyRecord) {
  return {
    name: record.name,
    role: '行為人',
    location: record.city,
    riskTags: [categorizeViolation(record.violation)],
    description: record.violation,
    sourceType: 'CRC兒少法',
    sourceLink: record.detailUrl,
    date: normalizeCrcDate(record.date),
    verified: true, // 政府公告視為已驗證
  };
}

// 測試用：爬取少量資料
export async function testScrape(pages: number = 2): Promise<CrcScraperResult> {
  return scrapeAllCrcRecords({
    maxPages: pages,
    pageSize: 10,
    delayMs: 300,
    onProgress: (current, total, records) => {
      console.log(`[CRC] 爬取進度: ${current}/${total} 頁, 共 ${records} 筆`);
    },
  });
}

/**
 * 同步 CRC 資料到資料庫
 * 爬取所有 CRC 裁罰紀錄並存入資料庫
 */
export async function syncCrcData(): Promise<{
  success: boolean;
  totalRecords: number;
  inserted: number;
  skipped: number;
  error?: string;
}> {
  // 動態 import db 模組避免循環依賴
  const db = await import('./db');
  
  console.log('[CRC] 開始同步 CRC 兒少法裁罰資料...');
  
  try {
    // 爬取所有資料
    const result = await scrapeAllCrcRecords({
      maxPages: 200,
      pageSize: 30,
      delayMs: 500,
      onProgress: (current, total, records) => {
        if (current % 10 === 0 || current === total) {
          console.log(`[CRC] 爬取進度: ${current}/${total} 頁, 共 ${records} 筆`);
        }
      },
    });
    
    if (!result.success) {
      return {
        success: false,
        totalRecords: 0,
        inserted: 0,
        skipped: 0,
        error: result.error,
      };
    }
    
    console.log(`[CRC] 爬取完成，共 ${result.records.length} 筆，開始寫入資料庫...`);
    
    let inserted = 0;
    let skipped = 0;
    
    // 逐筆寫入資料庫
    for (const record of result.records) {
      try {
        // 檢查是否已存在（使用姓名+日期+地區作為唯一識別）
        const existing = await db.findCaseByNameAndDate(record.name, normalizeCrcDate(record.date), record.city);
        
        if (existing) {
          skipped++;
          continue;
        }
        
        // 插入新紀錄
        await db.insertCase({
          maskedName: record.name, // CRC 資料已經是完整姓名
          originalName: record.name,
          role: '其他', // CRC 資料沒有角色分類
          riskTags: [categorizeViolation(record.violation)],
          location: record.city,
          caseDate: normalizeCrcDate(record.date),
          description: record.violation,
          sourceType: '政府公告',
          sourceLink: record.detailUrl,
          verified: true,
        });
        
        inserted++;
      } catch (error) {
        console.error(`[CRC] 寫入失敗: ${record.name}`, error);
        skipped++;
      }
    }
    
    console.log(`[CRC] 同步完成：新增 ${inserted} 筆，跳過 ${skipped} 筆`);
    
    return {
      success: true,
      totalRecords: result.records.length,
      inserted,
      skipped,
    };
  } catch (error) {
    console.error('[CRC] 同步失敗:', error);
    return {
      success: false,
      totalRecords: 0,
      inserted: 0,
      skipped: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
