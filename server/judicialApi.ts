/**
 * 司法院裁判書開放 API 整合模組
 * 
 * API 服務時間：每日凌晨 0 時至 6 時（台灣時間）
 * 文件版本：114.08.22
 * 
 * 環境變數：
 * - JUDICIAL_API_USER: 司法院資料開放平台帳號
 * - JUDICIAL_API_PASSWORD: 司法院資料開放平台密碼
 */

import axios from 'axios';

const BASE_URL = 'https://data.judicial.gov.tw/jdg/api';

// Token 快取
let cachedToken: string | null = null;
let tokenExpiry: Date | null = null;

/**
 * 檢查當前是否在 API 服務時間內（台灣時間 0-6 時）
 */
export function isServiceAvailable(): boolean {
  const now = new Date();
  // 轉換為台灣時間 (UTC+8)
  const taiwanHour = (now.getUTCHours() + 8) % 24;
  return taiwanHour >= 0 && taiwanHour < 6;
}

/**
 * 取得服務狀態訊息
 */
export function getServiceStatus(): { available: boolean; message: string; nextAvailable?: string } {
  const available = isServiceAvailable();
  if (available) {
    return {
      available: true,
      message: '司法院 API 服務中'
    };
  }
  
  // 計算下次服務時間
  const now = new Date();
  const taiwanHour = (now.getUTCHours() + 8) % 24;
  
  let hoursUntilService: number;
  if (taiwanHour >= 6) {
    // 今天已過服務時間，等到明天 0 時
    hoursUntilService = 24 - taiwanHour;
  } else {
    // 還沒到服務時間（這不應該發生，因為 0-6 時應該是 available）
    hoursUntilService = 0;
  }
  
  return {
    available: false,
    message: `司法院 API 僅於每日凌晨 0-6 時提供服務`,
    nextAvailable: `約 ${hoursUntilService} 小時後`
  };
}

/**
 * 驗證並取得 Token
 */
