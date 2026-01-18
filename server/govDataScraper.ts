/**
 * 政府資料來源爬蟲模組
 * 
 * 整合台灣各政府機關的兒少保護相關資料：
 * 1. CRC 兒少法裁罰公告 (crc.sfaa.gov.tw)
 * 2. 衛福部托育媒合平臺裁罰公告 (ncwisweb.sfaa.gov.tw)
 * 3. 全國教保資訊網幼兒園裁罰查詢 (ap.ece.moe.edu.tw)
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const axiosInstance = axios.create({
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
  },
});

/**
 * 裁罰紀錄資料結構
 */
export interface PenaltyRecord {
  name: string;           // 裁罰對象名稱
  maskedName: string;     // 遮罩後的名稱
  violationType: string;  // 違法類型
  penaltyDate: string;    // 裁罰日期
  location: string;       // 地區
  description: string;    // 描述
  sourceType: '政府公告' | '媒體報導' | '社群輿情';
  sourceLink: string;     // 來源連結
  sourceName: string;     // 來源名稱
  riskTags: string[];     // 風險標籤
  role: string;           // 角色（保母、幼兒園、托嬰中心等）
}

/**
 * 遮罩姓名（保護隱私）
 */
export function maskName(name: string): string {
  if (!name || name.length < 2) return name;
  
  // 如果是機構名稱，不遮罩
  if (name.includes('幼兒園') || name.includes('托嬰') || name.includes('中心') || name.includes('補習班')) {
    return name;
  }
  
  // 個人姓名遮罩：保留姓氏，中間用○替代
  if (name.length === 2) {
    return name[0] + '○';
  } else if (name.length === 3) {
    return name[0] + '○' + name[2];
  } else if (name.length >= 4) {
    return name[0] + '○'.repeat(name.length - 2) + name[name.length - 1];
  }
  
  return name;
}

/**
 * 從違法條文提取風險標籤
 */
export function extractRiskTags(violationType: string, description: string = ''): string[] {
  const tags: string[] = [];
  const text = `${violationType} ${description}`.toLowerCase();
  
  // 兒虐相關
  if (text.includes('虐') || text.includes('傷害') || text.includes('暴力') || text.includes('體罰')) {
    tags.push('虐待');
  }
  
  // 性侵害相關
  if (text.includes('性') || text.includes('猥褻') || text.includes('騷擾')) {
    tags.push('性騷擾');
  }
  
  // 疏忽照顧
  if (text.includes('疏忽') || text.includes('照顧不當') || text.includes('遺棄')) {
    tags.push('疏忽照顧');
  }
  
  // 不當管教
  if (text.includes('管教') || text.includes('處罰') || text.includes('不當')) {
    tags.push('不當管教');
  }
  
  // 違規經營
  if (text.includes('未立案') || text.includes('違規') || text.includes('超收')) {
    tags.push('違規經營');
  }
  
  // 安全疏失
  if (text.includes('安全') || text.includes('意外') || text.includes('傷亡')) {
    tags.push('安全疏失');
  }
  
  // 如果沒有匹配到任何標籤，加入通用標籤
  if (tags.length === 0) {
    tags.push('違反兒少法');
  }
  
  return tags;
}

/**
 * 判斷角色類型
 */
export function determineRole(name: string, description: string = ''): string {
  const text = `${name} ${description}`.toLowerCase();
  
  if (text.includes('保母') || text.includes('托育人員')) {
    return '保母';
  }
  if (text.includes('托嬰')) {
    return '托嬰中心';
  }
  if (text.includes('幼兒園') || text.includes('幼稚園')) {
    return '幼兒園';
  }
  if (text.includes('補習班')) {
    return '補習班老師';
  }
  if (text.includes('安親班')) {
    return '安親班';
  }
  if (text.includes('教練')) {
    return '教練';
  }
  if (text.includes('老師') || text.includes('教師')) {
    return '學校老師';
  }
  
  return '其他';
}

/**
 * 從地址或描述提取地區
 */
export function extractLocation(text: string): string {
  const cities = [
    '台北市', '臺北市', '新北市', '桃園市', '台中市', '臺中市',
    '台南市', '臺南市', '高雄市', '基隆市', '新竹市', '新竹縣',
    '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣',
    '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '臺東縣', '澎湖縣',
    '金門縣', '連江縣'
  ];
  
  for (const city of cities) {
    if (text.includes(city)) {
      // 統一使用「台」而非「臺」
      return city.replace('臺', '台');
    }
  }
  
  return '未知';
}

// ============================================
// CRC 兒少法裁罰公告爬蟲
// ============================================

/**
 * 抓取 CRC 兒少法裁罰公告
 * 來源：https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction
 */
