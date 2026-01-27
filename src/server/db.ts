// src/server/db.ts
// 🔥 移除 SQLite 相關引用
// import { drizzle } from 'drizzle-orm/better-sqlite3';
// import Database from 'better-sqlite3';

// ✅ 改用 Postgres (pg)
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { cases, searchLogs, reports, users, dataSyncLogs } from './schema'; 
import { sql, eq, desc, like, or, and } from 'drizzle-orm';
import 'dotenv/config'; // 確保能讀取環境變數

// 檢查是否有設定資料庫連線字串
if (!process.env.DATABASE_URL) {
    throw new Error('❌ 錯誤: 找不到 DATABASE_URL 環境變數！請在 Render 或 .env 設定。');
}

// 建立連線池 (Connection Pool) - 這是連線雲端資料庫的標準做法
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: true, // Neon 需要 SSL 連線
});

// 初始化 Drizzle
export const db = drizzle(pool);

// ==========================================
// ⬇️ 以下邏輯完全不用動！Drizzle 會自動幫我們轉換語法 ⬇️
// ==========================================

// 1. 新增或更新使用者
export async function upsertUser(userData: { email: string; name?: string; picture?: string; googleId?: string }) {
    try {
        // .get() 在 Postgres 模式下通常要改用 .limit(1) 後取陣列第一項，
        // 但 drizzle-orm 新版有支援類似寫法。為了保險，我們用標準陣列解構寫法：
        const [existingUser] = await db.select().from(users).where(eq(users.email, userData.email)).limit(1);
        
        if (existingUser) {
            const [updated] = await db.update(users)
                .set({
                    name: userData.name,
                    picture: userData.picture,
                    googleId: userData.googleId,
                    updatedAt: new Date()
                })
                .where(eq(users.email, userData.email))
                .returning();
            return updated;
        } else {
            const [newUser] = await db.insert(users)
                .values({
                    email: userData.email,
                    name: userData.name || 'User',
                    picture: userData.picture,
                    googleId: userData.googleId,
                    role: 'user',
                    createdAt: new Date(),
                    updatedAt: new Date()
                })
                .returning();
            return newUser;
        }
    } catch (e) {
        console.error("❌ upsertUser 失敗:", e);
        return null;
    }
}

// 2. 透過 Email 找人
export async function getUserByEmail(email: string) {
    try {
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        return user;
    } catch (e) { return null; }
}

// 3. 透過 OpenID 找人
export async function getUserByOpenId(openId: string) {
    try {
        let [user] = await db.select().from(users).where(eq(users.googleId, openId)).limit(1);
        
        if (!user && openId.includes('@')) {
             [user] = await db.select().from(users).where(eq(users.email, openId)).limit(1);
        }
        return user;
    } catch (e) { return null; }
}

// 🔍 搜尋相關函式
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
        // Postgres 的 count 回傳型別可能會是 string，轉一下比較安全
        const res = await db.select({ count: sql<number>`count(*)` }).from(cases);
        return Number(res[0].count);
    } catch(e) { return 0; }
}

export async function getAllCases() { return []; }
export async function getCaseCountByLocation() { return []; }
export async function insertReport(data: any) { 
    return await db.insert(reports).values({ ...data, createdAt: new Date() });
}
export async function getPendingReports() { 
    return await db.select().from(reports).where(eq(reports.status, 'pending')); 
}