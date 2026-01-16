/**
 * KindyInfo 資料同步腳本
 * 爬取 KindyInfo 幼園通的裁罰紀錄並匯入資料庫
 */

import * as cheerio from 'cheerio';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// 載入環境變數
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ 缺少 DATABASE_URL 環境變數');
  process.exit(1);
}

// 解析 DATABASE_URL
function parseDbUrl(url) {
  const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!match) throw new Error('無法解析 DATABASE_URL');
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4]),
    database: match[5].split('?')[0],
  };
}

// 爬取 KindyInfo 頁面
async function fetchKindyInfoPage(url) {
  console.log(`[KindyInfo] 爬取頁面：${url}`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-TW,zh;q=0.9',
    },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  return await response.text();
}

// 解析 KindyInfo HTML
function parseKindyInfoHtml(html, sourceUrl) {
  const $ = cheerio.load(html);
  const records = [];
  
  // 找到所有 tr 標籤
  $('tr').each((index, row) => {
    const cells = $(row).find('td');
    
    if (cells.length >= 5) {
      // 提取文字內容，移除 HTML 註解
      const getText = (cell) => {
        return $(cell).text().replace(/<!--.*?-->/g, '').trim();
      };
      
      const date = getText(cells[0]);
      const city = getText(cells[1]);
      const district = getText(cells[2]);
      const name = getText(cells[3]);
      const countText = getText(cells[4]);
      const penalty = cells.length > 5 ? getText(cells[5]) : '';
      
      // 驗證資料
      if (date && city && name && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        records.push({
          date,
          city,
          district,
          name,
          count: parseInt(countText) || 1,
          penalty,
          sourceUrl,
        });
      }
    }
  });
  
  return records;
}

// 主程式
async function main() {
  console.log('='.repeat(60));
  console.log('兒少守護小蜂 - KindyInfo 資料同步');
  console.log('='.repeat(60));
  
  // 連接資料庫
  const dbConfig = parseDbUrl(DATABASE_URL);
  console.log(`\n[DB] 連接資料庫：${dbConfig.host}/${dbConfig.database}`);
  
  const connection = await mysql.createConnection({
    ...dbConfig,
    ssl: { rejectUnauthorized: false },
  });
  
  console.log('[DB] 連接成功！\n');
  
  // KindyInfo 頁面列表
  const pages = [
    'https://www.kindyinfo.com/blog/preschool-penalties',
    'https://www.kindyinfo.com/blog/preschool-penalties/2024',
    'https://www.kindyinfo.com/blog/preschool-penalties/2023',
  ];
  
  let totalRecords = 0;
  let inserted = 0;
  let skipped = 0;
  
  for (const pageUrl of pages) {
    try {
      const html = await fetchKindyInfoPage(pageUrl);
      const records = parseKindyInfoHtml(html, pageUrl);
      
      console.log(`[KindyInfo] 從 ${pageUrl} 解析到 ${records.length} 筆紀錄`);
      totalRecords += records.length;
      
      // 儲存到資料庫
      for (const record of records) {
        try {
          // 檢查是否已存在
          const [existing] = await connection.execute(
            'SELECT id FROM cases WHERE maskedName = ? AND caseDate = ? AND location = ? LIMIT 1',
            [record.name, record.date, `${record.city}${record.district}`]
          );
          
          if (existing.length > 0) {
            skipped++;
            continue;
          }
          
          // 新增紀錄
          await connection.execute(
            `INSERT INTO cases (maskedName, originalName, roleType, location, riskTags, description, sourceType, sourceLink, verified, caseDate, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              record.name,
              record.name,
              '其他',  // 幼兒園歸類為其他
              `${record.city}${record.district}`,
              JSON.stringify(['裁罰紀錄']),
              `${record.penalty}（${record.count} 筆）`,
              '政府公告',
              record.sourceUrl,
              1,
              record.date,
            ]
          );
          
          inserted++;
          
        } catch (err) {
          console.error(`[Error] 儲存失敗：${record.name}`, err.message);
        }
      }
      
      // 避免請求過快
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (err) {
      console.error(`[Error] 爬取失敗：${pageUrl}`, err.message);
    }
  }
  
  // 更新同步記錄
  try {
    await connection.execute(
      `INSERT INTO sync_logs (source, status, records_count, message, synced_at, created_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      ['kindyinfo', 'success', inserted, `同步完成：新增 ${inserted} 筆，跳過 ${skipped} 筆`]
    );
  } catch (err) {
    console.error('[Warning] 無法更新同步記錄:', err.message);
  }
  
  await connection.end();
  
  console.log('\n' + '='.repeat(60));
  console.log('同步完成！');
  console.log(`  總爬取：${totalRecords} 筆`);
  console.log(`  新增：${inserted} 筆`);
  console.log(`  跳過（已存在）：${skipped} 筆`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('同步失敗:', err);
  process.exit(1);
});
