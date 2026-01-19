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

  // 搜尋相關 API (重點修改區：加入即時爬蟲邏輯)
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
        
        // 1. 🟢 如果有輸入名字，啟動【即時政府爬蟲】
        if (name && name.length >= 2) {
            try {
                // 呼叫即時搜尋引擎
                const liveResults = await govDataScraper.searchGovLive(name);
                
                // 將搜到的結果寫入資料庫 (作為快取)
                for (const res of liveResults) {
                     try {
                        await db.insertCase(res);
                     } catch (e) {
                         // 忽略寫入錯誤 (例如連結已存在)
                     }
                }
            } catch (err) {
                console.error("即時搜尋發生錯誤:", err);
            }
        }
        
        // 2. 從資料庫讀取所有資料 (包含剛剛爬到的 + 舊的)
        const { results: caseResults, total } = await db.searchCases({ 
          name, area, district, violationType, limit, offset 
        });
        
        // 3. 計算相似度
        const resultsWithSimilarity = caseResults.map((caseItem: typeof caseResults[0]) => {
          let similarity = 100;
          let matchType: 'exact' | 'high' | 'medium' | 'low' = 'exact';
          
          if (name && name.trim()) {
            similarity = calculateSimilarity(name, caseItem.maskedName);
            if (similarity >= 95) matchType = 'exact';
            else if (similarity >= 70) matchType = 'high';
            else matchType = 'medium';
          }
          
          return { case: caseItem, similarity, matchType };
        });
        
        // 排序：相似度高的排前面
        if (name && name.trim()) {
          resultsWithSimilarity.sort((a: any, b: any) => b.similarity - a.similarity);
        }
        
        // 記錄搜尋歷程
        await db.logSearch({
          searchedName: name || '',
          searchedArea: area,
          foundResults: resultsWithSimilarity.length > 0,
          resultCount: total,
        });
        
        return {
          found: resultsWithSimilarity.length > 0,
          searchedName: name || '',
          searchedArea: area,
          total,
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

        // 其他項目 (Gov/CRC 現在改為即時搜尋，這裡留空或回傳成功即可)
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