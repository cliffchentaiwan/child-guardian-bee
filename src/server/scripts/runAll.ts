// src/server/scripts/runAll.ts
import { execSync } from 'child_process';

async function runAll() {
  console.log("🚀 [系統全面更新] 總指揮官啟動...");
  const start = Date.now();

  try {
    // 1. 跑新聞
    console.log("\n--------------------------------");
    console.log("📰 任務一：更新新聞資料 (News)...");
    console.log("--------------------------------");
    // stdio: 'inherit' 讓子程式的輸出直接顯示在目前的終端機
    execSync('npx tsx src/server/scripts/crawlNews_Final.ts', { stdio: 'inherit' });

    // 2. 跑 CRC (兒少裁罰)
    console.log("\n--------------------------------");
    console.log("🚜 任務二：更新兒少裁罰資料 (CRC)...");
    console.log("--------------------------------");
    execSync('npx tsx src/server/scripts/crawlCRC_Real.ts', { stdio: 'inherit' });

    // 3. 跑 幼兒園
    console.log("\n--------------------------------");
    console.log("🏫 任務三：更新幼兒園名單 (Kindergarten)...");
    console.log("--------------------------------");
    execSync('npx tsx src/server/scripts/crawlKindergarten_Real.ts', { stdio: 'inherit' });

    const duration = (Date.now() - start) / 1000;
    console.log(`\n✅ [全部完成] 所有資料庫更新完畢！耗時：${duration.toFixed(1)} 秒`);
    console.log("👉 請重新整理網頁，現在應該要有滿滿的資料了！");

  } catch (error) {
    console.error("\n❌ [流程中斷] 某個爬蟲發生錯誤，請檢查上方紅字訊息。");
    // 不用 exit，讓它顯示錯誤
  }
}

runAll();