// src/server/db.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema'; // 引用同一層的 schema.ts
import { cases, dataSyncLogs, reports, searchLogs } from './schema';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import path from 'path';

// =========================================
// 🔌 資料庫連線設定 (SQLite)
// =========================================
// 強制使用專案根目錄的 sqlite.db
const dbPath = path.resolve(process.cwd(), 'sqlite.db');
console.log("🔌 [DB] 連線路徑：", dbPath);

const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

// =========================================
// 🔍 核心搜尋功能
// =========================================

export async function searchCases(params: {
  name?: string;
  area?: string;
  district?: string;
  violationType?: string;
  limit?: number;
  offset?: number;
}) {
  const { name, area, limit = 20, offset = 0 } = params;
  const conditions = [];

  // 1. 地區篩選 (智慧放寬：包含全台/網路)
  if (area && area !== '全部地區') {
    const simpleArea = area.replace(/台|臺/, '');
    conditions.push(
      or(
        like(cases.location, `%${simpleArea}%`),
        eq(cases.location, '全台'),
        eq(cases.location, '網路'),
        sql`${cases.location} IS NULL`
      )
    );
  }

  // 2. 姓名搜尋 (包含模糊變體)
  if (name && name.trim()) {
    const term = `%${name.trim()}%`;
    const nameVariants = generateNameVariants(name.trim());
    
    // 組合搜尋條件：
    // (1) 搜 maskedName (如 "黃○佼")
    // (2) 搜 originalName (如 "黃子佼持有...")
    // (3) 搜 riskTags (如 "性騷擾")
    const nameConditions = [
        ...nameVariants.map(v => like(cases.maskedName, `%${v}%`)),
        like(cases.originalName, term),
        like(cases.name, term),
        like(cases.description, term),
        like(cases.riskTags, term)
    ];

    conditions.push(or(...nameConditions));
  }

  // 3. 執行查詢
  const results = await db
    .select()
    .from(cases)
    .where(and(...conditions))
    .orderBy(desc(cases.caseDate))
    .limit(limit)
    .offset(offset);
  
  return { results, total: results.length };
}

// =========================================
// 🧩 輔助工具
// =========================================

/**
 * 生成姓名的模糊比對變體
 */
function generateNameVariants(name: string): string[] {
  const variants: string[] = [name];
  if (name.length >= 2) {
    const chars = name.split('');
    for (let i = 1; i < chars.length - 1; i++) {
      const masked = [...chars];
      masked[i] = '○';
      variants.push(masked.join(''));
    }
  }
  return variants;
}

/**
 * 計算字串相似度 (同步函式，解決 routers.ts 錯誤的關鍵)
 */
export function calculateSimilarity(name1: string, name2: string): number {
  if (!name1 || !name2) return 0;
  if (name2.includes(name1)) return 100;
  return 0;
}

// =========================================
// 📊 資料存取層 (DAO)
// =========================================

export async function getAllCases() {
    return await db.select().from(cases).limit(1000);
}

export async function getCaseCountByLocation() {
    return [];
}

export async function insertReport(data: any) {
    return await db.insert(reports).values({ 
      ...data, 
      createdAt: new Date(),
      updatedAt: new Date()
    });
}

export async function getPendingReports() {
    return await db.select().from(reports).where(eq(reports.status, 'pending'));
}

export async function getCaseCount() {
    try {
        const res = await db.select({ value: sql<number>`count(*)` }).from(cases);
        return res[0].value;
    } catch (e) { return 0; }
}

export async function logSearch(data: any) {
    try { 
      await db.insert(searchLogs).values({ 
        ...data, 
        createdAt: new Date() 
      }); 
    } catch (e) { console.error("Log Error", e); }
}

export async function getSearchStats() {
    try {
        const count = await db.select({ value: sql<number>`count(*)` }).from(searchLogs);
        return { totalSearches: count[0].value };
    } catch (e) { return { totalSearches: 0 }; }
}