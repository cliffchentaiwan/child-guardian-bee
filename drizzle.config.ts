// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';
import 'dotenv/config'; // 讀取 .env 檔案

export default defineConfig({
  out: './drizzle',
  schema: './src/server/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});