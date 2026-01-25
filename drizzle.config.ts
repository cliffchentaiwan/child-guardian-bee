// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  // 🔥 修正：根據你的截圖，schema 在 server 資料夾下
  schema: "./src/server/schema.ts", 
  out: "./drizzle", // 輸出資料夾改到根目錄比較單純
  dialect: "sqlite",
  dbCredentials: {
    url: "sqlite.db",
  },
});