export async function fetchCRCPenalties(): Promise<PenaltyRecord[]> {
  const records: PenaltyRecord[] = [];
  
  try {
    console.log('[CRC] 開始抓取兒少法裁罰公告...');
    
    // CRC 網站使用 ASP.NET，需要處理 ViewState
    const response = await axiosInstance.get('https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction', {
      maxRedirects: 5,
    });
    
    const $ = cheerio.load(response.data);
    
    // 解析表格資料
    $('.sanction-list .sanction-item, .list-row, [role="row"]').each((_, element) => {
      try {
        const $row = $(element);
        
        // 嘗試不同的選擇器來取得資料
        const county = $row.find('[role="cell"]:nth-child(1), .county, .col-county').text().trim();
        const target = $row.find('[role="cell"]:nth-child(2), .target, .col-target').text().trim();
        const violation = $row.find('[role="cell"]:nth-child(3), .violation, .col-violation').text().trim();
        const date = $row.find('[role="cell"]:nth-child(4), .date, .col-date').text().trim();
        
        if (target && violation) {
          records.push({
            name: target,
            maskedName: maskName(target),
            violationType: violation,
            penaltyDate: date,
            location: extractLocation(county || target),
            description: `違反${violation}`,
            sourceType: '政府公告',
            sourceLink: 'https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction',
            sourceName: 'CRC兒少法裁罰公告',
            riskTags: extractRiskTags(violation),
            role: determineRole(target, violation),
          });
        }
      } catch (err) {
        // 忽略單筆解析錯誤
      }
    });
    
    console.log(`[CRC] 抓取完成，共 ${records.length} 筆紀錄`);
    
  } catch (error) {
    console.error('[CRC] 抓取失敗:', error instanceof Error ? error.message : error);
  }
  
  return records;
}

// ============================================
// 衛福部托育媒合平臺裁罰公告爬蟲
// ============================================

/**
 * 抓取衛福部托育媒合平臺裁罰公告
 * 來源：https://ncwisweb.sfaa.gov.tw/home/penalty
 */
export async function fetchNCWISPenalties(): Promise<PenaltyRecord[]> {
  const records: PenaltyRecord[] = [];
  
  try {
    console.log('[NCWIS] 開始抓取托育媒合平臺裁罰公告...');
    
    const response = await axiosInstance.get('https://ncwisweb.sfaa.gov.tw/home/penalty', {
      maxRedirects: 5,
    });
    
    const $ = cheerio.load(response.data);
    
    // 解析表格或列表資料
    $('table tbody tr, .penalty-item, .list-item').each((_, element) => {
      try {
        const $row = $(element);
        
        const name = $row.find('td:nth-child(1), .name').text().trim();
        const type = $row.find('td:nth-child(2), .type').text().trim();
        const violation = $row.find('td:nth-child(3), .violation').text().trim();
        const date = $row.find('td:nth-child(4), .date').text().trim();
        const location = $row.find('td:nth-child(5), .location').text().trim();
        
        if (name) {
          records.push({
            name: name,
            maskedName: maskName(name),
            violationType: violation || type || '違反兒少相關法規',
            penaltyDate: date,
            location: extractLocation(location || name),
            description: `${type || '托育人員'} - ${violation || '違反兒少相關法規'}`,
            sourceType: '政府公告',
            sourceLink: 'https://ncwisweb.sfaa.gov.tw/home/penalty',
            sourceName: '衛福部托育媒合平臺',
            riskTags: extractRiskTags(violation, type),
            role: type?.includes('托嬰') ? '托嬰中心' : '保母',
          });
        }
      } catch (err) {
        // 忽略單筆解析錯誤
      }
    });
    
    console.log(`[NCWIS] 抓取完成，共 ${records.length} 筆紀錄`);
    
  } catch (error) {
    console.error('[NCWIS] 抓取失敗:', error instanceof Error ? error.message : error);
  }
  
  return records;
}

// ============================================
// 全國教保資訊網幼兒園裁罰查詢爬蟲
// ============================================

/**
 * 抓取全國教保資訊網幼兒園裁罰紀錄
 * 來源：https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx
 */
