// server/routers.ts
import { COOKIE_NAME, getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";

// ✅ 1. 引入新版資料庫與 Schema (絕對路徑指向 src/server)
import * as dbModule from "../src/server/db"; 
import { cases, dataSyncLogs } from "../src/server/schema"; 
import { desc, eq, isNotNull, sql } from "drizzle-orm";

// ⚠️ 舊的爬蟲模組建議先註解，避免因為檔案缺失導致伺服器無法啟動
// import * as judicialApi from "./judicialApi";
// import * as newsScraper from "./newsScraper";
// import * as govDataScraper from "./govDataScraper";

// 取得資料庫連線實體
const db = dbModule.db;

export const appRouter = router({
  system: systemRouter,
  
  // Auth 相關保留不變
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  search: router({
    // 🔥【修復】地區列表：讓下拉選單抓得到資料庫裡的縣市
    areas: publicProcedure.query(async () => {
      try {
        if (!db) throw new Error("Database not initialized");
        
        const result = await db
          .selectDistinct({ location: cases.location })
          .from(cases)
          .where(isNotNull(cases.location));
        
        // 過濾掉全台、網路等非實體地點
        const locations = result
          .map(r => r.location)
          .filter((l): l is string => {
             return typeof l === 'string' && 
                    l.length > 0 && 
                    l !== '全台' && 
                    l !== '網路' &&
                    l !== '台灣';
          })
          .sort();
        
        return ['全部地區', ...locations];
      } catch (error) {
        console.error("❌ 抓取地點失敗:", error);
        return ['全部地區'];
      }
    }),

    // 🔥【修復】最後更新時間
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

    // 🔥【核心】搜尋邏輯
    cases: publicProcedure
      .input(z.object({
        name: z.string().optional(),
        area: z.string().optional(),
        district: z.string().optional(),
        violationType: z.string().optional(),
        limit: z.number().optional().default(15),
        offset: z.number().optional().default(0),
      }))
      .query(async ({ input }) => {
        const { name, area, district, violationType, limit, offset } = input;
        
        // 1. (已移除) 即時爬蟲：為了速度與穩定，我們現在全靠 DB
        // 我們剛剛跑過 runAll，資料庫裡已經有最新的資料了，不需要再即時爬
        
        // 2. 從資料庫搜尋結果
        const { results: dbResults } = await dbModule.searchCases({ 
          name, area, district, violationType, limit, offset 
        });
        
        // 3. 計算相似度排序 (加上 matchType 讓前端顯示綠色勾勾)
        const resultsWithSimilarity = dbResults.map((caseItem: any) => {
          let similarity = 0;
          let matchType = 'medium';
          
          if (name && name.trim()) {
            // 呼叫我們改成同步的 calculateSimilarity
            similarity = dbModule.calculateSimilarity(name, caseItem.maskedName || caseItem.name || '');
            
            // 簡單判斷邏輯
            if (similarity >= 95) matchType = 'exact';
            else if (similarity >= 50) matchType = 'high';
            else matchType = 'medium';
          }
          return { case: caseItem, similarity, matchType };
        });
        
        // 如果有搜名字，按照相似度排序
        if (name && name.trim()) {
          resultsWithSimilarity.sort((a: any, b: any) => b.similarity - a.similarity);
        }
        
        // 4. 寫入搜尋紀錄 (不等待)
        dbModule.logSearch({
          searchedName: name || '',
          searchedArea: area,
          foundResults: resultsWithSimilarity.length > 0,
          resultCount: resultsWithSimilarity.length,
        }).catch(() => {});
        
        return {
          found: resultsWithSimilarity.length > 0,
          searchedName: name || '',
          searchedArea: area,
          total: resultsWithSimilarity.length,
          hasMore: false,
          results: resultsWithSimilarity,
          disclaimer: resultsWithSimilarity.length > 0 
            ? "⚠️ 本結果包含歷史裁罰紀錄與新聞，請點擊連結查證。"
            : "✅ 目前資料庫中未發現相符紀錄。",
        };
      }),

    stats: publicProcedure.query(async () => {
      return await dbModule.getSearchStats();
    }),
  }),

  // 地圖模式用
  map: router({
    cases: publicProcedure.query(async () => { return await dbModule.getAllCases(); }),
    stats: publicProcedure.query(async () => { return await dbModule.getCaseCountByLocation(); }),
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
        await dbModule.insertReport({
          suspectName: input.suspectName,
          location: input.location,
          description: input.description,
          attachments: input.attachments ? JSON.stringify(input.attachments) : null,
          reporterIp,
          status: 'pending',
        });
        return { success: true, message: "通報已送出" };
      }),

    pending: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') return [];
      return await dbModule.getPendingReports();
    }),
  }),

  // 網頁頂端狀態資訊
  database: router({
    lastUpdate: publicProcedure.query(async () => {
      try {
        const logs = await db
            .select()
            .from(dataSyncLogs)
            .where(eq(dataSyncLogs.status, 'success'))
            .orderBy(desc(dataSyncLogs.completedAt))
            .limit(1);

        const caseCount = await dbModule.getCaseCount(); 
        return {
            lastUpdateTime: logs.length > 0 ? logs[0].completedAt : null,
            totalCases: caseCount,
            sources: ['全國教保資訊網', '司法院裁判書', '新聞媒體'],
        };
      } catch (e) {
         return { lastUpdateTime: null, totalCases: 0, sources: [] };
      }
    }),
  }),

  // 佔位符：確保前端呼叫這些不會報錯
  sync: router({
     trigger: publicProcedure.input(z.object({ source: z.string() })).mutation(() => ({ success: true }))
  }),
  judicial: router({ status: publicProcedure.query(() => ({ ok: true })) }),
  news: router({ status: publicProcedure.query(() => ({ ok: true })) }),
  gov: router({ status: publicProcedure.query(() => ({ ok: true })) }),
});

export type AppRouter = typeof appRouter;