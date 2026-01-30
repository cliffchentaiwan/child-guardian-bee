// src/server/routers.ts
import { COOKIE_NAME, getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { promisify } from 'util';
import { exec } from 'child_process';

// ✅ 路徑修正
import { db } from "./db"; 
import { cases, dataSyncLogs, reports } from "../src/server/schema"; 
// 🔥【路徑修正】正確指向同層級或上層
import { sendNotificationEmail } from "./_core/mailer"; 

import { desc, eq, isNotNull, like, or, and, sql } from "drizzle-orm";

// 設定異步執行的 exec
const execAsync = promisify(exec);

// 🕷️ 爬蟲指令清單 (Gemini CLI 建議的四個關鍵檔案)
const scraperCommands = [
  // 1. 新聞爬蟲
  { name: 'News', command: 'npx tsx src/server/scripts/crawlNews_Final.ts' },
  // 2. CRC 兒少裁罰 (衛福部)
  { name: 'CRC', command: 'npx tsx src/server/scripts/crawlCRC_Real.ts' },
  // 3. ECE 教保網 (彈窗破解版)
  { name: 'ECE', command: 'npx tsx src/server/scripts/crawlECE_Popup.ts' },
  // 4. 司法院 (需要人工驗證碼，自動跑可能會超時，但手動按按鈕可以試試)
  { name: 'Judicial', command: 'npx tsx src/server/scripts/crawlJudicial_Real.ts' },
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

  // 🔥 新增：手動同步指令 (manualSyncAll)
  manualSyncAll: publicProcedure
    .mutation(async () => {
      console.log('🤖 [API] 收到請求：開始依序執行所有爬蟲...');

      const executionLogs: { source: string; status: string; output?: string; error?: string }[] = [];

      // 使用 for...of 迴圈確保「一個跑完才跑下一個」，避免塞爆伺服器
      for (const scraper of scraperCommands) {
        console.log(`▶️ 正在執行: ${scraper.name}...`);
        try {
          // 設定 timeout 為 15 分鐘，避免卡死
          const { stdout, stderr } = await execAsync(scraper.command, {
            timeout: 1000 * 60 * 15, 
          });

          if (stderr) console.error(`[${scraper.name}] 警告/錯誤:`, stderr);
          console.log(`[${scraper.name}] 完成:`, stdout.slice(0, 200) + '...'); // 只印出前200字避免 log 太長

          executionLogs.push({
            source: scraper.name,
            status: 'success',
            output: '執行成功 (詳見 Server Logs)',
          });

        } catch (error: any) {
          console.error(`❌ [${scraper.name}] 執行失敗:`, error.message);
          // 如果是司法院爬蟲超時，我們也把它記錄下來，但不中斷流程
          executionLogs.push({
            source: scraper.name,
            status: 'failed',
            error: error.message,
          });
        }
      }

      console.log('✅ 所有爬蟲腳本執行完畢。');

      return {
        message: '所有爬蟲已依序執行完畢',
        report: executionLogs,
      };
    }),

  search: router({
    // 地區列表
    areas: publicProcedure.query(async () => {
      try {
        const result = await db
          .selectDistinct({ location: cases.location })
          .from(cases)
          .where(isNotNull(cases.location));
        
        const locations = result
          .map(r => r.location)
          .filter((l): l is string => {
             return typeof l === 'string' && l.length > 0 && l !== '全台' && l !== '網路' && l !== '台灣';
          })
          .sort();
        return ['全部地區', ...locations];
      } catch (error: any) {
        console.error("❌ 讀取地區失敗:", error.message);
        return ['全部地區'];
      }
    }),

    // 最後更新時間
    getLastUpdate: publicProcedure.query(async () => {
      try {
        const logs = await db
            .select()
            .from(dataSyncLogs)
            .where(eq(dataSyncLogs.status, 'success'))
            .orderBy(desc(dataSyncLogs.completedAt))
            .limit(1);
        return { lastUpdateTime: logs.length > 0 ? logs[0].completedAt : null };
      } catch (error: any) {
          console.error("❌ 讀取更新時間失敗:", error.message);
          return { lastUpdateTime: null };
      }
    }),

    // 智慧搜尋邏輯
    cases: publicProcedure
      .input(z.object({
        name: z.string().optional(),
        area: z.string().optional(),
        limit: z.number().optional().default(15),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        const { name, area, limit, offset } = input;
        
        let searchTerms: string[] = [];
        let hasConverted = false;

        if (name && name.trim()) {
            const cleanName = name.trim();
            searchTerms.push(cleanName);

            if (cleanName.includes('幼稚園')) {
                searchTerms.push(cleanName.replace(/幼稚園/g, '幼兒園'));
                hasConverted = true;
            }
            if (cleanName.includes('幼兒園')) {
                searchTerms.push(cleanName.replace(/幼兒園/g, '幼稚園'));
            }
            
            if (cleanName.includes('台')) searchTerms.push(cleanName.replace(/台/g, '臺'));
            if (cleanName.includes('臺')) searchTerms.push(cleanName.replace(/臺/g, '台'));
        }

        searchTerms = [...new Set(searchTerms)];

        const nameCondition = searchTerms.length > 0 ? or(
            ...searchTerms.flatMap(term => [
                like(cases.name, `%${term}%`),
                like(cases.maskedName, `%${term}%`),
                like(cases.originalName, `%${term}%`)
            ])
        ) : undefined;

        const areaCondition = (area && area !== '全部地區') 
            ? like(cases.location, `%${area}%`) 
            : undefined;

        // 🧠 全新搜尋策略：主關聯性篩選器
        // 條件1: 內容本身與兒少相關 (適用於新聞、司法等)
        const childSafetyKeywords = ['兒', '童', '幼', '學生', '教保', '校', '師', '教練', '學童', '學員', '嬰'];
        const contentIsRelevantCondition = or(
            ...childSafetyKeywords.map(keyword => like(cases.description || '', `%${keyword}%`)),
            ...childSafetyKeywords.map(keyword => like(cases.name || '', `%${keyword}%`))
        );

        // 條件2: 來源本身就與兒少高度相關 (教保網、衛福部)
        const sourceIsRelevantCondition = or(
            eq(cases.source, '教保網'),
            eq(cases.source, '衛福部裁罰')
        );
        
        const whereClause = and(
            areaCondition,
            nameCondition
        );

        try {
            const results = await db.select()
                .from(cases)
                .where(whereClause)
                .limit(limit)
                .offset(offset)
                .orderBy(desc(cases.caseDate));

            const hasMore = results.length === limit;

            let disclaimer = undefined;
            if (results.length === 0 && name) {
                if (hasConverted) {
                    disclaimer = `關於「${name}」及其同義詞（如：${searchTerms[1]}），目前未發現違規紀錄。`;
                } else {
                    disclaimer = `關於「${name}」，目前未發現違規紀錄。`;
                }
            }

            return {
                found: results.length > 0,
                hasMore,
                results: results.map(c => {
                    let sourceType = 'default';
                    if (c.source === '教保網') sourceType = 'gov_ece';
                    else if (c.source === '衛福部裁罰') sourceType = 'gov_crc';
                    else if (c.source === '媒體報導') sourceType = 'news';
                    else if (c.source === '司法院判決') sourceType = 'judicial';
                    
                    return { 
                        case: { ...c, sourceType }, 
                        matchType: 'normal' 
                    };
                }),
                disclaimer
            };
        } catch (error: any) {
            console.error("❌ 搜尋失敗:", error.message);
            return { found: false, hasMore: false, results: [], disclaimer: "系統連線異常，請稍後再試" };
        }
      }),
  }),

  // 通報系統
  report: router({
    submit: publicProcedure
      .input(z.object({
        suspectName: z.string().min(1, "請輸入被通報人姓名"),
        location: z.string().optional(),
        description: z.string().min(10, "請詳細描述事件"),
        attachments: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const reporterIp = ctx.req.headers['x-forwarded-for'] as string || 'unknown';
        
        try {
            await db.insert(reports).values({
                suspectName: input.suspectName,
                location: input.location,
                description: input.description,
                attachments: input.attachments ? JSON.stringify(input.attachments) : null,
                reporterIp,
                status: 'pending',
                createdAt: new Date(),
            });

            await sendNotificationEmail({
                suspectName: input.suspectName,
                location: input.location,
                description: input.description,
                reporterIp
            });

            return { success: true, message: "通報已送出，感謝您的勇敢發聲！" };
        } catch (error: any) {
            console.error("❌ 通報失敗:", error.message);
            throw new Error("系統繁忙，請稍後再試");
        }
      }),

    pending: protectedProcedure.query(async ({ ctx }) => {
        return [];
    }),
  }),

  // 其他路由
  database: router({
    lastUpdate: publicProcedure.query(async () => {
      try {
        const logs = await db
          .select()
          .from(dataSyncLogs)
          .orderBy(desc(dataSyncLogs.createdAt)) // 使用 createdAt 排序
          .limit(1);
        return { lastUpdateTime: logs[0]?.createdAt, totalCases: 0 }; // 回傳 createdAt
      } catch (e) { return { lastUpdateTime: null, totalCases: 0 }; }
    }),
  }),

  map: router({ cases: publicProcedure.query(async () => { return []; }), stats: publicProcedure.query(async () => { return []; }) }),
  // 保留舊的 sync.trigger 以防前端有其他地方呼叫，但建議改用 manualSyncAll
  sync: router({ trigger: publicProcedure.mutation(() => ({ success: true })) }),
  judicial: router({ status: publicProcedure.query(() => ({ ok: true })) }),
  news: router({ status: publicProcedure.query(() => ({ ok: true })) }),
  gov: router({ status: publicProcedure.query(() => ({ ok: true })) }),
});

export type AppRouter = typeof appRouter;