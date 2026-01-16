// @ts-nocheck
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import puppeteer from "puppeteer"; 
import nodemailer from "nodemailer"; 

// 引入資料庫操作
import { insertReport } from "./db";

// 引入爬蟲模組
import { searchCRC } from "./crcScraper";
import { searchYahoo } from "./newsScraper";

// ============================================================
// 📧 設定郵件傳送器 (安全性升級版)
// ============================================================
// 現在這裡會自動去讀取 .env 檔案或是雲端平台的環境變數
const gmailUser = process.env.GMAIL_USER;
const gmailPass = process.env.GMAIL_PASS;

// 檢查一下有沒有設定，如果沒設定在終端機印出警告
if (!gmailUser || !gmailPass) {
  console.warn("⚠️ 警告: 未偵測到 GMAIL_USER 或 GMAIL_PASS 環境變數，郵件功能將無法運作。");
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: gmailUser, 
    pass: gmailPass            
  }
});

// 設定通報通知的收件人
const NOTIFY_EMAILS = [
  "a09552871010731@gmail.com", // 陳渝淇
  "crazy555059@gmail.com"      // 陳昇浩
];

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============================================================
  // 🔍 搜尋路由 (爬蟲核心)
  // ============================================================
  search: router({
    cases: publicProcedure
      .input(z.object({
        name: z.string().optional(),
        area: z.string().optional(),
        limit: z.number().optional().default(15),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        const { name, area } = input;
        let finalResults = [];

        if (name && name.trim()) {
          console.log(`🚀 [Pro重構版] 啟動多工爬蟲: ${name} (地區: ${area || '全部'})`);
          
          let browser;
          try {
            // 部署時需注意：雲端環境通常需要特定的 Puppeteer 設定
            browser = await puppeteer.launch({
              headless: "new", 
              args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--window-size=1280,900',
                '--disable-popup-blocking',
                '--disable-notifications',
                '--disable-dev-shm-usage' // 雲端環境通常需要這行以避免崩潰
              ]
            });

            const page = await browser.newPage();
            page.on('popup', async popup => await popup.close());

            // 1. 官方 CRC
            const crcData = await searchCRC(page, name);
            crcData.forEach((item, idx) => {
              finalResults.push({
                case: {
                  id: `crc-${idx}`, maskedName: item.name, location: item.county,
                  description: `【衛福部裁罰】${item.law}`, caseDate: item.date,
                  sourceLink: "https://crc.sfaa.gov.tw/ChildYoungLaw/Sanction",
                  sourceType: "政府公告", riskTags: ["官方裁罰", "兒少保護"], verified: true
                }, similarity: 100, matchType: 'exact'
              });
            });

            // 2. Yahoo 查詢
            const tasks = [
              { type: 'jud', name: '司法院資料庫', query: `site:judgment.judicial.gov.tw "${name}"`, strict: false },
              { type: 'ece', name: '全國教保網', query: `site:ap.ece.moe.edu.tw "${name}"`, strict: false },
              { type: 'news', name: '媒體社群', query: `"${name}" (涉嫌 OR 違法 OR 裁罰 OR 虐童 OR 起訴 OR 判決 OR 幼兒園)`, strict: true }
            ];

            for (const task of tasks) {
                const items = await searchYahoo(page, task.name, task.query, 5, task.strict);
                items.forEach((item, idx) => {
                    let sourceType = "媒體報導", riskTags = ["僅供參考"], verified = false, location = "網路消息";
                    if (task.type === 'jud') { sourceType = "政府公告"; riskTags = ["司法紀錄"]; verified = true; location = "司法機關"; }
                    else if (task.type === 'ece') { sourceType = "政府公告"; riskTags = ["幼教裁罰"]; verified = true; location = "幼教機構"; }

                    finalResults.push({
                        case: {
                            id: `${task.type}-${idx}`, maskedName: name, location: location,
                            description: `【${task.name}】${item.snippet}`, caseDate: "相關報導",
                            sourceLink: item.link, sourceType: sourceType, riskTags: riskTags, verified: verified
                        }, similarity: task.type === 'news' ? 80 : 100, matchType: task.type === 'news' ? 'medium' : 'exact'
                    });
                });
                await new Promise(r => setTimeout(r, 1000));
            }
            await browser.close();
          } catch (error) {
            console.error("爬蟲總控台出錯:", error);
            if (browser) await browser.close();
          }
        }

        if (area && area !== "全部地區") {
            finalResults = finalResults.filter(r => {
                if (r.case.id.startsWith('crc-')) {
                    return r.case.location.includes(area) || r.case.location.includes("相關地區");
                }
                return true; 
            });
        }

        return {
          found: finalResults.length > 0, searchedName: name || '', total: finalResults.length, hasMore: false, results: finalResults,
          disclaimer: "⚠️ 搜尋結果包含政府公開紀錄（精確）與媒體社群內容（模糊），資料僅供參考。"
        };
      }),

    areas: publicProcedure.query(async () => [
      '全部地區', '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市', '基隆市', '新竹市', '嘉義市',
      '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義縣', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'
    ]),
    
    stats: publicProcedure.query(async () => ({ totalSearches: 1, popularKeywords: [] })),
  }),
  
  // ============================================================
  // 📢 通報路由 (容錯版：資料庫連不上也能寄信)
  // ============================================================
  report: router({
    submit: publicProcedure
      .input(z.object({
        suspectName: z.string().min(1, "請輸入被通報人姓名"),
        location: z.string().optional(),
        description: z.string().min(10, "描述內容太短，請提供更多細節（至少 10 字）"),
      }))
      .mutation(async ({ ctx, input }) => {
        // 1. 抓取 IP
        const forwarded = ctx.req.headers['x-forwarded-for'];
        const ip = typeof forwarded === 'string' ? forwarded.split(/, /)[0] : ctx.req.socket.remoteAddress;

        // 2. 嘗試寫入資料庫 (用 try-catch 包起來，失敗不中斷)
        try {
            await insertReport({
              suspectName: input.suspectName,
              location: input.location || null,
              description: input.description,
              status: 'pending',
              reporterIp: ip || 'unknown',
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            console.log("✅ 資料庫存檔成功");
        } catch (dbError) {
            console.warn("⚠️ 本地無資料庫連線，跳過存檔步驟 (不影響發信)");
        }

        // 3. 發送 Email 通知
        try {
            if (!gmailUser || !gmailPass) {
                throw new Error("伺服器未設定 Email 帳號密碼 (環境變數缺失)");
            }

            console.log(`📨 準備發送通報信給: ${NOTIFY_EMAILS.join(", ")}`);
            await transporter.sendMail({
                from: '"兒少守護小蜂" <notify@child-guardian.com>', 
                to: NOTIFY_EMAILS.join(", "), 
                subject: `[新通報] 兒少守護小蜂 - 被通報人：${input.suspectName}`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px; max-width: 600px;">
                        <h2 style="color: #d97706; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">🐝 收到新的通報案件</h2>
                        <p style="font-size: 16px;"><strong>被通報人：</strong> <span style="color: #d32f2f;">${input.suspectName}</span></p>
                        <p><strong>地點：</strong> ${input.location || '未提供'}</p>
                        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 15px 0;">
                            <p style="margin: 0; color: #555;"><strong>詳細描述：</strong></p>
                            <p style="margin-top: 5px; white-space: pre-wrap;">${input.description}</p>
                        </div>
                        <p style="color: #888; font-size: 12px; margin-top: 20px;">
                            來自 IP: ${ip} | 接收時間: ${new Date().toLocaleString('zh-TW')}
                            <br>(⚠️ 注意：此為測試模式，若資料庫未連線，資料僅以 Email 通知，未存檔)
                        </p>
                    </div>
                `
            });
            console.log("✅ 通報信發送成功！");
        } catch (mailError) {
            console.error("❌ 寄信失敗:", mailError);
            throw new Error("寄信失敗，請檢查伺服器 Gmail 設定");
        }

        return { success: true, message: "通報已收到！(Email 通知已發送)" };
      }),

    // 其他後台管理接口
    pending: protectedProcedure.query(async () => []), 
    all: protectedProcedure.query(async () => []), 
    exportToGoogleDrive: protectedProcedure.mutation(async () => { throw new Error("尚未實作"); }), 
    review: protectedProcedure.mutation(async () => ({ success: true })) 
  }),

  // 其他路由保持不變
  map: router({ cases: publicProcedure.query(async () => []), stats: publicProcedure.query(async () => []) }),
  judicial: router({ status: publicProcedure.query(() => ({ available: true })) }),
  database: router({ lastUpdate: publicProcedure.query(async () => ({ lastUpdateTime: new Date(), totalCases: 0, sources: [] })) }),
  sync: router({ logs: protectedProcedure.query(async () => []), trigger: protectedProcedure.mutation(async () => ({ success: true })) }),
  news: router({ status: publicProcedure.query(() => ({ available: true })), preview: publicProcedure.query(async () => ({ count: 0, items: [] })), syncWithAI: protectedProcedure.mutation(async () => ({ success: true })) }),
  gov: router({ status: publicProcedure.query(() => ({ available: true })) }),
});

export type AppRouter = typeof appRouter;