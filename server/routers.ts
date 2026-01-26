// server/routers.ts
import { COOKIE_NAME, getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";

// ✅ 引入新版資料庫與 Schema (指向 src/server)
import * as dbModule from "../src/server/db"; 
import { cases, dataSyncLogs } from "../src/server/schema"; 
import { desc, eq, isNotNull, like, or, and, sql } from "drizzle-orm";

// 🔥【路徑修正】正確指向 src/server/_core/mailer
import { sendNotificationEmail } from "../src/server/_core/mailer"; 

const db = dbModule.db;

export const appRouter = router({
  system: systemRouter,
  
  // Auth 保持不變
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  search: router({
    // 地區列表
    areas: publicProcedure.query(async () => {
      try {
        if (!db) throw new Error("Database not initialized");
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
      } catch (error) {
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
      } catch (error) {
          return { lastUpdateTime: null };
      }
    }),

    // 🔥【核心】智慧搜尋邏輯
    cases: publicProcedure
      .input(z.object({
        name: z.string().optional(),
        area: z.string().optional(),
        limit: z.number().optional().default(15),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        const { name, area, limit, offset } = input;
        
        // 1. 關鍵字智慧擴充
        let searchTerms: string[] = [];
        let hasConverted = false;

        if (name && name.trim()) {
            const cleanName = name.trim();
            searchTerms.push(cleanName);

            // (A) 幼稚園 <-> 幼兒園
            if (cleanName.includes('幼稚園')) {
                searchTerms.push(cleanName.replace(/幼稚園/g, '幼兒園'));
                hasConverted = true;
            }
            if (cleanName.includes('幼兒園')) {
                searchTerms.push(cleanName.replace(/幼兒園/g, '幼稚園'));
            }
            
            // (B) 台 <-> 臺
            if (cleanName.includes('台')) searchTerms.push(cleanName.replace(/台/g, '臺'));
            if (cleanName.includes('臺')) searchTerms.push(cleanName.replace(/臺/g, '台'));
        }

        searchTerms = [...new Set(searchTerms)];

        // 2. 建構 Where 條件
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

        const whereClause = and(areaCondition, nameCondition);

        // 3. 查詢資料庫
        const results = await db.select()
            .from(cases)
            .where(whereClause)
            .limit(limit)
            .offset(offset)
            .orderBy(desc(cases.caseDate));

        const hasMore = results.length === limit;

        // 4. 回傳結果與提示
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
          results: results.map(c => ({ case: c, matchType: 'normal' })),
          disclaimer
        };
      }),
  }),

  // 🔥【通報系統】
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
        
        // 1. 寫入資料庫
        await dbModule.insertReport({
          suspectName: input.suspectName,
          location: input.location,
          description: input.description,
          attachments: input.attachments ? JSON.stringify(input.attachments) : null,
          reporterIp,
          status: 'pending',
        });

        // 2. 寄信通知
        await sendNotificationEmail({
            suspectName: input.suspectName,
            location: input.location,
            description: input.description,
            reporterIp
        });

        return { success: true, message: "通報已送出，感謝您的勇敢發聲！" };
      }),

    pending: protectedProcedure.query(async ({ ctx }) => {
      return await dbModule.getPendingReports();
    }),
  }),

  // 其他路由
  database: router({
    lastUpdate: publicProcedure.query(async () => {
      try {
        const logs = await db.select().from(dataSyncLogs).where(eq(dataSyncLogs.status, 'success')).orderBy(desc(dataSyncLogs.completedAt)).limit(1);
        const caseCount = await dbModule.getCaseCount(); 
        return { lastUpdateTime: logs[0]?.completedAt, totalCases: caseCount };
      } catch (e) { return { lastUpdateTime: null, totalCases: 0 }; }
    }),
  }),

  map: router({ cases: publicProcedure.query(async () => { return []; }), stats: publicProcedure.query(async () => { return []; }) }),
  sync: router({ trigger: publicProcedure.mutation(() => ({ success: true })) }),
  judicial: router({ status: publicProcedure.query(() => ({ ok: true })) }),
  news: router({ status: publicProcedure.query(() => ({ ok: true })) }),
  gov: router({ status: publicProcedure.query(() => ({ ok: true })) }),
});

export type AppRouter = typeof appRouter;