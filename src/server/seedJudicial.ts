// src/server/seedJudicial.ts
import 'dotenv/config';
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import fs from 'fs';
import path from 'path';

// 👇 修改這裡：加一個 ../ (變成兩層)，這樣才找得到最外面的 drizzle 資料夾
import { cases } from '../../drizzle/schema.js'; 

async function seedJudicialData() {
  console.log("🌱 正在將司法判決資料寫入資料庫...");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("❌ 找不到 DATABASE_URL");

  // 1. 讀取 JSON
  const jsonPath = path.join(process.cwd(), 'src', 'server', 'seedData', 'judicial_enriched.json');
  if (!fs.existsSync(jsonPath)) {
      console.error("❌ 找不到 judicial_enriched.json");
      return;
  }
  const records = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  // 2. 連線資料庫
  const connection = await mysql.createConnection(dbUrl);
  const db = drizzle(connection);

  let successCount = 0;

  // 3. 逐筆寫入
  for (const record of records) {
      // 過濾掉完全沒有資訊的空名字
      if (!record.name || record.name === '未知' || record.name === '○○○') {
          continue; 
      }

      // 從網址中提取 JID (作為唯一識別碼，避免重複寫入)
      let jid = '';
      try {
          const urlObj = new URL(record.url);
          jid = urlObj.searchParams.get('id') || '';
      } catch (e) {}

      console.log(`   正在寫入: ${record.name} (${record.title.substring(0, 10)}...)`);

      try {
          await db.insert(cases).values({
              maskedName: record.name, 
              originalName: record.name,
              role: '其他', 
              riskTags: ['司法判決', record.role || '被告'], 
              location: extractCity(record.title) || '台灣', 
              caseDate: record.date,
              description: `【${record.title}】\n${record.fullText}`,
              sourceType: '政府公告', 
              sourceLink: record.url,
              verified: true,
              judicialJid: jid
          });
          successCount++;
      } catch (error: any) {
          // 如果 JID 重複，就跳過
          if (!error.message.includes('Duplicate entry')) {
              console.error(`   ❌ 寫入失敗:`, error.message);
          }
      }
  }

  console.log(`\n🎉 入庫完成！成功寫入 ${successCount} 筆司法判決資料。`);
  await connection.end();
  process.exit(0);
}

// 簡單的縣市提取小工具
function extractCity(text: string): string | null {
    const cities = ['台北', '新北', '桃園', '台中', '台南', '高雄', '基隆', '新竹', '嘉義', '苗栗', '彰化', '南投', '雲林', '屏東', '宜蘭', '花蓮', '台東', '澎湖', '金門', '連江'];
    for (const city of cities) {
        if (text.includes(city)) return city;
    }
    return null;
}

seedJudicialData();