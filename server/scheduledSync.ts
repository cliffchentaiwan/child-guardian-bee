// src/server/scheduledSync.ts
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execPromise = util.promisify(exec);

async function runCommand(scriptName: string) {
  // 這裡我們組合完整的檔案路徑
  const scriptPath = path.join(process.cwd(), 'src', 'server', 'scripts', scriptName);
  console.log(`\n🤖 [自動排程] 正在執行：${scriptName}...`);
  
  try {
    // 使用 npx tsx 來執行指定的腳本
    const { stdout, stderr } = await execPromise(`npx tsx "${scriptPath}"`);
    
    // 印出該腳本的輸出結果
    if (stdout) console.log(stdout);
    if (stderr && !stderr.includes('Debugger attached')) console.error(stderr); // 過濾掉無關的 debug 訊息
    
    console.log(`✅ [自動排程] ${scriptName} 執行完畢。`);
    return true;
  } catch (error: any) {
    console.error(`❌ [自動排程] ${scriptName} 失敗：`, error.message);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    return false;
  }
}

export async function runCRCSyncTask() {
  console.log("⏰ 啟動 CRC 每日同步任務 (爬蟲 + 入庫)...");
  const startTime = Date.now();

  // 1. 執行爬蟲 (抓取最新資料)
  const crawlSuccess = await runCommand('crawlCRC_Real.ts');
  if (!crawlSuccess) {
      console.log("⚠️ 爬蟲失敗，為了安全起見，中止入庫作業。");
      return;
  }

  // 2. 執行入庫 (寫入資料庫)
  const seedSuccess = await runCommand('seedCRC.ts');
  if (!seedSuccess) {
      console.log("⚠️ 入庫失敗，請檢查資料庫連線。");
      return;
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 CRC 同步任務全數完成！總耗時 ${duration} 秒。`);
}

// 讓這支程式可以直接被執行
if (process.argv[1] === import.meta.filename || process.argv[1].endsWith('scheduledSync.ts')) {
    runCRCSyncTask();
}