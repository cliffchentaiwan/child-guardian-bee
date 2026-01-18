import { eq, like, desc, or, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, cases, reports, searchLogs, dataSyncLogs, InsertCase, InsertReport, InsertSearchLog, InsertDataSyncLog } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============================================
// 案例資料相關查詢
// ============================================

/**
 * 模糊搜尋案例
 * 支援姓名模糊比對和地區篩選
 * 姓名可以為空，只選地區也能搜尋
 */
export async function searchCases(params: {
  name?: string;
  area?: string;
  district?: string;
  violationType?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot search cases: database not available");
    return { results: [], total: 0 };
  }

  const { name, area, district, violationType, limit = 15, offset = 0 } = params;
  
  // 建立查詢條件
  const conditions: ReturnType<typeof eq>[] = [];
  
  // 地區篩選
  if (area && area !== '全部地區') {
    conditions.push(eq(cases.location, area));
  }
  
  // 區域篩選（如果有的話）
  if (district && district !== '全部') {
    conditions.push(like(cases.description, `%${district}%`));
  }
  
  // 違法類型篩選
  if (violationType && violationType !== '全部') {
    conditions.push(like(cases.riskTags, `%${violationType}%`));
  }
  
  // 姓名搜尋（如果有提供）
  if (name && name.trim()) {
    const nameVariants = generateNameVariants(name);
    const nameConditions = nameVariants.map(variant => 
      like(cases.maskedName, `%${variant}%`)
    );
    
    // 如果有其他條件，結合姓名條件
    if (conditions.length > 0) {
      const result = await db.select().from(cases)
        .where(and(...conditions, or(...nameConditions)))
        .orderBy(desc(cases.createdAt))
        .limit(limit)
        .offset(offset);
      
      // 取得總數
      const countResult = await db.select({ count: sql<number>`count(*)` }).from(cases)
        .where(and(...conditions, or(...nameConditions)));
      const total = countResult[0]?.count || 0;
      
      return { results: result, total };
    } else {
      const result = await db.select().from(cases)
        .where(or(...nameConditions))
        .orderBy(desc(cases.createdAt))
        .limit(limit)
        .offset(offset);
      
      const countResult = await db.select({ count: sql<number>`count(*)` }).from(cases)
        .where(or(...nameConditions));
      const total = countResult[0]?.count || 0;
      
      return { results: result, total };
    }
  }
  
  // 只有地區/類型條件，沒有姓名
  if (conditions.length > 0) {
    const result = await db.select().from(cases)
      .where(and(...conditions))
      .orderBy(desc(cases.createdAt))
      .limit(limit)
      .offset(offset);
    
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(cases)
      .where(and(...conditions));
    const total = countResult[0]?.count || 0;
    
    return { results: result, total };
  }
  
  // 沒有任何條件，返回最新資料
  const result = await db.select().from(cases)
    .orderBy(desc(cases.createdAt))
    .limit(limit)
    .offset(offset);
  
  const countResult = await db.select({ count: sql<number>`count(*)` }).from(cases);
  const total = countResult[0]?.count || 0;
  
  return { results: result, total };
}

/**
 * 生成姓名的模糊比對變體
 * 例如：「王小明」-> [「王小明」, 「王○明」, 「王*明」]
 */
function generateNameVariants(name: string): string[] {
  const variants: string[] = [name];
  
  if (name.length >= 2) {
    // 遮罩中間字
    const chars = name.split('');
    for (let i = 1; i < chars.length - 1; i++) {
      const masked = [...chars];
      masked[i] = '○';
      variants.push(masked.join(''));
    }
    
    // 只保留姓氏
    variants.push(chars[0]);
    
    // 姓氏 + 最後一個字
    if (chars.length >= 3) {
      variants.push(chars[0] + chars[chars.length - 1]);
    }
  }
  
  return variants;
}

/**
 * 計算姓名相似度
 */
export function calculateSimilarity(name1: string, name2: string): number {
  // 移除遮罩字符進行比對
  const clean1 = name1.replace(/[○●*]/g, '');
  const clean2 = name2.replace(/[○●*]/g, '');
  
  if (clean1 === clean2) return 100;
  
  // 檢查姓氏是否相同
  const sameSurname = clean1[0] === clean2[0];
  
  // 檢查最後一個字是否相同
  const sameLastChar = clean1[clean1.length - 1] === clean2[clean2.length - 1];
  
  // 計算相似度
  let similarity = 0;
  if (sameSurname) similarity += 40;
  if (sameLastChar) similarity += 30;
  
  // 長度相同加分
  if (clean1.length === clean2.length) similarity += 20;
  
  // 共同字符加分
  const commonChars = clean1.split('').filter(c => clean2.includes(c)).length;
  similarity += (commonChars / Math.max(clean1.length, clean2.length)) * 10;
  
  return Math.min(Math.round(similarity), 99);
}

/**
 * 取得所有案例（用於地圖顯示）
 */
export async function getAllCases() {
  const db = await getDb();
  if (!db) {
    return [];
  }
  
  return await db.select().from(cases).orderBy(desc(cases.createdAt));
}

/**
 * 依地區取得案例
 */
export async function getCasesByLocation(location: string) {
  const db = await getDb();
  if (!db) {
    return [];
  }
  
  return await db.select().from(cases)
    .where(eq(cases.location, location))
    .orderBy(desc(cases.createdAt));
}

/**
 * 新增案例
 */
export async function insertCase(caseData: InsertCase) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  
  await db.insert(cases).values(caseData);
}

