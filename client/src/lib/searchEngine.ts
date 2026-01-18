/**
 * 兒少守護小蜂 - 搜尋引擎
 * Search Engine for Child Guardian Bee
 * 
 * 功能：
 * 1. 透過後端 API 進行模糊姓名比對
 * 2. 地區篩選
 * 3. 相似度計算與警示
 * 4. 支援離線模式（使用本地模擬資料）
 */

import mockData from '@/data/mockDatabase.json';

export interface CaseRecord {
  id: number;
  maskedName: string;
  name?: string; // 相容舊格式
  originalName?: string;
  role: string;
  riskTags: string[];
  location: string;
  district?: string;
  city?: string;
  caseDate?: string;
  date?: string;
  sourceType: string;
  sourceLink?: string;
  description?: string;
  verified: boolean;
  coordinates?: { lat: number; lng: number };
}

export interface SearchParams {
  name: string;
  area?: string;
  ageRange?: string;
}

export interface SearchResult {
  case: CaseRecord;
  similarity: number;
  matchType: 'exact' | 'high' | 'medium' | 'low';
}

export interface SearchResponse {
  found: boolean;
  results: SearchResult[];
  totalMatches: number;
  searchedName: string;
  disclaimer: string;
}

/**
 * 計算兩個字串的相似度（Levenshtein Distance）
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * 計算相似度百分比
 */
function calculateSimilarity(searchName: string, targetName: string): number {
  // 移除遮罩字符進行比對
  const cleanSearch = searchName.replace(/○/g, '');
  const cleanTarget = targetName.replace(/○/g, '');
  
  // 完全匹配
  if (cleanSearch === cleanTarget) return 100;
  
  // 檢查是否為遮罩版本的匹配
  const maskedTarget = targetName; // 已經是遮罩版本
  if (matchMaskedName(searchName, maskedTarget)) return 95;
  
  // 計算 Levenshtein 相似度
  const maxLen = Math.max(cleanSearch.length, cleanTarget.length);
  if (maxLen === 0) return 0;
  
  const distance = levenshteinDistance(cleanSearch, cleanTarget);
  const similarity = ((maxLen - distance) / maxLen) * 100;
  
  return Math.round(similarity);
}

/**
 * 檢查搜尋名稱是否與遮罩名稱匹配
 * 例如：「王小明」應該匹配「王○明」
 */
function matchMaskedName(searchName: string, maskedName: string): boolean {
  if (searchName.length !== maskedName.length) return false;
  
  for (let i = 0; i < searchName.length; i++) {
    if (maskedName[i] === '○') continue;
    if (searchName[i] !== maskedName[i]) return false;
  }
  
  return true;
}

/**
 * 檢查地區是否匹配
 */
function matchArea(caseRecord: CaseRecord, area: string): boolean {
  if (!area || area === '全部地區' || area === '') return true;
  
  const normalizedArea = area.trim();
  const location = caseRecord.location || '';
  const city = caseRecord.city || '';
  const district = caseRecord.district || '';
  
  return (
    city.includes(normalizedArea) ||
    district.includes(normalizedArea) ||
    location.includes(normalizedArea)
  );
}

/**
 * 取得匹配類型
 */
function getMatchType(similarity: number): 'exact' | 'high' | 'medium' | 'low' {
  if (similarity >= 95) return 'exact';
  if (similarity >= 80) return 'high';
  if (similarity >= 60) return 'medium';
  return 'low';
}

/**
 * 本地搜尋函數（使用模擬資料）
 * 當後端 API 不可用時使用
 */
export function searchCasesLocal(params: SearchParams): SearchResponse {
  const { name, area } = params;
  const cases = mockData.cases as CaseRecord[];
  
  if (!name || name.trim().length === 0) {
    return {
      found: false,
      results: [],
      totalMatches: 0,
      searchedName: '',
      disclaimer: '請輸入姓名進行查詢'
    };
  }

  const searchName = name.trim();
  const results: SearchResult[] = [];

  for (const caseRecord of cases) {
    // 檢查地區篩選
    if (!matchArea(caseRecord, area || '')) continue;

    // 計算與遮罩名稱的相似度
    const displayName = caseRecord.maskedName || caseRecord.name || '';
    const similarityWithMasked = calculateSimilarity(searchName, displayName);
    
    // 計算與原始名稱的相似度（如果搜尋者知道完整名稱）
    const originalName = caseRecord.originalName || '';
    const similarityWithOriginal = originalName ? calculateSimilarity(searchName, originalName) : 0;
    
    // 取較高的相似度
    const similarity = Math.max(similarityWithMasked, similarityWithOriginal);

    // 只顯示相似度 >= 50% 的結果
    if (similarity >= 50) {
      results.push({
        case: caseRecord,
        similarity,
        matchType: getMatchType(similarity)
      });
    }
  }

  // 按相似度排序
  results.sort((a, b) => b.similarity - a.similarity);

  const disclaimer = results.length > 0
    ? '本資料僅供參考，非絕對比對結果。如有疑慮，請進一步查證。'
    : '本資料庫查無異常紀錄（這不代表 100% 安全，請持續保持警覺）';

  return {
    found: results.length > 0,
    results: results.slice(0, 10), // 最多顯示 10 筆
    totalMatches: results.length,
    searchedName: searchName,
    disclaimer
  };
}

/**
 * 主搜尋函數
 * 優先使用後端 API，失敗時回退到本地搜尋
 */
export function searchCases(params: SearchParams): SearchResponse {
  // 目前使用本地搜尋，之後會改用 tRPC
  return searchCasesLocal(params);
}

/**
 * 取得所有可用的地區選項
 */
export function getAreaOptions(): string[] {
  const cases = mockData.cases as CaseRecord[];
  const cities = new Set<string>();
  
  cases.forEach(c => {
    const city = c.city || c.location || '';
    if (city) cities.add(city);
  });
  
  return ['全部地區', ...Array.from(cities).sort()];
}

/**
 * 取得風險標籤的顏色類型
 */
export function getRiskTagColor(tag: string): string {
  const colors = mockData.riskTagColors as Record<string, string>;
  return colors[tag] || 'default';
}

/**
 * 取得所有案例（用於地圖顯示）
 */
export function getAllCases(): CaseRecord[] {
  return mockData.cases as CaseRecord[];
}

/**
 * 取得查核次數（模擬）
 */
export function getQueryCount(name: string): number {
  // 模擬查核次數，實際應從後端取得
  return Math.floor(Math.random() * 50) + 1;
}
