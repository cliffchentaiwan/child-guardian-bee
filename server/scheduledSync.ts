/**
 * 排程同步腳本
 * 
 * 用於每日凌晨自動同步司法院資料和新聞資料
 * 
 * 使用方式：
 * - 司法院同步（每日 0-6 時）：npx tsx server/scheduledSync.ts judicial
 * - 新聞同步（隨時可用）：npx tsx server/scheduledSync.ts news
 * - 政府資料同步（隨時可用）：npx tsx server/scheduledSync.ts gov
 * - 全部同步：npx tsx server/scheduledSync.ts all
 */

import 'dotenv/config';
import * as judicialApi from './judicialApi';
import * as newsScraper from './newsScraper';
import * as govDataScraper from './govDataScraper';
import { drizzle } from 'drizzle-orm/mysql2';
import { cases, dataSyncLogs } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

// 初始化資料庫連線
const db = process.env.DATABASE_URL ? drizzle(process.env.DATABASE_URL) : null;

/**
 * 插入案例到資料庫
 */
async function insertCase(data: {
  maskedName: string;
  role: string;
  riskTags: string[];
  location: string;
  date: string;
  description: string;
  sourceType: string;
  sourceLink: string;
  verified: boolean;
  judicialJid?: string;
}): Promise<void> {
  if (!db) {
    console.log('[模擬] 插入案例:', data.maskedName);
    return;
  }

  try {
    // 檢查是否已存在（根據 sourceLink 或 judicialJid）
    const existing = await db.select()
      .from(cases)
      .where(eq(cases.sourceLink, data.sourceLink))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[跳過] 案例已存在: ${data.maskedName}`);
      return;
    }

    await db.insert(cases).values({
      maskedName: data.maskedName,
      role: data.role as any,
      riskTags: data.riskTags,
      location: data.location,
      caseDate: data.date,
      description: data.description,
      sourceType: data.sourceType as any,
      sourceLink: data.sourceLink,
      verified: data.verified,
      judicialJid: data.judicialJid,
    });
    
    console.log(`[新增] ${data.maskedName} - ${data.riskTags.join(', ')}`);
  } catch (error) {
    console.error('[錯誤] 插入案例失敗:', error);
  }
}

/**
 * 記錄同步結果
 */
async function logSync(data: {
  source: string;
  status: string;
  recordsAdded: number;
  errorMessage?: string;
}): Promise<void> {
  if (!db) {
    console.log('[模擬] 記錄同步:', data);
    return;
  }

  try {
    await db.insert(dataSyncLogs).values({
      sourceName: data.source,
      status: data.status as 'running' | 'success' | 'failed',
      recordCount: data.recordsAdded,
      errorMessage: data.errorMessage,
    });
  } catch (error) {
    console.error('[錯誤] 記錄同步失敗:', error);
  }
}

/**
 * 同步司法院資料
 */
async function syncJudicial(): Promise<void> {
  console.log('\n========================================');
  console.log('開始同步司法院資料...');
  console.log('========================================\n');

  // 檢查服務時間
  const status = judicialApi.getServiceStatus();
  if (!status.available) {
    console.log(`[警告] ${status.message}`);
    if (status.nextAvailable) {
      console.log(`[提示] ${status.nextAvailable}`);
    }
    
    await logSync({
      source: 'judicial',
      status: 'skipped',
      recordsAdded: 0,
      errorMessage: status.message,
    });
    
    return;
  }

  console.log('[狀態] 司法院 API 服務中...');

  const result = await judicialApi.syncJudicialData(
    async (data) => {
      await insertCase({
        maskedName: data.name,
        role: data.role,
        riskTags: data.riskTags,
        location: data.location || '未知',
        date: data.date,
        description: data.description,
        sourceType: data.sourceType,
        sourceLink: data.sourceLink,
        verified: data.verified,
        judicialJid: data.jid,
      });
    },
    (current, total, message) => {
      if (current % 10 === 0 || current === total) {
        console.log(`[進度] ${current}/${total} - ${message}`);
      }
    }
  );

  await logSync({
    source: 'judicial',
    status: result.success ? 'success' : 'failed',
    recordsAdded: result.childRelated,
    errorMessage: result.error,
  });

  console.log('\n========================================');
  console.log(`司法院同步完成：處理 ${result.synced} 筆，新增 ${result.childRelated} 筆兒少相關案件`);
  if (result.errors > 0) {
    console.log(`[警告] 發生 ${result.errors} 個錯誤`);
  }
  console.log('========================================\n');
}

/**
 * 同步新聞資料
 */
async function syncNews(): Promise<void> {
  console.log('\n========================================');
  console.log('開始同步新聞資料...');
  console.log('========================================\n');

  console.log('[狀態] 新聞爬蟲啟動中...');
  console.log(`[來源] ${newsScraper.NEWS_SOURCES.map(s => s.name).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`);

  const result = await newsScraper.syncNewsData(
    async (data) => {
      await insertCase({
        maskedName: data.maskedName,
        role: data.role,
        riskTags: data.riskTags,
        location: data.location || '未知',
        date: data.date,
        description: data.description,
        sourceType: data.sourceType,
        sourceLink: data.sourceLink,
        verified: data.verified,
      });
    },
    (current, total, message) => {
      if (current % 5 === 0 || current === total) {
        console.log(`[進度] ${current}/${total} - ${message}`);
      }
    }
  );

  await logSync({
    source: 'news',
    status: result.success ? 'success' : 'failed',
    recordsAdded: result.childRelated,
    errorMessage: result.error,
  });

  console.log('\n========================================');
  console.log(`新聞同步完成：抓取 ${result.synced} 則，新增 ${result.childRelated} 筆兒少相關新聞`);
  if (result.errors > 0) {
    console.log(`[警告] 發生 ${result.errors} 個錯誤`);
  }
  console.log('========================================\n');
}

/**
 * 同步政府資料
 */
async function syncGov(): Promise<void> {
  console.log('\n========================================');
  console.log('開始同步政府資料...');
  console.log('========================================\n');

  const sources = govDataScraper.getGovDataSourcesStatus();
  console.log('[狀態] 政府資料爬蟲啟動中...');
  console.log(`[來源] ${sources.sources.map(s => s.name).join(', ')}`);

  const result = await govDataScraper.syncAllGovData(
    async (record) => {
      await insertCase({
        maskedName: record.maskedName,
        role: record.role,
        riskTags: record.riskTags,
        location: record.location || '未知',
        date: record.penaltyDate,
        description: record.description,
        sourceType: record.sourceType,
        sourceLink: record.sourceLink,
        verified: true,
      });
    },
    (current, total, message) => {
      console.log(`[進度] ${current}/${total} - ${message}`);
    }
  );

  await logSync({
    source: 'gov',
    status: result.success ? 'success' : 'failed',
    recordsAdded: result.added,
    errorMessage: result.error,
  });

  console.log('\n========================================');
  console.log(`政府資料同步完成：抓取 ${result.synced} 筆，新增 ${result.added} 筆`);
  if (result.errors > 0) {
    console.log(`[警告] 發生 ${result.errors} 個錯誤`);
  }
  console.log('========================================\n');
}

/**
 * 主程式
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const source = args[0] || 'all';

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║     兒少守護小蜂 - 資料同步程式        ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\n[時間] ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);
  console.log(`[模式] ${source}`);
  console.log(`[資料庫] ${db ? '已連線' : '未連線（模擬模式）'}`);

  try {
    if (source === 'judicial' || source === 'all') {
      await syncJudicial();
    }

    if (source === 'news' || source === 'all') {
      await syncNews();
    }

    if (source === 'gov' || source === 'all') {
      await syncGov();
    }

    console.log('\n[完成] 所有同步任務已完成！');
  } catch (error) {
    console.error('\n[錯誤] 同步過程發生錯誤:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