/**
 * 批量新增案例
 */
export async function insertCases(casesData: InsertCase[]) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  
  if (casesData.length === 0) return;
  
  await db.insert(cases).values(casesData);
}

// ============================================
// 通報相關查詢
// ============================================

/**
 * 新增通報
 */
export async function insertReport(report: InsertReport) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  
  await db.insert(reports).values(report);
}

/**
 * 取得待審核通報
 */
export async function getPendingReports() {
  const db = await getDb();
  if (!db) {
    return [];
  }
  
  return await db.select().from(reports)
    .where(eq(reports.status, 'pending'))
    .orderBy(desc(reports.createdAt));
}

/**
 * 取得所有通報
 */
export async function getAllReports() {
  const db = await getDb();
  if (!db) {
    return [];
  }
  
  return await db.select().from(reports)
    .orderBy(desc(reports.createdAt));
}

/**
 * 更新通報狀態
 */
export async function updateReportStatus(id: number, status: 'pending' | 'reviewing' | 'approved' | 'rejected', reviewNote?: string) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }
  
  await db.update(reports)
    .set({ status, reviewNote })
    .where(eq(reports.id, id));
}

// ============================================
// 搜尋記錄相關
// ============================================

/**
 * 記錄搜尋
 */
export async function logSearch(log: InsertSearchLog) {
  const db = await getDb();
  if (!db) {
    return;
  }
  
  await db.insert(searchLogs).values(log);
}

/**
 * 取得搜尋統計
 */
export async function getSearchStats() {
  const db = await getDb();
  if (!db) {
    return { totalSearches: 0, foundResults: 0 };
  }
  
  const result = await db.select({
    totalSearches: sql<number>`COUNT(*)`,
    foundResults: sql<number>`SUM(CASE WHEN foundResults = 1 THEN 1 ELSE 0 END)`,
  }).from(searchLogs);
  
  return result[0] || { totalSearches: 0, foundResults: 0 };
}

// ============================================
// 資料同步記錄相關
// ============================================

/**
 * 記錄資料同步開始
 */
export async function startDataSync(sourceName: string): Promise<number | null> {
  const db = await getDb();
  if (!db) {
    return null;
  }
  
  const result = await db.insert(dataSyncLogs).values({
    sourceName,
    status: 'running',
    startedAt: new Date(),
  });
  
  return result[0].insertId;
}

/**
 * 更新資料同步狀態
 */
export async function updateDataSync(id: number, status: 'success' | 'failed', recordCount?: number, errorMessage?: string) {
  const db = await getDb();
  if (!db) {
    return;
  }
  
  await db.update(dataSyncLogs)
    .set({
      status,
      recordCount,
      errorMessage,
      completedAt: new Date(),
    })
    .where(eq(dataSyncLogs.id, id));
}

/**
 * 取得最近的同步記錄
 */
export async function getRecentSyncLogs(limit = 10) {
  const db = await getDb();
  if (!db) {
    return [];
  }
  
  return await db.select().from(dataSyncLogs)
    .orderBy(desc(dataSyncLogs.startedAt))
    .limit(limit);
}

// ============================================
// 地區統計
// ============================================

/**
 * 取得各地區案例統計
 */
export async function getCaseCountByLocation() {
  const db = await getDb();
  if (!db) {
    return [];
  }
  
  const result = await db.select({
    location: cases.location,
    count: sql<number>`COUNT(*)`,
  })
    .from(cases)
    .groupBy(cases.location)
    .orderBy(desc(sql`COUNT(*)`));
  
  return result;
}

/**
 * 取得所有可用地區
 */
export async function getAvailableLocations() {
  const db = await getDb();
  if (!db) {
    return [];
  }
  
  const result = await db.selectDistinct({ location: cases.location }).from(cases);
  // 過濾掉空值和 null，避免 Select.Item 空值錯誤
  return result.map(r => r.location).filter(loc => loc && loc.trim() !== '');
}

/**
 * 新增同步記錄（簡化版本）
 */
export async function insertSyncLog(log: {
  source: string;
  status: 'success' | 'failed';
  recordsAdded: number;
  errorMessage?: string;
}) {
  const db = await getDb();
  if (!db) {
    return;
  }
  
  await db.insert(dataSyncLogs).values({
    sourceName: log.source,
    status: log.status,
    recordCount: log.recordsAdded,
    errorMessage: log.errorMessage,
    startedAt: new Date(),
    completedAt: new Date(),
  });
}

/**
 * 取得最後一次成功同步的記錄
 */
export async function getLastSuccessfulSync() {
  const db = await getDb();
  if (!db) {
    return null;
  }
  
  const result = await db.select()
    .from(dataSyncLogs)
    .where(eq(dataSyncLogs.status, 'success'))
    .orderBy(desc(dataSyncLogs.completedAt))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

/**
 * 取得案例總數
 */
export async function getCaseCount() {
  const db = await getDb();
  if (!db) {
    return 0;
  }
  
  const result = await db.select({
    count: sql<number>`COUNT(*)`,
  }).from(cases);
  
  return result[0]?.count || 0;
}

/**
 * 依姓名、日期和地區查找案例（用於去重）
 */
export async function findCaseByNameAndDate(name: string, date: string, location: string) {
  const db = await getDb();
  if (!db) {
    return null;
  }
  
  const result = await db.select()
    .from(cases)
    .where(and(
      eq(cases.maskedName, name),
      eq(cases.caseDate, date),
      eq(cases.location, location)
    ))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}
