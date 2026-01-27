// src/server/db.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg'; // 🔥 改用解構匯入，比較穩定
import * as schema from './schema'; // 🔥 匯入所有 schema
import { cases, searchLogs, reports, users, dataSyncLogs } from './schema'; 
import { sql, eq, desc, like, or, and } from 'drizzle-orm';
import 'dotenv/config'; 

// 檢查是否有設定資料庫連線字串
if (!process.env.DATABASE_URL) {
    console.warn("⚠️ 警告：未偵測到 DATABASE_URL 環境變數，Render 上線時請務必設定！");
}

// 建立連線池 (Connection Pool)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // 🔥 關鍵：Neon 在雲端環境 (Render) 必須強制開啟 SSL
    ssl: true, 
    max: 20, // 連線池上限
});

// 初始化 Drizzle
// 🔥 關鍵修正：把 schema 傳進去，這樣 db.query 語法才能用
export const db = drizzle(pool, { schema });

// ==========================================
// ⬇️ 以下輔助函式保留 (供 Auth 或其他舊邏輯使用) ⬇️
// ==========================================

// 1. 新增或更新使用者 (Auth 用)
export async function upsertUser(userData: { email: string; name?: string; picture?: string; googleId?: string }) {
    try {
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

// 🔍 搜尋相關 (雖然 routers.ts 已經重寫了，保留這些以免舊 API 壞掉)
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
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const results = await db.select()
        .from(cases)
        .where(whereClause)
        .limit(limit || 15)
        .offset(offset || 0)
        .orderBy(desc(cases.caseDate));

    return { results };
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

export async function getCaseCount() {
    try {
        const res = await db.select({ count: sql<number>`count(*)` }).from(cases);
        return Number(res[0].count);
    } catch(e) { return 0; }
}

export async function insertReport(data: any) { 
    return await db.insert(reports).values({ ...data, createdAt: new Date() });
}

export async function getPendingReports() { 
    return await db.select().from(reports).where(eq(reports.status, 'pending')); 
}