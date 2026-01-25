// inject_test.ts
import { db } from './src/server/db';
import { cases, dataSyncLogs } from './src/server/schema';

async function main() {
  console.log("💉 開始注入測試資料...");

  try {
    // 1. 注入一筆「同步成功」的紀錄 (讓網頁亮綠燈)
    // 這裡用 new Date() 沒問題，因為 Schema 設定是 integer + timestamp mode
    await db.insert(dataSyncLogs).values({
      sourceName: '手動測試注入',
      status: 'success',
      recordCount: 1,
      startedAt: new Date(),
      completedAt: new Date(),
    });
    console.log("✅ 同步燈號已寫入！");

    // 2. 注入一筆「快樂幼兒園」的裁罰紀錄
    await db.insert(cases).values({
      name: '測試快樂幼兒園',
      maskedName: '測試快樂幼兒園',
      originalName: '測試快樂幼兒園',
      location: '臺北市',
      district: '信義區',
      description: '這是一筆手動注入的測試資料，證明資料庫連線正常。',
      // 🔥 關鍵修正：把 Date 物件轉成 ISO 字串，SQLite 才看得懂！
      caseDate: new Date().toISOString(), 
      sourceType: 'manual',
      sourceLink: 'http://localhost:3000',
      riskTags: '["測試資料"]',
      role: '機構',
      verified: true
    });
    console.log("✅ 測試案件已寫入！(搜尋「快樂」應該要看到了)");

  } catch (e) {
    console.error("❌ 注入失敗:", e);
  }
}

main();