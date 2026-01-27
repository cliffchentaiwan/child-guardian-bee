// src/server/schema.ts
// 🔥 這裡全部換成 pg-core (Postgres 專用元件)
import { pgTable, serial, text, integer, timestamp, boolean, varchar } from 'drizzle-orm/pg-core';

// 1. 使用者表 (Users)
export const users = pgTable('users', {
  id: serial('id').primaryKey(), // SQLite 的 autoIncrement 在這裡叫做 serial
  email: text('email').notNull().unique(),
  name: text('name'),
  picture: text('picture'),
  googleId: text('google_id').unique(),
  role: text('role').default('user'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// 2. 案件資料表 (Cases) - 來自爬蟲
export const cases = pgTable('cases', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // 關鍵字 (如：某某幼兒園)
  maskedName: text('masked_name'), // 去識別化名稱
  originalName: text('original_name'), // 原始名稱
  location: text('location'),
  riskTags: text('risk_tags'), // 風險標籤 (JSON string 或逗號分隔)
  riskLevel: text('risk_level'),
  source: text('source'), // 來源 (司法、媒體、裁罰)
  summary: text('summary'),
  url: text('url'), // 原始連結
  caseDate: text('case_date'), // 發生日期
  crawledAt: timestamp('crawled_at').defaultNow(),
});

// 3. 通報資料表 (Reports) - 來自使用者
export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  reporterIp: text('reporter_ip'),
  suspectName: text('suspect_name').notNull(),
  location: text('location'),
  description: text('description').notNull(),
  status: text('status').default('pending'), // pending, reviewed, dismissed
  createdAt: timestamp('created_at').defaultNow(),
});

// 4. 搜尋紀錄 (Search Logs)
export const searchLogs = pgTable('search_logs', {
  id: serial('id').primaryKey(),
  userIp: text('user_ip'),
  searchedName: text('searched_name'),
  searchedArea: text('searched_area'),
  resultCount: integer('result_count'),
  foundResults: boolean('found_results'),
  searchedAt: timestamp('searched_at').defaultNow(),
});

// 5. 資料同步紀錄 (Sync Logs)
export const dataSyncLogs = pgTable('data_sync_logs', {
  id: serial('id').primaryKey(),
  status: text('status'), // success, failed
  message: text('message'),
  recordsAdded: integer('records_added'),
  syncType: text('sync_type'), // news, judicial, crc
  createdAt: timestamp('created_at').defaultNow(),
});