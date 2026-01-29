// src/server/scripts/scheduler.ts
import cron from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 📋 每日夜間任務清單
// 注意：我們故意不放「司法院」，因為它需要人工驗證碼，半夜跑會卡住。
const nightlyTasks = [
    { 
        name: '📰 新聞爬蟲 (News)', 
        command: 'npx tsx src/server/scripts/crawlNews_Final.ts' 
    },
    { 
        name: '🛡️ CRC 兒少裁罰', 
        command: 'npx tsx src/server/scripts/crawlCRC_Real.ts' 
    },
    { 
        name: '🏫 教保網 (ECE)', 
        // 這是最關鍵的 Popup 版，資料量大，放在最後跑
        command: 'npx tsx src/server/scripts/crawlECE_Popup.ts' 
    }
];

export function startScheduler() {
  console.log('⏰ [內部排程系統] 已啟動！設定時間：每天凌晨 03:00 (台北時間)');

  // ⏰ 設定每天 03:00 執行
  // Render 伺服器通常是 UTC 時間 (+0)
  // 台北 (+8) 的 03:00 = UTC 的 19:00 (前一天)
  cron.schedule('0 19 * * *', async () => {
    console.log('\n🌙 [夜間任務] 鬧鐘響了！開始執行自動爬蟲...');
    
    // 🔄 依序執行每一個任務
    for (const task of nightlyTasks) {
        console.log(`\n▶️ [${task.name}] 啟動中...`);
        const startTime = Date.now();

        try {
            // 設定 15 分鐘超時 (timeout)，避免單一爬蟲卡死整個伺服器
            const { stdout, stderr } = await execAsync(task.command, { timeout: 1000 * 60 * 15 });
            
            // 輸出結果 (只顯示最後 200 字避免 Log 爆炸)
            if (stdout) console.log(`   ✅ 輸出摘要: ${stdout.trim().slice(-200)}`);
            if (stderr) console.log(`   ⚠️ 警告訊息: ${stderr.trim().slice(-200)}`);
            
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`   🎉 [${task.name}] 執行成功！耗時: ${duration}秒`);
            
        } catch (error: any) {
            // 🔥 防彈機制：這裡抓住了錯誤，所以不會讓程式崩潰！
            console.error(`   ❌ [${task.name}] 執行失敗:`, error.message);
            console.log(`   🔄 系統自動跳過此任務，繼續執行下一個...`);
        }
    }

    console.log('\n✅ [夜間任務] 所有排程已結束，系統待命與 UptimeRobot 保持連線中。');
  });
}