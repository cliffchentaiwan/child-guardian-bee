/**
 * 每日資料同步腳本
 * 用於排程執行，同步 CRC 和 KindyInfo 資料
 */

import { syncCrcData } from '../server/crcScraper';
import { syncKindyInfo } from '../server/kindyInfoScraper';

async function runDailySync() {
  console.log('='.repeat(50));
  console.log(`[${new Date().toISOString()}] 開始每日資料同步`);
  console.log('='.repeat(50));

  const results: { source: string; success: boolean; message: string }[] = [];

  // 1. 同步 CRC 兒少法裁罰資料
  console.log('\n[1/2] 同步 CRC 兒少法裁罰資料...');
  try {
    const crcResult = await syncCrcData();
    results.push({
      source: 'CRC',
      success: crcResult.success,
      message: crcResult.success
        ? `爬取 ${crcResult.totalRecords} 筆，新增 ${crcResult.inserted} 筆，跳過 ${crcResult.skipped} 筆`
        : crcResult.error || '同步失敗',
    });
    console.log(`✅ CRC: ${results[results.length - 1].message}`);
  } catch (error: any) {
    results.push({
      source: 'CRC',
      success: false,
      message: error.message,
    });
    console.log(`❌ CRC: ${error.message}`);
  }

  // 2. 同步 KindyInfo 幼園通資料
  console.log('\n[2/2] 同步 KindyInfo 幼園通資料...');
  try {
    const kindyResult = await syncKindyInfo();
    results.push({
      source: 'KindyInfo',
      success: true,
      message: `爬取 ${kindyResult.totalRecords} 筆，新增 ${kindyResult.inserted} 筆，跳過 ${kindyResult.skipped} 筆`,
    });
    console.log(`✅ KindyInfo: ${results[results.length - 1].message}`);
  } catch (error: any) {
    results.push({
      source: 'KindyInfo',
      success: false,
      message: error.message,
    });
    console.log(`❌ KindyInfo: ${error.message}`);
  }

  // 輸出總結
  console.log('\n' + '='.repeat(50));
  console.log('同步完成總結：');
  console.log('='.repeat(50));
  
  for (const result of results) {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.source}: ${result.message}`);
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`\n總計：${successCount}/${results.length} 個來源同步成功`);
  console.log(`[${new Date().toISOString()}] 每日同步結束`);

  return results;
}

// 如果直接執行此腳本
if (import.meta.url === `file://${process.argv[1]}`) {
  runDailySync()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('同步失敗:', error);
      process.exit(1);
    });
}

export { runDailySync };
