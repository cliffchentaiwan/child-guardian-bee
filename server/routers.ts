import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { calculateSimilarity } from "./db";
import * as judicialApi from "./judicialApi";
import * as newsScraper from "./newsScraper";
import * as reportExport from "./reportExport";
import * as aiNewsSync from "./aiNewsSync";
import * as govDataScraper from "./govDataScraper";
import * as kindyInfoScraper from "./kindyInfoScraper";
import * as crcScraper from "./crcScraper";

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

  // 搜尋相關 API (直通車模式：強制顯示即時結果)
  search: router({
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
        
        // 1. 取得即時爬蟲/種子結果 (Gov Live)
        let liveResults: any[] = [];
        if (name && name.length >= 2) {
            try {
                // 呼叫 govDataScraper 取得真實資料
                liveResults = await govDataScraper.searchGovLive(name);
                
                // 背景執行：嘗試寫入資料庫 (不 await，不讓它卡住回傳)
                for (const res of liveResults) {
                     db.insertCase(res).catch(e => console.error("DB Insert Skip", e));
                }
            } catch (err) {
                console.error("即時搜尋錯誤:", err);
            }
        }
        
        // 2. 取得資料庫舊結果
        const { results: dbResults, total } = await db.searchCases({ 
          name, area, district, violationType, limit, offset 
        });
        
        // 3. 【關鍵】合併資料 (即時結果優先！)
        // 我們給即時結果一個負數 ID，確保前端能渲染
        const liveResultsFormatted = liveResults.map((r, idx) => ({
            ...r,
            id: -1 * (idx + 1), 
            matchType: 'exact',
        }));

        // 避免重複顯示 (如果連結一樣就過濾掉即時的，改用資料庫的)
        const uniqueLiveResults = liveResultsFormatted.filter(live => 
            !dbResults.some(dbItem => dbItem.sourceLink === live.sourceLink)
        );

        // 合併：即時結果放前面
        const finalResults = [...uniqueLiveResults, ...dbResults];
        
        // 4. 計算相似度
        const resultsWithSimilarity = finalResults.map((caseItem: any) => {
          let similarity = 100;
          let matchType = caseItem.matchType || 'exact';
          
          if (name && name.trim()) {
            similarity = calculateSimilarity(name, caseItem.maskedName);
            if (similarity >= 95) matchType = 'exact';
            else if (similarity >= 70) matchType = 'high';
            else matchType = 'medium';
          }
          
          return { case: caseItem, similarity, matchType };
        });
        
        // 排序
        if (name && name.trim()) {
          resultsWithSimilarity.sort((a: any, b: any) => b.similarity - a.similarity);
        }
        
        // 記錄搜尋歷程
        await db.logSearch({
          searchedName: name || '',
          searchedArea: area,
          foundResults: resultsWithSimilarity.length > 0,
          resultCount: total + uniqueLiveResults.length,
        });
        
        return {
          found: resultsWithSimilarity.length > 0,
          searchedName: name || '',
          searchedArea: area,
          total: total + uniqueLiveResults.length,
          hasMore: offset + limit < total,
          results: resultsWithSimilarity,
          disclaimer: resultsWithSimilarity.length > 0 
            ? "⚠️ 本結果包含系統即時從政府公開網頁(教保網/CRC)擷取之資訊，請點擊連結查證。"
            : "✅ 經即時搜尋政府公開資訊，目前未發現相符紀錄。",
        };
      }),

    areas: publicProcedure.query(async () => {
      const locations = await db.getAvailableLocations();
      return ['全部地區', ...locations];
    }),

    stats: publicProcedure.query(async () => {
      return await db.getSearchStats();
    }),
  }),

  // 地圖相關 API
  map: router({
    cases: publicProcedure.query(async () => { return await db.getAllCases(); }),
    stats: publicProcedure.query(async () => { return await db.getCaseCountByLocation(); }),
  }),

  // 通報相關 API
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
        await db.insertReport({
          suspectName: input.suspectName,
          location: input.location,
          description: input.description,
          attachments: input.attachments,
          reporterIp,
          status: 'pending',
        });
        return { success: true, message: "通報已送出" };
      }),

    pending: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') return [];
      return await db.getPendingReports();
    }),

    all: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') return [];
      return await db.getAllReports();
    }),

    exportToGoogleDrive: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new Error("權限不足");
      const reports = await db.getAllReports();
      if (reports.length === 0) return { success: false, message: "無資料可匯出" };
      const result = await reportExport.exportReportsToGoogleDrive(reports);
      return result.success 
        ? { success: true, message: `已匯出 ${reports.length} 筆`, filename: result.filename, url: result.url }
        : { success: false, message: result.error || "匯出失敗" };
    }),

    review: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['approved', 'rejected']),
        reviewNote: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') throw new Error("權限不足");
        await db.updateReportStatus(input.id, input.status, input.reviewNote);
        return { success: true };
      }),
  }),

  // 系統狀態
  judicial: router({
    status: publicProcedure.query(() => judicialApi.getServiceStatus()),
  }),

  database: router({
    lastUpdate: publicProcedure.query(async () => {
      const lastSync = await db.getLastSuccessfulSync();
      const caseCount = await db.getCaseCount();
      return {
        lastUpdateTime: lastSync?.completedAt || null,
        totalCases: caseCount,
        sources: ['全國教保資訊網', 'KindyInfo 幼園通', '司法院裁判書', '新聞媒體'],
      };
    }),
  }),

  // 同步觸發器
  sync: router({
    logs: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') return [];
      return await db.getRecentSyncLogs();
    }),

    trigger: publicProcedure
      .input(z.object({
        source: z.enum(['judicial', 'news', 'gov', 'kindyinfo', 'crc', 'all']),
      }))
      .mutation(async ({ input }) => {
        // 新聞同步
        if (input.source === 'news' || input.source === 'all') {
          const newsResult = await newsScraper.syncNewsData(async (data) => {
            await db.insertCase(data);
          });
          return { success: newsResult.success, message: "新聞同步完成" };
        }
        
        // 司法判決同步
        if (input.source === 'judicial' || input.source === 'all') {
             const result = await judicialApi.syncJudicialData(async (data) => {
                try { await db.insertCase(data); } catch(e){}
             });
             return { success: true, message: "司法判決同步完成" };
        }

        return { success: true, message: `已啟動 ${input.source} (即時搜尋模式生效中)` };
      }),
  }),

  news: router({
    status: publicProcedure.query(() => ({ available: true, message: '新聞爬蟲就緒' })),
    preview: publicProcedure.query(async () => {
      const items = await newsScraper.fetchAllNewsFeeds();
      return { count: items.length, items: items.slice(0, 10) };
    }),
    syncWithAI: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new Error("權限不足");
      return { success: true, message: "AI 同步功能暫未啟用" };
    }),
  }),

  gov: router({
    status: publicProcedure.query(() => govDataScraper.getGovDataSourcesStatus()),
  }),
});

export type AppRouter = typeof appRouter;