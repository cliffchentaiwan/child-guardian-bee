// src/server/scripts/seedCRC.ts
import 'dotenv/config';
import { db } from '../db'; // 使用我們設定好的 SQLite 連線
import { cases, dataSyncLogs } from '../schema'; // 使用正確的 schema
import { eq } from 'drizzle-orm';

// 模擬一些重要的 CRC 判決資料 (或是從 JSON 讀取的結構)
const SAMPLE_CRC_DATA = [
  {
    name: '林O名',
    location: '臺北市',
    reason: '違反兒童及少年性剝削防制條例',
    date: '2023-05-20',
    link: 'https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=TXYM,112,侵訴,15,20230520,1'
  },
  {
    name: '陳O雄',
    location: '新北市',
    reason: '拍攝未成年性影像',
    date: '2023-11-15',
    link: 'https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=PCDM,112,訴,88,20231115,1'
  }
];

async function seedCRC() {
  console.log("🌱 [CRC] 啟動判決書資料入庫...");

  let successCount = 0;

  try {
    for (const record of SAMPLE_CRC_DATA) {
      // 檢查是否已存在
      const existing = await db.select().from(cases).where(eq(cases.sourceLink, record.link));

      if (existing.length === 0) {
        await db.insert(cases).values({
          name: record.name,
          maskedName: record.name,
          originalName: record.name,
          location: record.location,
          description: `【判決書】${record.reason}`,
          caseDate: new Date(record.date).toISOString(), // SQLite 日期格式
          sourceType: 'crc_judicial',
          riskTags: JSON.stringify(['兒少性剝削', '判決書']),
          sourceLink: record.link,
          role: '個人',
          verified: true,
          createdAt: new Date(),
        });
        successCount++;
        console.log(`   ➕ 新增判決: ${record.name}`);
      }
    }

    if (successCount > 0) {
        await db.insert(dataSyncLogs).values({
            sourceName: 'CRC 判決書資料庫',
            status: 'success',
            recordCount: successCount,
            startedAt: new Date(),
            completedAt: new Date(),
        });
    }

    console.log(`✅ CRC 入庫作業結束！共新增 ${successCount} 筆。`);

  } catch (e) {
    console.error("❌ CRC 入庫失敗:", e);
  } finally {
    process.exit(0);
  }
}

seedCRC();