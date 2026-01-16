/**
 * 執行資料同步腳本
 * 同步 CRC 和 KindyInfo 資料到資料庫
 */

import { execSync } from 'child_process';
import * as cheerio from 'cheerio';

// 資料庫連線資訊從環境變數取得
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ 缺少 DATABASE_URL 環境變數');
  process.exit(1);
}

console.log('='.repeat(60));
console.log('兒少守護小蜂 - 資料同步');
console.log('='.repeat(60));

// 使用 curl 爬取 CRC 資料
async function fetchCrcPage(pageIndex) {
  const cmd = `curl -sL "https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction" \
    -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
    -H "Accept: text/html,application/xhtml+xml" \
    -H "Accept-Language: zh-TW,zh;q=0.9" \
    -H "Cookie: ASP.NET_SessionId=crc_sync_session" \
    -d "City=&PenaltyTarget=&Name=&StartDate=&EndDate=&PageIndex=${pageIndex}&PageSize=10"`;
  
  try {
    const html = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
    return html;
  } catch (error) {
    console.error(`爬取第 ${pageIndex} 頁失敗:`, error.message);
    return null;
  }
}

// 解析 CRC 頁面資料
function parseCrcPage(html) {
  const $ = cheerio.load(html);
  const records = [];
  
  $('.tr[role="row"]').each((i, row) => {
    const cells = $(row).find('.td');
    if (cells.length >= 4) {
      const city = $(cells[0]).text().trim();
      const name = $(cells[1]).text().trim();
      const violation = $(cells[2]).text().trim();
      const date = $(cells[3]).text().trim();
      
      if (name && city) {
        records.push({
          city,
          name,
          violation,
          date: date.replace(/\./g, '-'),
        });
      }
    }
  });
  
  return records;
}

// 取得總頁數
function getTotalPages(html) {
  const match = html.match(/共\s*(\d+)\s*頁/);
  return match ? parseInt(match[1]) : 1;
}

// 主程式
async function main() {
  console.log('\n[1/2] 開始同步 CRC 兒少法裁罰資料...\n');
  
  // 先取得第一頁，確認總頁數
  const firstPage = await fetchCrcPage(1);
  if (!firstPage) {
    console.error('❌ 無法連接 CRC 網站');
    return;
  }
  
  const totalPages = getTotalPages(firstPage);
  console.log(`📊 CRC 網站共 ${totalPages} 頁資料`);
  
  // 爬取所有頁面（限制最多 50 頁作為測試）
  const maxPages = Math.min(totalPages, 50);
  const allRecords = [];
  
  // 解析第一頁
  const firstPageRecords = parseCrcPage(firstPage);
  allRecords.push(...firstPageRecords);
  console.log(`✅ 第 1/${maxPages} 頁：${firstPageRecords.length} 筆`);
  
  // 爬取剩餘頁面
  for (let page = 2; page <= maxPages; page++) {
    const html = await fetchCrcPage(page);
    if (html) {
      const records = parseCrcPage(html);
      allRecords.push(...records);
      console.log(`✅ 第 ${page}/${maxPages} 頁：${records.length} 筆`);
    }
    // 避免請求過快
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`\n📊 CRC 共爬取 ${allRecords.length} 筆資料`);
  
  // 輸出前 5 筆資料作為範例
  console.log('\n範例資料：');
  allRecords.slice(0, 5).forEach((r, i) => {
    console.log(`  ${i+1}. ${r.city} | ${r.name} | ${r.violation.substring(0, 30)}... | ${r.date}`);
  });
  
  // 將資料寫入 JSON 檔案供後續處理
  const fs = await import('fs');
  fs.writeFileSync('/tmp/crc_data.json', JSON.stringify(allRecords, null, 2));
  console.log('\n✅ 資料已儲存到 /tmp/crc_data.json');
  
  console.log('\n' + '='.repeat(60));
  console.log('同步完成！');
  console.log('='.repeat(60));
}

main().catch(console.error);
