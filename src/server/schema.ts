// src/server/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// 1. 違規案件表 (核心)
export const cases = sqliteTable('cases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  maskedName: text('masked_name'),    // 顯示名稱 (王O明)
  name: text('name'),                 // 真實名稱 (僅後端用)
  originalName: text('original_name'),// 原始爬蟲抓到的標題
  role: text('role'),                 // 負責人/園長/行為人
  riskTags: text('risk_tags'),        // 風險標籤 (JSON string)
  location: text('location'),         // 地區
  caseDate: text('case_date'),        // 發生日期或裁罰日期
  description: text('description'),   // 詳細描述
  sourceType: text('source_type'),    // 資料來源 (gov_edu, gov_crc, judicial, news)
  sourceLink: text('source_link'),    // 來源連結 (Unique Key)
  verified: integer('verified', { mode: 'boolean' }).default(false), // 是否人工查證
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

// 2. 🔥 [新增] 使用者表 (修復 Build Error 關鍵)
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').unique().notNull(),
  name: text('name'),
  picture: text('picture'),
  role: text('role').default('user'), // user | admin
  googleId: text('google_id'),        // Google OAuth ID
  createdAt: integer('created_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// 3. 搜尋紀錄表
export const searchLogs = sqliteTable('search_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  searchedName: text('searched_name'),
  searchedArea: text('searched_area'),
  foundResults: integer('found_results', { mode: 'boolean' }),
  resultCount: integer('result_count'),
  userIp: text('user_ip'),
  searchedAt: integer('searched_at', { mode: 'timestamp' }),
});

// 4. 通報紀錄表
export const reports = sqliteTable('reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  suspectName: text('suspect_name'),
  location: text('location'),
  description: text('description'),
  attachments: text('attachments'), // JSON array of URLs
  reporterIp: text('reporter_ip'),
  status: text('status').default('pending'), // pending, approved, rejected
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

// 5. 資料同步日誌
export const dataSyncLogs = sqliteTable('data_sync_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceName: text('source_name'), // e.g., 'gov_edu', 'news'
  status: text('status'),          // success, failed
  recordCount: integer('record_count'),
  errorMessage: text('error_message'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});