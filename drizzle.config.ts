// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
import 'dotenv/config'; // 讀取 .env 檔案

export default defineConfig({
  out: './drizzle',
  schema: './src/server/schema.ts',
  dialect: 'postgresql', // 🔥 關鍵修改：從 'sqlite' 改成 'postgresql'
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});