// src/server/db.ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
// 🔥 這裡現在可以正確匯入 users 了
import { cases, searchLogs, reports, users, dataSyncLogs } from './schema'; 
import { sql, eq, desc, like, or, and } from 'drizzle-orm';

// 初始化資料庫
const sqlite = new Database('sqlite.db');
export const db = drizzle(sqlite);

// ==========================================
// 🔥 [關鍵修復] Auth 相關函式 (補齊所有缺失)
// ==========================================

// 1. 新增或更新使用者 (Google Login 用)
export async function upsertUser(userData: { email: string; name?: string; picture?: string; googleId?: string }) {
    try {
        const existingUser = await db.select().from(users).where(eq(users.email, userData.email)).get();
        
        if (existingUser) {
            return await db.update(users)
                .set({
                    name: userData.name,
                    picture: userData.picture,
                    googleId: userData.googleId, // 更新 Google ID
                    updatedAt: new Date()
                })
                .where(eq(users.email, userData.email))
                .returning()
                .get();
        } else {
            return await db.insert(users)
                .values({
                    email: userData.email,
                    name: userData.name || 'User',
                    picture: userData.picture,
                    googleId: userData.googleId,
                    role: 'user',
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

// 2. 透過 Email 找人
export async function getUserByEmail(email: string) {
    try {
        return await db.select().from(users).where(eq(users.email, email)).get();
    } catch (e) { return null; }
}

// 3. 🔥 [修復警告] 透過 OpenID (Google ID) 找人
// SDK 會呼叫這個函式，如果沒有就會報錯
export async function getUserByOpenId(openId: string) {
    try {
        // 這裡假設 openId 就是 googleId，或者是 email (視您的 Auth 實作而定)
        // 為了保險，我們先用 googleId 找，找不到再嘗試用 email 找 (如果 openId 格式像 email)
        let user = await db.select().from(users).where(eq(users.googleId, openId)).get();
        
        if (!user && openId.includes('@')) {
             user = await db.select().from(users).where(eq(users.email, openId)).get();
        }
        return user;
    } catch (e) { return null; }
}

// ==========================================
// 🔍 搜尋相關函式
// ==========================================

export async function searchCases({ name, area, district, violationType, limit, offset }: any) {
    const conditions = [];

    if (name) {
        conditions.push(or(
            like(cases.name, `%${name}%`),
            like(cases.maskedName, `%${name}%`),
            like(cases.originalName, `%${name}%`)
        ));
    }
    if (area && area !== '全部地區') conditions.push(like(cases.location, `%${area}%`));
    if (district) conditions.push(like(cases.location, `%${district}%`));
    if (violationType) conditions.push(like(cases.riskTags, `%${violationType}%`));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db.select()
        .from(cases)
        .where(whereClause)
        .limit(limit || 15)
        .offset(offset || 0)
        .orderBy(desc(cases.caseDate));

    return { results };
}

export function calculateSimilarity(s1: string, s2: string) {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    if (longer.includes(shorter)) return 100;
    return 0;
}

export async function logSearch(data: { searchedName: string; searchedArea?: string; foundResults: boolean; resultCount: number }) {
    try {
        await db.insert(searchLogs).values({
            ...data,
            searchedAt: new Date(),
            userIp: 'unknown'
        });
    } catch (e) {}
}

export async function getSearchStats() {
    return { totalSearches: 0, hotKeywords: [] };
}

export async function getCaseCount() {
    try {
        const res = await db.select({ count: sql<number>`count(*)` }).from(cases);
        return res[0].count;
    } catch(e) { return 0; }
}

// 其他佔位函式
export async function getAllCases() { return []; }
export async function getCaseCountByLocation() { return []; }
export async function insertReport(data: any) { 
    return await db.insert(reports).values({ ...data, createdAt: new Date() });
}
export async function getPendingReports() { 
    return await db.select().from(reports).where(eq(reports.status, 'pending')); 
}