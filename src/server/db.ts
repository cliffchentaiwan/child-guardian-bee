// src/server/db.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg'; // 建議使用 default import 避免部分環境相容性問題
import * as schema from './schema'; 
import { cases, searchLogs, reports, users, dataSyncLogs } from './schema'; 
import { sql, eq, desc, like, or, and } from 'drizzle-orm';
import 'dotenv/config'; 

const connectionString = process.env.DATABASE_URL;

// 1. 檢查是否有設定資料庫連線字串
if (!connectionString) {
    console.warn("⚠️ 警告：未偵測到 DATABASE_URL 環境變數，Render 上線時請務必設定！");
}

// 2. 建立連線池 (Connection Pool)
const pool = new pg.Pool({
    connectionString: connectionString,
    // 🔥 關鍵修正：Render 連 Neon 必須這樣設定 SSL，否則會發生 Handshake 錯誤或連線被拒
    ssl: {
        rejectUnauthorized: false, // 允許連線 (忽略嚴格的憑證鍊檢查)
    },
    max: 20, // 連線池上限
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

// 監聽連線錯誤 (避免連線斷掉時讓整個 Server 當機)
pool.on('error', (err) => {
    console.error('❌ 資料庫連線池發生意外錯誤:', err);
});

// 3. 初始化 Drizzle
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

// 🔍 搜尋相關 (保留以免影響舊 API)
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