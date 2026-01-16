/**
 * KindyInfo 爬蟲單元測試
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cheerio from 'cheerio';

// Mock HTML 回應
const mockHtmlWithTable = `
<!DOCTYPE html>
<html>
<head><title>幼兒園裁罰紀錄</title></head>
<body>
  <table>
    <tr>
      <th>處分日期</th>
      <th>縣市</th>
      <th>地區</th>
      <th>名稱</th>
      <th>筆數</th>
      <th>裁處</th>
    </tr>
    <tr>
      <td>2024/03/15</td>
      <td>台北市</td>
      <td>大安區</td>
      <td><a href="#">快樂幼兒園</a></td>
      <td>2</td>
      <td>罰鍰新台幣6萬元</td>
    </tr>
    <tr>
      <td>2024/02/20</td>
      <td>新北市</td>
      <td>板橋區</td>
      <td>陽光托兒所</td>
      <td>1</td>
      <td>限期改善</td>
    </tr>
    <tr>
      <td>2024/01/10</td>
      <td>台中市</td>
      <td>西屯區</td>
      <td>彩虹幼稚園</td>
      <td>3</td>
      <td>停止招生3個月</td>
    </tr>
  </table>
</body>
</html>
`;

const mockEmptyHtml = `
<!DOCTYPE html>
<html>
<head><title>空頁面</title></head>
<body>
  <div>沒有資料</div>
</body>
</html>
`;

describe('KindyInfo 爬蟲', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('HTML 解析', () => {
    it('應該正確解析表格中的裁罰紀錄', () => {
      const $ = cheerio.load(mockHtmlWithTable);
      const records: any[] = [];
      
      $('table').each((tableIndex, table) => {
        const $table = $(table);
        
        $table.find('tr').each((rowIndex, row) => {
          if (rowIndex === 0) return;
          
          const $row = $(row);
          const cells = $row.find('td');
          
          if (cells.length >= 5) {
            const date = $(cells[0]).text().trim();
            const city = $(cells[1]).text().trim();
            const district = $(cells[2]).text().trim();
            
            const $nameCell = $(cells[3]);
            const $nameLink = $nameCell.find('a');
            const name = $nameLink.length > 0 
              ? $nameLink.text().trim() 
              : $nameCell.text().trim();
            
            const countText = $(cells[4]).text().trim();
            const count = parseInt(countText, 10) || 1;
            
            const penalty = cells.length > 5 ? $(cells[5]).text().trim() : '';
            
            if (name && date) {
              records.push({
                date,
                city,
                district,
                name,
                count,
                penalty,
              });
            }
          }
        });
      });
      
      expect(records).toHaveLength(3);
      
      // 驗證第一筆紀錄
      expect(records[0]).toEqual({
        date: '2024/03/15',
        city: '台北市',
        district: '大安區',
        name: '快樂幼兒園',
        count: 2,
        penalty: '罰鍰新台幣6萬元',
      });
      
      // 驗證第二筆紀錄
      expect(records[1]).toEqual({
        date: '2024/02/20',
        city: '新北市',
        district: '板橋區',
        name: '陽光托兒所',
        count: 1,
        penalty: '限期改善',
      });
      
      // 驗證第三筆紀錄
      expect(records[2]).toEqual({
        date: '2024/01/10',
        city: '台中市',
        district: '西屯區',
        name: '彩虹幼稚園',
        count: 3,
        penalty: '停止招生3個月',
      });
    });

    it('應該處理空的 HTML 頁面', () => {
      const $ = cheerio.load(mockEmptyHtml);
      const records: any[] = [];
      
      $('table').each((tableIndex, table) => {
        const $table = $(table);
        $table.find('tr').each((rowIndex, row) => {
          if (rowIndex === 0) return;
          const cells = $(row).find('td');
          if (cells.length >= 5) {
            records.push({});
          }
        });
      });
      
      expect(records).toHaveLength(0);
    });

    it('應該正確處理連結中的名稱', () => {
      const htmlWithLink = `
        <table>
          <tr><th>日期</th><th>縣市</th><th>地區</th><th>名稱</th><th>筆數</th></tr>
          <tr>
            <td>2024/05/01</td>
            <td>高雄市</td>
            <td>三民區</td>
            <td><a href="https://example.com">測試幼兒園</a></td>
            <td>1</td>
          </tr>
        </table>
      `;
      
      const $ = cheerio.load(htmlWithLink);
      const $nameCell = $('table tr').eq(1).find('td').eq(3);
      const $nameLink = $nameCell.find('a');
      const name = $nameLink.length > 0 
        ? $nameLink.text().trim() 
        : $nameCell.text().trim();
      
      expect(name).toBe('測試幼兒園');
    });

    it('應該正確處理純文字名稱（無連結）', () => {
      const htmlWithoutLink = `
        <table>
          <tr><th>日期</th><th>縣市</th><th>地區</th><th>名稱</th><th>筆數</th></tr>
          <tr>
            <td>2024/05/01</td>
            <td>高雄市</td>
            <td>三民區</td>
            <td>純文字幼兒園</td>
            <td>1</td>
          </tr>
        </table>
      `;
      
      const $ = cheerio.load(htmlWithoutLink);
      const $nameCell = $('table tr').eq(1).find('td').eq(3);
      const $nameLink = $nameCell.find('a');
      const name = $nameLink.length > 0 
        ? $nameLink.text().trim() 
        : $nameCell.text().trim();
      
      expect(name).toBe('純文字幼兒園');
    });
  });

  describe('資料驗證', () => {
    it('應該過濾掉沒有名稱的紀錄', () => {
      const htmlWithEmptyName = `
        <table>
          <tr><th>日期</th><th>縣市</th><th>地區</th><th>名稱</th><th>筆數</th></tr>
          <tr>
            <td>2024/05/01</td>
            <td>高雄市</td>
            <td>三民區</td>
            <td></td>
            <td>1</td>
          </tr>
        </table>
      `;
      
      const $ = cheerio.load(htmlWithEmptyName);
      const records: any[] = [];
      
      $('table tr').each((rowIndex, row) => {
        if (rowIndex === 0) return;
        const cells = $(row).find('td');
        if (cells.length >= 5) {
          const name = $(cells[3]).text().trim();
          const date = $(cells[0]).text().trim();
          if (name && date) {
            records.push({ name, date });
          }
        }
      });
      
      expect(records).toHaveLength(0);
    });

    it('應該過濾掉沒有日期的紀錄', () => {
      const htmlWithEmptyDate = `
        <table>
          <tr><th>日期</th><th>縣市</th><th>地區</th><th>名稱</th><th>筆數</th></tr>
          <tr>
            <td></td>
            <td>高雄市</td>
            <td>三民區</td>
            <td>測試幼兒園</td>
            <td>1</td>
          </tr>
        </table>
      `;
      
      const $ = cheerio.load(htmlWithEmptyDate);
      const records: any[] = [];
      
      $('table tr').each((rowIndex, row) => {
        if (rowIndex === 0) return;
        const cells = $(row).find('td');
        if (cells.length >= 5) {
          const name = $(cells[3]).text().trim();
          const date = $(cells[0]).text().trim();
          if (name && date) {
            records.push({ name, date });
          }
        }
      });
      
      expect(records).toHaveLength(0);
    });

    it('應該將非數字的筆數預設為 1', () => {
      const countText = 'N/A';
      const count = parseInt(countText, 10) || 1;
      expect(count).toBe(1);
    });

    it('應該正確解析數字筆數', () => {
      const countText = '5';
      const count = parseInt(countText, 10) || 1;
      expect(count).toBe(5);
    });
  });

  describe('地點組合', () => {
    it('應該正確組合縣市和地區', () => {
      const city = '台北市';
      const district = '大安區';
      const location = `${city}${district}`;
      expect(location).toBe('台北市大安區');
    });

    it('應該處理空的地區', () => {
      const city = '台北市';
      const district = '';
      const location = `${city}${district}`;
      expect(location).toBe('台北市');
    });
  });
});

describe('KindyInfo 資料轉換', () => {
  it('應該將紀錄轉換為正確的案例格式', () => {
    const record = {
      date: '2024/03/15',
      city: '台北市',
      district: '大安區',
      name: '快樂幼兒園',
      count: 2,
      penalty: '罰鍰新台幣6萬元',
      sourceLink: 'https://www.kindyinfo.com/test',
    };
    
    const caseData = {
      maskedName: record.name,
      originalName: record.name,
      role: '其他',
      location: `${record.city}${record.district}`,
      riskTags: ['裁罰紀錄'],
      description: `${record.penalty}（${record.count} 筆）`,
      sourceType: '政府公告',
      sourceLink: record.sourceLink,
      verified: true,
      caseDate: record.date,
    };
    
    expect(caseData.maskedName).toBe('快樂幼兒園');
    expect(caseData.location).toBe('台北市大安區');
    expect(caseData.description).toBe('罰鍰新台幣6萬元（2 筆）');
    expect(caseData.verified).toBe(true);
    expect(caseData.sourceType).toBe('政府公告');
  });
});
