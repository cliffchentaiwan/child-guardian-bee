// src/server/scripts/crawlJudicial_DeepScan.ts
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const IGNORE_KEYWORDS = [
    '政府', '教育局', '社會局', '法院', '地檢署', '國小', '國中', '高中', '學校', '委員會'
];

function isGovernmentOrSchool(name: string): boolean {
    return IGNORE_KEYWORDS.some(keyword => name.includes(keyword));
}

async function deepScanJudicial() {
  console.log("🕵️‍♂️ 啟動司法院深層掃描 (過濾增強版)...");

  const rawPath = path.join(process.cwd(), 'src', 'server', 'seedData', 'judicial_raw.json');
  if (!fs.existsSync(rawPath)) return;
  const records = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));
  
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  const enrichedData: any[] = [];

  for (let i = 0; i < records.length; i++) {
      const record = records[i];
      process.stdout.write(`\r[${i + 1}/${records.length}] 分析... `);
      
      try {
          // 🔥 過濾 1: 標題如果有「國家賠償」，直接跳過
          if (record.title.includes("國家賠償")) {
              continue; 
          }

          await page.goto(record.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          const content = await page.evaluate(() => document.body.innerText);
          
          // 🔥 擷取優化：嘗試抓取「主文」
          // 判決書通常結構： ...主文...事實...理由...
          let cleanDescription = "";
          const mainTextMatch = content.match(/主\s*文\s*([\s\S]*?)(事實|理\s*由)/);
          if (mainTextMatch && mainTextMatch[1]) {
              // 抓到主文 (例如: "原判決撤銷...", "被告應給付...")
              cleanDescription = "【主文摘要】\n" + mainTextMatch[1].trim().substring(0, 150) + "...";
          } else {
              // 沒抓到主文，抓前 200 字，但去掉開頭的格式廢話
              cleanDescription = content.replace(/^[\s\S]*?裁判案由/, '').substring(0, 150) + "...";
          }

          const plaintiffMatch = content.match(/(?:原\s*告|上\s*訴\s*人|聲\s*請\s*人)\s+([^\s\n,，]+)/);
          const defendantMatch = content.match(/(?:被\s*告|被\s*上\s*訴\s*人|相\s*對\s*人)\s+([^\s\n,，]+)/);

          let targetName = "未知";
          let role = "未知";
          const pName = plaintiffMatch ? plaintiffMatch[1].trim() : "";
          const dName = defendantMatch ? defendantMatch[1].trim() : "";

          // 邏輯: 優先抓被告。如果被告是政府，且原告是個人，這通常是行政訴訟(告政府)，我們不收錄原告(因為他是民眾)
          // 除非確定是刑事案件
          
          if (dName && !isGovernmentOrSchool(dName)) {
              targetName = dName;
              role = "被告";
          } else if (pName && !isGovernmentOrSchool(pName)) {
              // 原告是個人，但被告是政府 -> 極高機率是民眾告政府 -> 跳過
              if (dName && isGovernmentOrSchool(dName)) {
                  // Skip
              } else {
                  targetName = pName;
                  role = "原告";
              }
          }

          if (targetName !== "未知") {
              enrichedData.push({
                  ...record,
                  name: targetName,
                  role: role,
                  fullText: cleanDescription // 存入清洗過的摘要
              });
          }

      } catch (e: any) {}
      await new Promise(r => setTimeout(r, 500));
  }

  const outputPath = path.join(process.cwd(), 'src', 'server', 'seedData', 'judicial_enriched.json');
  fs.writeFileSync(outputPath, JSON.stringify(enrichedData, null, 2));
  console.log(`\n🎉 完成！過濾後剩餘 ${enrichedData.length} 筆有效資料。`);
  await browser.close();
}

deepScanJudicial();