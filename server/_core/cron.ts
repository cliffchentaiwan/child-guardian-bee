// server/_core/cron.ts
import cron from 'node-cron';
// 修正路徑：往上跳兩層 (../../) 進入 src/server 找到我們建立好的 db 和 schema
import { db } from '../../src/server/db'; 
import { dataSyncLogs } from '../../src/server/schema';
import { crawlNewsFinal } from '../../src/server/scripts/crawlNews_Final';

export function startCronJobs() {
  console.log("⏰ 排程系統已啟動：每天凌晨 03:00 自動更新資料庫");

  // 設定時間：每天凌晨 03:00
  cron.schedule('0 3 * * *', async () => {
    console.log("🤖 [排程啟動] 開始執行每日資料更新...");
    
    try {
      // 1. 執行新聞爬蟲
      console.log("   📰 正在執行新聞爬取...");
      await crawlNewsFinal();
      
      console.log("✅ [排程完成] 所有自動化任務執行完畢");
      
    } catch (error) {
      console.error("❌ [排程失敗] 更新過程中發生錯誤:", error);
      
      // 記錄錯誤到資料庫
      try {
        await db.insert(dataSyncLogs).values({
            sourceName: 'cron_scheduler',
            status: 'failed',
            recordCount: 0,
            startedAt: new Date(),
            completedAt: new Date(),
            errorMessage: String(error)
        });
      } catch (e) {
        console.error("   (無法寫入錯誤 Log)");
      }
    }
  });
}