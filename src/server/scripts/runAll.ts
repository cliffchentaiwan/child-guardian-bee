// src/server/scripts/runAll.ts
import { execSync } from 'child_process';

async function runAll() {
  console.log("🚀 [系統全面更新] 總指揮官啟動...");
  const start = Date.now();

  try {
    // 1. 跑新聞 (媒體)
    console.log("\n--------------------------------");
    console.log("📰 任務一：更新新聞資料 (News)...");
    console.log("--------------------------------");
    try {
        execSync('npx tsx src/server/scripts/crawlNews_Final.ts', { stdio: 'inherit' });
    } catch (e) { console.log("⚠️ 新聞爬蟲部分失敗，繼續執行..."); }

    // 2. 跑 CRC (兒少裁罰)
    console.log("\n--------------------------------");
    console.log("🛡️ 任務二：更新兒少裁罰資料 (CRC)...");
    console.log("--------------------------------");
    try {
        execSync('npx tsx src/server/scripts/crawlCRC_Real.ts', { stdio: 'inherit' });
    } catch (e) { console.log("⚠️ CRC 爬蟲部分失敗，繼續執行..."); }

    // 3. 跑 ECE (教育部教保網 - 上帝之手版) 🔥 確認呼叫 Popup 版
    console.log("\n--------------------------------");
    console.log("🏫 任務三：更新教育部裁罰紀錄 (ECE Popup)...");
    console.log("--------------------------------");
    try {
        execSync('npx tsx src/server/scripts/crawlECE_Popup.ts', { stdio: 'inherit' });
    } catch (e) { console.log("⚠️ ECE 爬蟲部分失敗，繼續執行..."); }

    // 4. 跑 司法院 (判決書)
    console.log("\n--------------------------------");
    console.log("⚖️ 任務四：更新司法院判決書 (Judicial)...");
    console.log("--------------------------------");
    console.log("💡 提示：司法院爬蟲需要手動輸入驗證碼！");
    try {
        execSync('npx tsx src/server/scripts/crawlJudicial_Real.ts', { stdio: 'inherit' });
    } catch (e) {
        console.log("⚠️ 判決書爬蟲執行失敗，跳過此步驟。");
    }

    const duration = (Date.now() - start) / 1000;
    console.log(`\n✅ [全部完成] 所有資料庫更新完畢！耗時：${duration.toFixed(1)} 秒`);

  } catch (error) {
    console.error("\n❌ [流程中斷] 嚴重錯誤，請檢查上方訊息。");
  }
}

runAll();