export async function authenticate(): Promise<string> {
  // 檢查快取的 Token 是否仍有效（Token 有效期 6 小時）
  if (cachedToken && tokenExpiry && new Date() < tokenExpiry) {
    return cachedToken as string;
  }

  const user = process.env.JUDICIAL_API_USER;
  const password = process.env.JUDICIAL_API_PASSWORD;

  if (!user || !password) {
    throw new Error('司法院 API 帳號密碼未設定');
  }

  try {
    const response = await axios.post(`${BASE_URL}/Auth`, {
      user,
      password
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    if (response.data.error) {
      throw new Error(response.data.error);
    }

    if (!response.data.Token) {
      throw new Error('驗證失敗：未收到 Token');
    }

    cachedToken = response.data.Token;
    // Token 有效期 6 小時，我們設定 5.5 小時後過期以保留緩衝
    tokenExpiry = new Date(Date.now() + 5.5 * 60 * 60 * 1000);

    return cachedToken as string;
  } catch (error: any) {
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw error;
  }
}

/**
 * 裁判書異動清單項目
 */
export interface JudgmentListItem {
  date: string;
  list: string[];
}

/**
 * 取得裁判書異動清單（過去 7 天）
 */
export async function getJudgmentList(): Promise<JudgmentListItem[]> {
  const token = await authenticate();

  try {
    const response = await axios.post(`${BASE_URL}/JList`, {
      token
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    if (response.data.error) {
      throw new Error(response.data.error);
    }

    return response.data;
  } catch (error: any) {
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw error;
  }
}

/**
 * 裁判書附件
 */
export interface JudgmentAttachment {
  TITLE: string;
  URL: string;
}

/**
 * 裁判書全文
 */
export interface JudgmentFullText {
  JFULLTYPE: 'text' | 'file';
  JFULLCONTENT: string;
  JFULLPDF: string;
}

/**
 * 裁判書內容
 */
export interface JudgmentDocument {
  ATTACHMENTS: JudgmentAttachment[];
  JFULLX: JudgmentFullText;
  JID: string;
  JYEAR: string;
  JCASE: string;
  JNO: string;
  JDATE: string;
  JTITLE: string;
}

/**
 * 取得裁判書內容
 * @param jid 裁判書 ID，格式如 "CHDM,105,交訴,51,20161216,1"
 */
export async function getJudgmentDocument(jid: string): Promise<JudgmentDocument> {
  const token = await authenticate();

  try {
    const response = await axios.post(`${BASE_URL}/JDoc`, {
      token,
      j: jid
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 60000
    });

    if (response.data.error) {
      throw new Error(response.data.error);
    }

    return response.data;
  } catch (error: any) {
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    }
    throw error;
  }
}

/**
 * 解析裁判書 ID
 * 格式: "法院別,年度,字別,號次,裁判日期,檢查單號"
 */
export function parseJudgmentId(jid: string): {
  court: string;
  year: string;
  caseType: string;
  caseNo: string;
  date: string;
  checkNo: string;
} | null {
  const parts = jid.split(',');
  if (parts.length !== 6) return null;

  return {
    court: parts[0],
    year: parts[1],
    caseType: parts[2],
    caseNo: parts[3],
    date: parts[4],
    checkNo: parts[5]
  };
}

/**
 * 判斷裁判書是否為兒少相關案件
 * 根據案由關鍵字判斷
 */
export function isChildRelatedCase(jtitle: string, content: string): boolean {
  const keywords = [
    // 性侵害相關
    '性侵', '強制性交', '猥褻', '性騷擾', '妨害性自主',
    // 兒虐相關
    '虐待', '傷害', '遺棄', '凌虐',
    // 兒少保護相關
    '兒童', '少年', '未成年', '幼童', '幼年',
    // 特定法規
    '兒童及少年福利', '兒少權法', '性侵害犯罪防治'
  ];

  const searchText = (jtitle + ' ' + content).toLowerCase();
  return keywords.some(keyword => searchText.includes(keyword));
}

/**
 * 從裁判書內容中提取被告姓名
 * 注意：裁判書中的姓名通常會被遮罩
 */
export function extractDefendantNames(content: string): string[] {
  const names: string[] = [];
  
  // 常見的被告標記模式
  const patterns = [
    /被\s*告\s+([^\s\n]+)/g,
    /被告人\s+([^\s\n]+)/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1].trim();
      // 過濾掉明顯不是姓名的結果
      if (name.length >= 2 && name.length <= 5 && !names.includes(name)) {
        names.push(name);
      }
    }
  }

  return names;
}

/**
 * 遮罩姓名中間字
 */
export function maskName(name: string): string {
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + '○';
  
  const chars = name.split('');
  for (let i = 1; i < chars.length - 1; i++) {
    chars[i] = '○';
  }
  return chars.join('');
}

/**
 * 提取風險標籤
 */
export function extractRiskTags(jtitle: string, content: string): string[] {
  const tags: string[] = [];
  const text = (jtitle + ' ' + content).toLowerCase();
  
  const tagPatterns = [
    { keywords: ['性侵', '強制性交', '妨害性自主'], tag: '性侵害' },
    { keywords: ['猥褻', '強制猥褻'], tag: '猥褻' },
    { keywords: ['性騷擾'], tag: '性騷擾' },
    { keywords: ['偷拍', '竊錄', '妨害秘密'], tag: '偷拍' },
    { keywords: ['虐待', '凌虐', '傷害'], tag: '兒童虐待' },
    { keywords: ['遺棄'], tag: '遺棄' },
    { keywords: ['情緒虐待', '精神虐待'], tag: '情緒虐待' },
  ];
  
  for (const { keywords, tag } of tagPatterns) {
    if (keywords.some(kw => text.includes(kw))) {
      tags.push(tag);
    }
  }
  
  return tags;
}

/**
 * 同步司法院資料到本地資料庫
 * 這個函數應該由排程任務呼叫（每日凌晨 0-6 時）
 */
export async function syncJudicialData(
  saveToDb: (data: {
    name: string;
    role: string;
    riskTags: string[];
    location: string;
    date: string;
    description: string;
    sourceType: string;
    sourceLink: string;
    verified: boolean;
    jid: string;
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

  // 檢查服務時間
  if (!isServiceAvailable()) {
    const status = getServiceStatus();
    return {
      ...result,
      error: status.message + (status.nextAvailable ? `，${status.nextAvailable}` : '')
    };
  }

  try {
    // 取得異動清單
    onProgress?.(0, 0, '取得裁判書異動清單...');
    const list = await getJudgmentList();
    
    let totalItems = 0;
    for (const day of list) {
      totalItems += day.list.length;
    }

    let processed = 0;

    for (const day of list) {
      for (const jid of day.list) {
        try {
          processed++;
          onProgress?.(processed, totalItems, `處理 ${jid}`);

          const doc = await getJudgmentDocument(jid);
          result.synced++;

          // 檢查是否為兒少相關案件
          const content = doc.JFULLX?.JFULLCONTENT || '';
          if (isChildRelatedCase(doc.JTITLE, content)) {
            result.childRelated++;
            
            // 提取資訊並儲存
            const names = extractDefendantNames(content);
            const riskTags = extractRiskTags(doc.JTITLE, content);
            
            for (const name of names) {
              await saveToDb({
                name: maskName(name),
                role: '其他',
                riskTags,
                location: '', // 需要進一步解析
                date: doc.JDATE,
                description: doc.JTITLE,
                sourceType: '政府公告',
                sourceLink: `https://judgment.judicial.gov.tw/FJUD/data.aspx?jid=${encodeURIComponent(jid)}`,
                verified: true,
                jid
              });
            }
          }

          // 避免請求過於頻繁
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          result.errors++;
          console.error(`處理 ${jid} 時發生錯誤:`, error);
        }
      }
    }

    result.success = true;
  } catch (error: any) {
    result.error = error.message || '同步失敗';
    console.error('同步司法院資料時發生錯誤:', error);
  }

  return result;
}
