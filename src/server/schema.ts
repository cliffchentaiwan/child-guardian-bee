// server/schema.ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// 1. 案件資料表 (Cases)
export const cases = sqliteTable('cases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  maskedName: text('masked_name'),
  originalName: text('original_name'), // 搜尋關鍵！
  name: text('name'),
  role: text('role'),
  location: text('location'),
  caseDate: text('case_date'),
  description: text('description'),
  violationType: text('violation_type'),
  riskTags: text('risk_tags'),
  sourceType: text('source_type'),
  sourceLink: text('source_link'),
  verified: integer('verified', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  nameIdx: index('name_idx').on(table.name),
  originalNameIdx: index('original_name_idx').on(table.originalName),
  dateIdx: index('date_idx').on(table.caseDate),
}));

// 2. 同步紀錄表
export const dataSyncLogs = sqliteTable('data_sync_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceName: text('source_name'),
  status: text('status'),
  recordCount: integer('record_count'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  errorMessage: text('error_message'),
});

// 3. 搜尋紀錄表 (網站伺服器之前就是缺這個才掛掉！)
export const searchLogs = sqliteTable('search_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  searchedName: text('searched_name'),
  searchedArea: text('searched_area'),
  foundResults: integer('found_results', { mode: 'boolean' }),
  resultCount: integer('result_count'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});

// 4. 通報表
export const reports = sqliteTable('reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  suspectName: text('suspect_name'),
  location: text('location'),
  description: text('description'),
  attachments: text('attachments'),
  reporterIp: text('reporter_ip'),
  status: text('status').default('pending'),
  reviewNote: text('review_note'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(strftime('%s', 'now'))`),
});