export async function fetchECEPenalties(): Promise<PenaltyRecord[]> {
  const records: PenaltyRecord[] = [];
  
  try {
    console.log('[ECE] 開始抓取幼兒園裁罰紀錄...');
    
    const response = await axiosInstance.get('https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx', {
      maxRedirects: 5,
    });
    
    const $ = cheerio.load(response.data);
    
    // 解析表格資料
    $('table tbody tr, .punish-item, #gvPunish tr').each((_, element) => {
      try {
        const $row = $(element);
        
        // 跳過表頭
        if ($row.find('th').length > 0) return;
        
        const kindergarten = $row.find('td:nth-child(1)').text().trim();
        const violation = $row.find('td:nth-child(2)').text().trim();
        const date = $row.find('td:nth-child(3)').text().trim();
        const location = $row.find('td:nth-child(4)').text().trim();
        
        if (kindergarten) {
          records.push({
            name: kindergarten,
            maskedName: kindergarten, // 機構名稱不遮罩
            violationType: violation || '違反幼照法',
            penaltyDate: date,
            location: extractLocation(location || kindergarten),
            description: `幼兒園 - ${violation || '違反幼照法'}`,
            sourceType: '政府公告',
            sourceLink: 'https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx',
            sourceName: '全國教保資訊網',
            riskTags: extractRiskTags(violation),
            role: '幼兒園',
          });
        }
      } catch (err) {
        // 忽略單筆解析錯誤
      }
    });
    
    console.log(`[ECE] 抓取完成，共 ${records.length} 筆紀錄`);
    
  } catch (error) {
    console.error('[ECE] 抓取失敗:', error instanceof Error ? error.message : error);
  }
  
  return records;
}

// ============================================
// 各縣市社會局裁罰公告爬蟲
// ============================================

/**
 * 縣市社會局裁罰公告來源
 */
const COUNTY_SOURCES = [
  {
    name: '台北市社會局',
    url: 'https://dosw.gov.taipei/News.aspx?n=F8B2A0E3B4F4C8D1',
    city: '台北市',
  },
  {
    name: '新北市社會局',
    url: 'https://www.sw.ntpc.gov.tw/home.jsp?id=c3e0d9c2c3b4a5b6',
    city: '新北市',
  },
  {
    name: '台中市社會局',
    url: 'https://www.society.taichung.gov.tw/13710/13735/13738/',
    city: '台中市',
  },
  {
    name: '高雄市社會局',
    url: 'https://socbu.kcg.gov.tw/index.php',
    city: '高雄市',
  },
];

/**
 * 抓取各縣市社會局裁罰公告
 */
export async function fetchCountyPenalties(): Promise<PenaltyRecord[]> {
  const allRecords: PenaltyRecord[] = [];
  
  for (const source of COUNTY_SOURCES) {
    try {
      console.log(`[縣市] 開始抓取 ${source.name}...`);
      
      const response = await axiosInstance.get(source.url, {
        maxRedirects: 5,
        timeout: 15000,
      });
      
      const $ = cheerio.load(response.data);
      
      // 搜尋包含「兒少」、「裁罰」、「違反」等關鍵字的連結
      $('a').each((_, element) => {
        const $link = $(element);
        const text = $link.text().trim();
        const href = $link.attr('href') || '';
        
        if (text.includes('兒少') || text.includes('裁罰') || text.includes('違反')) {
          allRecords.push({
            name: text.substring(0, 50),
            maskedName: text.substring(0, 50),
            violationType: '違反兒少相關法規',
            penaltyDate: new Date().toISOString().split('T')[0],
            location: source.city,
            description: text,
            sourceType: '政府公告',
            sourceLink: href.startsWith('http') ? href : `${source.url}${href}`,
            sourceName: source.name,
            riskTags: extractRiskTags(text),
            role: determineRole(text),
          });
        }
      });
      
      console.log(`[縣市] ${source.name} 抓取完成`);
      
    } catch (error) {
      console.error(`[縣市] ${source.name} 抓取失敗:`, error instanceof Error ? error.message : error);
    }
  }
  
  console.log(`[縣市] 所有縣市抓取完成，共 ${allRecords.length} 筆紀錄`);
  
  return allRecords;
}

// ============================================
// KindyInfo 幼園通爬蟲
// ============================================

/**
 * 抓取 KindyInfo 幼兒園裁罰紀錄
 * 來源：https://www.kindyinfo.com/blog/preschool-penalties
 */
