import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 案例資料表 - 儲存從各來源抓取的案件資料
 * 來源包括：司法院裁判書、新聞媒體、社群輿情
 */
export const cases = mysqlTable("cases", {
  id: int("id").autoincrement().primaryKey(),
  /** 姓名（已遮罩中間字，如「王○明」） */
  maskedName: varchar("maskedName", { length: 100 }).notNull(),
  /** 原始姓名（用於比對，加密儲存或僅供內部使用） */
  originalName: varchar("originalName", { length: 100 }),
  /** 角色類型 */
  role: mysqlEnum("roleType", ["家教", "保母", "才藝老師", "補習班老師", "學校老師", "教練", "其他"]).notNull(),
  /** 風險標籤（JSON 陣列） */
  riskTags: json("riskTags").$type<string[]>().notNull(),
  /** 發生地區 */
  location: varchar("location", { length: 100 }).notNull(),
  /** 案件日期 */
  caseDate: varchar("caseDate", { length: 20 }),
  /** 案件描述 */
  description: text("description"),
  /** 資料來源類型 */
  sourceType: mysqlEnum("sourceType", ["政府公告", "媒體報導", "社群輿情"]).notNull(),
  /** 資料來源連結 */
  sourceLink: varchar("sourceLink", { length: 500 }),
  /** 是否已經司法認定 */
  verified: boolean("verified").default(false).notNull(),
  /** 司法院裁判書 JID（如有） */
  judicialJid: varchar("judicialJid", { length: 100 }),
  /** 建立時間 */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** 更新時間 */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Case = typeof cases.$inferSelect;
export type InsertCase = typeof cases.$inferInsert;

/**
 * 通報記錄表 - 儲存使用者匿名通報的資料
 */
export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  /** 被通報人姓名 */
  suspectName: varchar("suspectName", { length: 100 }).notNull(),
  /** 發生地點 */
  location: varchar("location", { length: 200 }),
  /** 事件描述 */
  description: text("description").notNull(),
  /** 附件檔案路徑（JSON 陣列） */
  attachments: json("attachments").$type<string[]>(),
  /** 通報狀態 */
  status: mysqlEnum("status", ["pending", "reviewing", "approved", "rejected"]).default("pending").notNull(),
  /** 審核備註 */
  reviewNote: text("reviewNote"),
  /** 通報者 IP（用於防濫用，不公開） */
  reporterIp: varchar("reporterIp", { length: 50 }),
  /** 建立時間 */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /** 更新時間 */
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;

/**
 * 搜尋記錄表 - 記錄搜尋歷史（用於統計和改進）
 */
export const searchLogs = mysqlTable("searchLogs", {
  id: int("id").autoincrement().primaryKey(),
  /** 搜尋的姓名 */
  searchedName: varchar("searchedName", { length: 100 }).notNull(),
  /** 搜尋的地區 */
  searchedArea: varchar("searchedArea", { length: 50 }),
  /** 是否找到結果 */
  foundResults: boolean("foundResults").default(false).notNull(),
  /** 結果數量 */
  resultCount: int("resultCount").default(0),
  /** 搜尋時間 */
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SearchLog = typeof searchLogs.$inferSelect;
export type InsertSearchLog = typeof searchLogs.$inferInsert;

/**
 * 資料來源同步記錄 - 記錄各資料來源的同步狀態
 */
export const dataSyncLogs = mysqlTable("dataSyncLogs", {
  id: int("id").autoincrement().primaryKey(),
  /** 資料來源名稱 */
  sourceName: varchar("sourceName", { length: 100 }).notNull(),
  /** 同步狀態 */
  status: mysqlEnum("syncStatus", ["running", "success", "failed"]).notNull(),
  /** 同步的記錄數量 */
  recordCount: int("recordCount").default(0),
  /** 錯誤訊息（如有） */
  errorMessage: text("errorMessage"),
  /** 開始時間 */
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  /** 完成時間 */
  completedAt: timestamp("completedAt"),
});

export type DataSyncLog = typeof dataSyncLogs.$inferSelect;
export type InsertDataSyncLog = typeof dataSyncLogs.$inferInsert;
