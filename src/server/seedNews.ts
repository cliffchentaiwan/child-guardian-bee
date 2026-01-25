// src/server/seedNews.ts
import 'dotenv/config';
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import fs from 'fs';
import path from 'path';
// 注意：根據你的檔案結構，這裡可能需要調整層級，請確認路徑
import { cases } from '../../drizzle/schema'; 
import { eq } from 'drizzle-orm';

// 確保路徑指向正確的 news_raw.json
const RAW_DATA_PATH = path.join(process.cwd(), 'src', 'server', 'data', 'news_raw.json');

async function seedNews() {
  console.log("🌱 開始匯入新聞資料...");

  if (!fs.existsSync(RAW_DATA_PATH)) {
    console.error(`❌ 找不到檔案: ${RAW_DATA_PATH}`);
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(RAW_DATA_PATH, 'utf-8'));
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const db = drizzle(connection);

  let successCount = 0;

  for (const item of rawData) {
    const existing = await db.select().from(cases).where(eq(cases.originalName, item.originalName || item.maskedName));
    
    if (existing.length === 0) {
      await db.insert(cases).values({
        masked_name: item.maskedName,       // 修正：轉成 snake_case
        original_name: item.originalName,
        role_type: item.role,
        risk_tags: item.riskTags,
        location: item.location || '台灣',
        case_date: new Date(item.caseDate),
        description: item.description,
        source_type: 'news',
        source_link: item.sourceLink,
        verified: item.verified,
        created_at: new Date(),
        updated_at: new Date(),
      });
      successCount++;
    }
  }

  console.log(`✅ 成功匯入 ${successCount} 筆新聞資料`);
  await connection.end();
  process.exit(0);
}

seedNews();