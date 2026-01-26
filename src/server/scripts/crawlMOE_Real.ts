// src/server/scripts/crawlMOE_Real.ts
import 'dotenv/config';
import { db } from '../db';
import { cases } from '../schema'; 
import { eq } from 'drizzle-orm';

const URL_113 = 'https://stats.moe.gov.tw/files/school/113/k1_new.csv';
const URL_112 = 'https://stats.moe.gov.tw/files/school/112/k1_new.csv';

async function fetchOpenDataNoLib() {
  console.log('🏫 [教育部] 啟動 Open Data 爬蟲 (智慧編碼版)...');
  
  try {
    let csvText = await downloadAndSmartDecode(URL_113);
    if (!csvText) {
        console.log(`⚠️ 113學年失敗，嘗試 112...`);
        csvText = await downloadAndSmartDecode(URL_112);
    }

    if (!csvText) {
        throw new Error('❌ 所有連結皆失效。');
    }

    await processCSV(csvText);

  } catch (error: any) {
    console.error('❌ 發生錯誤:', error.message);
  }
}

// 🔥 核心修正：智慧切換編碼 (UTF-8 優先，失敗才轉 Big5)
async function downloadAndSmartDecode(url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        
        const arrayBuffer = await response.arrayBuffer();
        
        // 1. 先嘗試 UTF-8 (現代標準)
        const decoderUtf8 = new TextDecoder('utf-8');
        const textUtf8 = decoderUtf8.decode(arrayBuffer);
        
        // 檢查關鍵字：如果解出來有「學校」或「名稱」，代表 UTF-8 是對的
        if (textUtf8.includes('學校') || textUtf8.includes('名稱') || textUtf8.includes('縣市')) {
            console.log("✅ 偵測到編碼格式：UTF-8");
            return textUtf8;
        }

        // 2. 如果上面失敗，嘗試 Big5 (傳統格式)
        console.log("⚠️ UTF-8 解析失敗，嘗試 Big5...");
        const decoderBig5 = new TextDecoder('big5');
        const textBig5 = decoderBig5.decode(arrayBuffer);
        
        if (textBig5.includes('學校') || textBig5.includes('名稱')) {
            console.log("✅ 偵測到編碼格式：Big5");
            return textBig5;
        }

        return null; // 都失敗
    } catch (e) {
        return null;
    }
}

async function processCSV(csvText: string) {
    // 移除 BOM
    const cleanText = csvText.replace(/^\ufeff/, '');
    const lines = cleanText.split(/\r?\n/).filter(line => line.trim() !== '');
    
    if (lines.length === 0) return;

    // 分析標題
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    console.log("🔍 成功解析標題:", headers);

    const idxName = headers.findIndex(h => h.includes('名稱') || h.includes('學校'));
    const idxCity = headers.findIndex(h => h.includes('縣市') || h.includes('地址'));
    const idxAddr = headers.findIndex(h => h.includes('地址') || h.includes('園址'));

    if (idxName === -1) {
        console.error("❌ 找不到名稱欄位，請檢查標題內容。");
        return;
    }
    
    console.log(`📦 取得學校清單：約 ${lines.length - 1} 筆，開始匯入...`);
    let newCount = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const cols = line.split(',');

        // 簡易 CSV 解析 (處理引號)
        const rawName = cols[idxName]?.replace(/"/g, '').trim();
        const rawCity = cols[idxCity]?.replace(/"/g, '').trim();
        const rawAddr = cols[idxAddr]?.replace(/"/g, '').trim();

        // 補強縣市欄位
        let finalCity = rawCity;
        if ((!finalCity || finalCity.length === 0) && rawAddr && rawAddr.length > 3) {
            finalCity = rawAddr.substring(0, 3);
        }

        if (!rawName) continue;

        const uniqueId = `MOE_${rawName}_${finalCity || '全台'}`;
        
        try {
            const existing = await db.select().from(cases).where(eq(cases.sourceLink, uniqueId));

            if (existing.length === 0) {
                await db.insert(cases).values({
                    maskedName: rawName, 
                    name: rawName,       
                    originalName: rawName,
                    role: '幼兒園',
                    riskTags: JSON.stringify(['教育部立案']), 
                    location: finalCity || '全台',
                    caseDate: new Date().toISOString(),
                    description: `地址：${rawAddr || '無資料'}`,
                    sourceType: 'gov_moe',
                    sourceLink: uniqueId,
                    verified: true,
                    createdAt: new Date(),
                });
                newCount++;
                if (newCount % 200 === 0) process.stdout.write("➕");
            }
        } catch (e) {}
    }
    console.log(`\n🎉 教育部資料同步完成！新增 ${newCount} 筆。`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
    fetchOpenDataNoLib();
}