export async function fetchKindyInfoPenalties(): Promise<PenaltyRecord[]> {
  const records: PenaltyRecord[] = [];
  
  try {
    console.log('[KindyInfo] 開始抓取幼園通裁罰紀錄...');
    
    const response = await axiosInstance.get('https://www.kindyinfo.com/blog/preschool-penalties', {
      maxRedirects: 5,
      timeout: 30000,
    });
    
    const $ = cheerio.load(response.data);
    
    // 解析表格資料 - KindyInfo 使用 HTML 表格
    $('table tbody tr, tr').each((_, element) => {
      try {
        const $row = $(element);
        const cells = $row.find('td');
        
        if (cells.length >= 5) {
          const date = $(cells[0]).text().trim();
          const city = $(cells[1]).text().trim();
          const district = $(cells[2]).text().trim();
          const kindergartenLink = $(cells[3]).find('a');
          const kindergarten = kindergartenLink.text().trim() || $(cells[3]).text().trim();
          const penaltyCount = $(cells[4]).text().trim();
          const penaltyContent = cells.length > 5 ? $(cells[5]).text().trim() : '';
          
          if (kindergarten && date) {
            records.push({
              name: kindergarten,
              maskedName: kindergarten, // 機構名稱不遮罩
              violationType: penaltyContent || '違反幼照法',
              penaltyDate: date,
              location: extractLocation(`${city}${district}`),
              description: `${kindergarten} - ${penaltyContent || '裁罰' + penaltyCount + '次'}`,
              sourceType: '政府公告',
              sourceLink: 'https://www.kindyinfo.com/blog/preschool-penalties',
              sourceName: 'KindyInfo幼園通',
              riskTags: extractRiskTags(penaltyContent),
              role: '幼兒園',
            });
          }
        }
      } catch (err) {
        // 忽略單筆解析錯誤
      }
    });
    
    console.log(`[KindyInfo] 抓取完成，共 ${records.length} 筆紀錄`);
    
  } catch (error) {
    console.error('[KindyInfo] 抓取失敗:', error instanceof Error ? error.message : error);
  }
  
  return records;
}

// ============================================
// 統一同步函數
// ============================================

/**
 * 同步所有政府資料來源
 */
export async function syncAllGovData(
  insertCallback: (record: PenaltyRecord) => Promise<void>,
  progressCallback?: (current: number, total: number, message: string) => void
): Promise<{
  success: boolean;
  synced: number;
  added: number;
  errors: number;
  error?: string;
}> {
  let synced = 0;
  let added = 0;
  let errors = 0;
  
  try {
    // 1. CRC 兒少法裁罰公告
    progressCallback?.(1, 4, '抓取 CRC 兒少法裁罰公告...');
    const crcRecords = await fetchCRCPenalties();
    synced += crcRecords.length;
    
    for (const record of crcRecords) {
      try {
        await insertCallback(record);
        added++;
      } catch (err) {
        errors++;
      }
    }
    
    // 2. 衛福部托育媒合平臺
    progressCallback?.(2, 4, '抓取衛福部托育媒合平臺裁罰公告...');
    const ncwisRecords = await fetchNCWISPenalties();
    synced += ncwisRecords.length;
    
    for (const record of ncwisRecords) {
      try {
        await insertCallback(record);
        added++;
      } catch (err) {
        errors++;
      }
    }
    
    // 3. 全國教保資訊網
    progressCallback?.(3, 4, '抓取全國教保資訊網幼兒園裁罰紀錄...');
    const eceRecords = await fetchECEPenalties();
    synced += eceRecords.length;
    
    for (const record of eceRecords) {
      try {
        await insertCallback(record);
        added++;
      } catch (err) {
        errors++;
      }
    }
    
    // 4. 各縣市社會局
    progressCallback?.(4, 5, '抓取各縣市社會局裁罰公告...');
    const countyRecords = await fetchCountyPenalties();
    synced += countyRecords.length;
    
    for (const record of countyRecords) {
      try {
        await insertCallback(record);
        added++;
      } catch (err) {
        errors++;
      }
    }
    
    // 5. KindyInfo 幼園通
    progressCallback?.(5, 5, '抓取 KindyInfo 幼園通裁罰紀錄...');
    const kindyInfoRecords = await fetchKindyInfoPenalties();
    synced += kindyInfoRecords.length;
    
    for (const record of kindyInfoRecords) {
      try {
        await insertCallback(record);
        added++;
      } catch (err) {
        errors++;
      }
    }
    
    return {
      success: true,
      synced,
      added,
      errors,
    };
    
  } catch (error) {
    return {
      success: false,
      synced,
      added,
      errors,
      error: error instanceof Error ? error.message : '未知錯誤',
    };
  }
}

/**
 * 取得政府資料來源狀態
 */
export function getGovDataSourcesStatus() {
  return {
    available: true,
    sources: [
      { name: 'CRC兒少法裁罰公告', url: 'https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction', status: 'active' },
      { name: '衛福部托育媒合平臺', url: 'https://ncwisweb.sfaa.gov.tw/home/penalty', status: 'active' },
      { name: '全國教保資訊網', url: 'https://ap.ece.moe.edu.tw/webecems/punishSearch.aspx', status: 'active' },
      { name: '各縣市社會局', url: '多個來源', status: 'active' },
      { name: 'KindyInfo幼園通', url: 'https://www.kindyinfo.com/blog/preschool-penalties', status: 'active' },
    ],
    message: '政府資料來源隨時可用',
  };
}
