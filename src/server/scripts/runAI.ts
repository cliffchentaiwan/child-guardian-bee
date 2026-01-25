// src/server/scripts/runAI.ts
import 'dotenv/config';
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, isNull } from "drizzle-orm";

// 🔥 修正路徑：往上跳三層，去根目錄抓 drizzle/schema
// 原本是 '../../drizzle/schema' (錯的)，改成 '../../../drizzle/schema' (對的)
import { cases } from '../../../drizzle/schema'; 

function mockAIGenerate(text: string, title: string): string {
  let summary = `【AI 重點解析】針對「${title}」的案件：\n`;
  
  if (text.includes("性剝削") || text.includes("私密") || title.includes("性") || text.includes("猥褻")) {
    summary += "⚠️ 風險等級：高。此案涉及兒少性影像或不當接觸。請家長留意該機構或人員背景，避免孩子單獨相處。";
  } else if (text.includes("虐童") || text.includes("管教") || text.includes("毆打") || text.includes("傷害")) {
    summary += "⚠️ 風險等級：高。涉及不當管教或肢體暴力。建議家長詳細確認該園所的師資流動狀況。";
  } else {
    summary += "ℹ️ 此為相關行政或法律紀錄，請點擊來源查看詳情，並多方查證。";
  }
  return summary;
}

async function runAI() {
  console.log("🤖 啟動 AI 翻譯機 (模擬模式)...");

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("❌ 找不到 DATABASE_URL");

  const connection = await mysql.createConnection(dbUrl);
  const db = drizzle(connection);

  // 找出還沒有摘要的案件
  const pendingCases = await db.select()
    .from(cases)
    .where(isNull(cases.aiSummary))
    .limit(50);

  console.log(`📊 發現 ${pendingCases.length} 筆資料需要解讀...`);

  for (const c of pendingCases) {
    const title = c.originalName || c.maskedName;
    const content = c.description || "";
    const summary = mockAIGenerate(content, title);
    
    await db.update(cases)
      .set({ aiSummary: summary })
      .where(eq(cases.id, c.id));
      
    console.log(`   ✅ 生成摘要：${title.substring(0, 10)}...`);
  }

  console.log("\n🎉 AI 作業完成！快去前台搜尋看看！");
  await connection.end();
  process.exit(0);
}

runAI();