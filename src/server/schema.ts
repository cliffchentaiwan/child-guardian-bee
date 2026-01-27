// src/server/schema.ts
import { pgTable, serial, text, integer, timestamp, boolean, index } from 'drizzle-orm/pg-core';
import { type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

// ==========================================
// 1. 使用者表 (Users)
// ==========================================
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  picture: text('picture'),
  googleId: text('google_id').unique(),
  role: text('role').default('user'), // user | admin
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ==========================================
// 2. 案件資料表 (Cases) - 🔥 核心資料庫
// ==========================================
export const cases = pgTable('cases', {
  // 🔥 [關鍵修正] 使用 text 允許 "JUDICIAL_123" 或 "NEWS_456" 等文字型 ID
  id: text('id').primaryKey(), 
  
  name: text('name').notNull(),         // 案件標題 / 幼兒園名稱
  maskedName: text('masked_name'),      // 去識別化名稱 (如：陳O明)
  originalName: text('original_name'),  // 原始名稱 (供內部比對用)
  location: text('location'),           // 發生地點 / 縣市
  riskTags: text('risk_tags'),          // 風險標籤 (儲存成字串，如 "性騷擾,不當管教")
  riskLevel: text('risk_level'),        // high | medium | low
  source: text('source'),               // 司法判決 | 媒體報導 | 衛福部裁罰 | 教保網
  summary: text('summary'),             // 案件摘要 / 違規內容
  url: text('url'),                     // 原始連結
  caseDate: text('case_date'),          // 發生日期 (字串格式以容錯)
  crawledAt: timestamp('crawled_at').defaultNow(), // 爬取時間
}, (table) => {
  return {
    // 🚀 [效能優化] 建立索引，加速搜尋
    nameIdx: index('name_idx').on(table.name),
    locationIdx: index('location_idx').on(table.location),
    riskTagsIdx: index('risk_tags_idx').on(table.riskTags),
  };
});

// ==========================================
// 3. 通報資料表 (Reports)
// ==========================================
export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  reporterIp: text('reporter_ip'),
  suspectName: text('suspect_name').notNull(),
  location: text('location'),
  description: text('description').notNull(),
  status: text('status').default('pending'), // pending (待審) | reviewed (已閱) | dismissed (駁回)
  createdAt: timestamp('created_at').defaultNow(),
});

// ==========================================
// 4. 搜尋紀錄 (Search Logs) - 用於熱搜分析
// ==========================================
export const searchLogs = pgTable('search_logs', {
  id: serial('id').primaryKey(),
  userIp: text('user_ip'),
  searchedName: text('searched_name'),
  searchedArea: text('searched_area'),
  resultCount: integer('result_count'),
  foundResults: boolean('found_results'),
  searchedAt: timestamp('searched_at').defaultNow(),
}, (table) => {
  return {
    // 🚀 [效能優化] 針對時間建立索引，方便跑「最近熱搜」統計
    searchedAtIdx: index('searched_at_idx').on(table.searchedAt),
  };
});

// ==========================================
// 5. 資料同步紀錄 (Sync Logs) - 監控爬蟲狀態
// ==========================================
export const dataSyncLogs = pgTable('data_sync_logs', {
  id: serial('id').primaryKey(),
  status: text('status'), // success | failed
  message: text('message'),
  recordsAdded: integer('records_added'),
  syncType: text('sync_type'), // news | judicial | crc | kindergarten
  createdAt: timestamp('created_at').defaultNow(),
});

// ==========================================
// 🛠️ TypeScript 型別導出 (讓其他檔案使用)
// ==========================================
export type SelectUser = InferSelectModel<typeof users>;
export type InsertUser = InferInsertModel<typeof users>;

export type SelectCase = InferSelectModel<typeof cases>;
export type InsertCase = InferInsertModel<typeof cases>;

export type SelectReport = InferSelectModel<typeof reports>;
export type InsertReport = InferInsertModel<typeof reports>;