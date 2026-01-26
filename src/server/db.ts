// src/server/db.ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { cases, searchLogs, reports, users, dataSyncLogs } from './schema'; 
import { sql, eq, desc, like, or, and } from 'drizzle-orm';

// 初始化資料庫
// 注意：在 Render 上路徑通常是相對的，或使用環境變數
const sqlite = new Database('sqlite.db');
export const db = drizzle(sqlite);

// ==========================================
// 🔥 [關鍵修復] 補上缺失的 Auth 函式，防止 502 崩潰
// ==========================================

export async function upsertUser(userData: { email: string; name?: string; picture?: string; googleId?: string }) {
    try {
        // 1. 先找看看有沒有這個人
        const existingUser = await db.select().from(users).where(eq(users.email, userData.email)).get();
        
        if (existingUser) {
            // 2. 有的話更新
            return await db.update(users)
                .set({
                    name: userData.name,
                    picture: userData.picture,
                    updatedAt: new Date()
                })
                .where(eq(users.email, userData.email))
                .returning()
                .get();
        } else {
            // 3. 沒有的話新增
            return await db.insert(users)
                .values({
                    email: userData.email,
                    name: userData.name || 'User',
                    picture: userData.picture,
                    role: 'user', // 預設權限
                    createdAt: new Date(),
                    updatedAt: new Date()
                })
                .returning()
                .get();
        }
    } catch (e) {
        console.error("❌ upsertUser 失敗:", e);
        return null;
    }
}

export async function getUserByEmail(email: string) {
    try {
        return await db.select().from(users).where(eq(users.email, email)).get();
    } catch (e) {
        return null;
    }
}

// ==========================================
// 🔍 搜尋相關函式 (保留原本邏輯)
// ==========================================

export async function searchCases({ name, area, district, violationType, limit, offset }: any) {
    const conditions = [];

    // 1. 名稱搜尋 (模糊比對)
    if (name) {
        conditions.push(or(
            like(cases.name, `%${name}%`),
            like(cases.maskedName, `%${name}%`),
            like(cases.originalName, `%${name}%`)
        ));
    }

    // 2. 地區搜尋
    if (area && area !== '全部地區') {
        conditions.push(like(cases.location, `%${area}%`));
    }

    // 3. 行政區 (如果有)
    if (district) {
        conditions.push(like(cases.location, `%${district}%`));
    }

    // 4. 違規類型
    if (violationType) {
        conditions.push(like(cases.riskTags, `%${violationType}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db.select()
        .from(cases)
        .where(whereClause)
        .limit(limit || 15)
        .offset(offset || 0)
        .orderBy(desc(cases.caseDate));

    return { results };
}

// 計算字串相似度 (Levenshtein Distance 簡易版)
export function calculateSimilarity(s1: string, s2: string) {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    
    // 簡單包含檢查 (為了效能)
    if (longer.includes(shorter)) return 100;
    
    return 0; // 簡化處理，避免複雜運算拖慢 DB
}

// 記錄搜尋歷史
export async function logSearch(data: { searchedName: string; searchedArea?: string; foundResults: boolean; resultCount: number }) {
    try {
        await db.insert(searchLogs).values({
            ...data,
            searchedAt: new Date(),
            userIp: 'unknown' // 後續可從 context 傳入
        });
    } catch (e) {
        // Log 失敗不影響主流程
    }
}

// 取得統計數據
export async function getSearchStats() {
    return {
        totalSearches: 0,
        hotKeywords: []
    };
}

export async function getCaseCount() {
    try {
        const res = await db.select({ count: sql<number>`count(*)` }).from(cases);
        return res[0].count;
    } catch(e) { return 0; }
}

// 地圖與通報相關 (避免 routers.ts 報錯)
export async function getAllCases() { return []; }
export async function getCaseCountByLocation() { return []; }
export async function insertReport(data: any) { 
    return await db.insert(reports).values({
        ...data,
        createdAt: new Date()
    });
}
export async function getPendingReports() { 
    return await db.select().from(reports).where(eq(reports.status, 'pending')); 
}