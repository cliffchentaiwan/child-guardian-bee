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
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // 搜尋相關 API
  search: router({
    /**
     * 搜尋案例
     * 支援姓名模糊比對和地區篩選
     * 姓名可以為空，只選地區也能搜尋
     */
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
        
        // 從資料庫搜尋
        const { results: caseResults, total } = await db.searchCases({ 
          name, area, district, violationType, limit, offset 
        });
        
        // 如果有姓名，計算相似度並排序
        const resultsWithSimilarity = caseResults.map((caseItem: typeof caseResults[0]) => {
          let similarity = 100; // 預設 100（地區搜尋時）
          let matchType: 'exact' | 'high' | 'medium' | 'low' = 'exact';
          
          if (name && name.trim()) {
            similarity = calculateSimilarity(name, caseItem.maskedName);
            if (similarity >= 95) matchType = 'exact';
            else if (similarity >= 70) matchType = 'high';
            else if (similarity >= 50) matchType = 'medium';
            else matchType = 'low';
          }
          
          return {
            case: caseItem,
            similarity,
            matchType,
          };
        });
        
        // 如果有姓名，依相似度排序
        if (name && name.trim()) {
          resultsWithSimilarity.sort((a: typeof resultsWithSimilarity[0], b: typeof resultsWithSimilarity[0]) => b.similarity - a.similarity);
        }
        
        // 記錄搜尋
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
            ? "以上資料僅供參考，非絕對比對。請自行查證並謹慎判斷。"
            : "本資料庫查無異常紀錄（這並不保證 100% 安全，請持續保持警覺）",
        };
      }),

    /**
     * 取得可用地區列表
     */
    areas: publicProcedure.query(async () => {
      const locations = await db.getAvailableLocations();
      return ['全部地區', ...locations];
    }),

    /**
     * 取得搜尋統計
     */
    stats: publicProcedure.query(async () => {
      return await db.getSearchStats();
    }),
  }),

  // 地圖相關 API
  map: router({
    /**
     * 取得所有案例（用於地圖顯示）
     */
    cases: publicProcedure.query(async () => {
      return await db.getAllCases();
    }),

    /**
     * 取得各地區案例統計
     */
    stats: publicProcedure.query(async () => {
      return await db.getCaseCountByLocation();
    }),
  }),

  // 通報相關 API
  report: router({
    /**
     * 提交通報
     */
    submit: publicProcedure
      .input(z.object({
        suspectName: z.string().min(1, "請輸入被通報人姓名"),
        location: z.string().optional(),
        description: z.string().min(10, "請詳細描述事件（至少 10 字）"),
        attachments: z.array(z.string()).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // 取得通報者 IP（用於防濫用）
        const reporterIp = ctx.req.headers['x-forwarded-for'] as string || 
                          ctx.req.socket?.remoteAddress || 
                          'unknown';
        
        await db.insertReport({
          suspectName: input.suspectName,
          location: input.location,
          description: input.description,
          attachments: input.attachments,
          reporterIp,
          status: 'pending',
        });
        
        return {
          success: true,
          message: "通報已送出，將由管理員審核後處理。感謝您的協助！",
        };
      }),

    /**
     * 取得待審核通報（僅管理員）
     */
    pending: protectedProcedure.query(async ({ ctx }) => {
      // 檢查是否為管理員
      if (ctx.user.role !== 'admin') {
        return [];
      }
      return await db.getPendingReports();
    }),

    /**
     * 取得所有通報（僅管理員）
     */
    all: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        return [];
      }
      return await db.getAllReports();
    }),

    /**
     * 匯出通報資料到 Google Drive（僅管理員）
     */
    exportToGoogleDrive: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        throw new Error("權限不足");
      }

      // 取得所有通報
      const reports = await db.getAllReports();
      
      if (reports.length === 0) {
        return {
          success: false,
          message: "目前沒有通報資料可匯出",
        };
      }

      // 匯出到 Google Drive
      const result = await reportExport.exportReportsToGoogleDrive(reports);
      
      if (result.success) {
        return {
          success: true,
          message: `已成功匯出 ${reports.length} 筆通報資料`,
          filename: result.filename,
          url: result.url,
        };
      } else {
        return {
          success: false,
          message: result.error || "匯出失敗",
        };
      }
    }),

    /**
     * 審核通報（僅管理員）
     */
    review: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(['approved', 'rejected']),
        reviewNote: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // 檢查是否為管理員
        if (ctx.user.role !== 'admin') {
          throw new Error("權限不足");
        }
        
        await db.updateReportStatus(input.id, input.status, input.reviewNote);
        
        return { success: true };
      }),
  }),

  // 司法院 API 狀態
  judicial: router({
    /**
     * 取得司法院 API 服務狀態
     */
    status: publicProcedure.query(() => {
      return judicialApi.getServiceStatus();
    }),
  }),

  // 資料庫狀態
  database: router({
    /**
     * 取得資料庫最後更新時間
     */
    lastUpdate: publicProcedure.query(async () => {
      const lastSync = await db.getLastSuccessfulSync();
      const caseCount = await db.getCaseCount();
      
      return {
        lastUpdateTime: lastSync?.completedAt || null,
        totalCases: caseCount,
        sources: [
          '全國教保資訊網',
          'KindyInfo 幼園通',
          '司法院裁判書',
          '新聞媒體',
        ],
      };
    }),
  }),

  // 資料同步相關 API（僅管理員）
  sync: router({
    /**
     * 取得同步記錄
     */
    logs: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        return [];
      }
      return await db.getRecentSyncLogs();
    }),

    /**
     * 手動觸發同步（預留給未來實作）
     */
    trigger: protectedProcedure
      .input(z.object({
        source: z.enum(['judicial', 'news', 'gov', 'kindyinfo', 'crc', 'all']),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new Error("權限不足");
        }
        
        if (input.source === 'judicial' || input.source === 'all') {
          // 檢查服務時間
          const status = judicialApi.getServiceStatus();
          if (!status.available) {
            return {
              success: false,
              message: status.message + (status.nextAvailable ? `，${status.nextAvailable}` : ''),
            };
          }
          
          // 執行同步
          const result = await judicialApi.syncJudicialData(
            async (data) => {
              await db.insertCase({
                maskedName: data.name, // 已經遮罩過
                role: data.role as '家教' | '保母' | '才藝老師' | '補習班老師' | '學校老師' | '教練' | '其他',
                riskTags: data.riskTags,
                location: data.location || '未知',
                caseDate: data.date,
                description: data.description,
                sourceType: data.sourceType as '政府公告' | '媒體報導' | '社群輿情',
                sourceLink: data.sourceLink,
                verified: data.verified,
                judicialJid: data.jid,
              });
            }
          );
          
          // 記錄同步結果
          await db.insertSyncLog({
            source: 'judicial',
            status: result.success ? 'success' : 'failed',
            recordsAdded: result.childRelated,
            errorMessage: result.error,
          });
          
          if (input.source === 'judicial') {
            return {
              success: result.success,
              message: result.success 
                ? `同步完成：處理 ${result.synced} 筆，新增 ${result.childRelated} 筆兒少相關案件`
                : result.error || '同步失敗',
            };
          }
        }
        
        // 同步政府資料
        if (input.source === 'gov' || input.source === 'all') {
          const govResult = await govDataScraper.syncAllGovData(
            async (record) => {
              await db.insertCase({
                maskedName: record.maskedName,
                role: record.role as '家教' | '保母' | '才藝老師' | '補習班老師' | '學校老師' | '教練' | '其他',
                riskTags: record.riskTags,
                location: record.location || '未知',
                caseDate: record.penaltyDate,
                description: record.description,
                sourceType: record.sourceType,
                sourceLink: record.sourceLink,
                verified: true, // 政府資料視為已驗證
              });
            }
          );
          
          // 記錄同步結果
          await db.insertSyncLog({
            source: 'gov',
            status: govResult.success ? 'success' : 'failed',
            recordsAdded: govResult.added,
            errorMessage: govResult.error,
          });
          
          if (input.source === 'gov') {
            return {
              success: govResult.success,
              message: govResult.success 
                ? `政府資料同步完成：抓取 ${govResult.synced} 筆，新增 ${govResult.added} 筆`
                : govResult.error || '同步失敗',
            };
          }
        }
        
        // 同步 KindyInfo 幼園通資料
        if (input.source === 'kindyinfo' || input.source === 'all') {
          try {
            const kindyResult = await kindyInfoScraper.syncKindyInfo();
            
            // 記錄同步結果
            await db.insertSyncLog({
              source: 'kindyinfo',
              status: 'success',
              recordsAdded: kindyResult.inserted,
              errorMessage: undefined,
            });
            
            if (input.source === 'kindyinfo') {
              return {
                success: true,
                message: `KindyInfo 同步完成：爬取 ${kindyResult.totalRecords} 筆，新增 ${kindyResult.inserted} 筆，跳過 ${kindyResult.skipped} 筆`,
              };
            }
          } catch (error: any) {
            await db.insertSyncLog({
              source: 'kindyinfo',
              status: 'failed',
              recordsAdded: 0,
              errorMessage: error.message,
            });
            
            if (input.source === 'kindyinfo') {
              return {
                success: false,
                message: `KindyInfo 同步失敗：${error.message}`,
              };
            }
          }
        }
        
        // 同步 CRC 兒少法裁罰資料
        if (input.source === 'crc' || input.source === 'all') {
          try {
            const crcResult = await crcScraper.syncCrcData();
            
            // 記錄同步結果
            await db.insertSyncLog({
              source: 'crc',
              status: crcResult.success ? 'success' : 'failed',
              recordsAdded: crcResult.inserted,
              errorMessage: crcResult.error,
            });
            
            if (input.source === 'crc') {
              return {
                success: crcResult.success,
                message: crcResult.success 
                  ? `CRC 同步完成：爬取 ${crcResult.totalRecords} 筆，新增 ${crcResult.inserted} 筆，跳過 ${crcResult.skipped} 筆`
                  : crcResult.error || '同步失敗',
              };
            }
          } catch (error: any) {
            await db.insertSyncLog({
              source: 'crc',
              status: 'failed',
              recordsAdded: 0,
              errorMessage: error.message,
            });
            
            if (input.source === 'crc') {
              return {
                success: false,
                message: `CRC 同步失敗：${error.message}`,
              };
            }
          }
        }
        
        // 同步新聞資料
        if (input.source === 'news' || input.source === 'all') {
          const newsResult = await newsScraper.syncNewsData(
            async (data) => {
              await db.insertCase({
                maskedName: data.maskedName,
                role: data.role as '家教' | '保母' | '才藝老師' | '補習班老師' | '學校老師' | '教練' | '其他',
                riskTags: data.riskTags,
                location: data.location || '未知',
                caseDate: data.date,
                description: data.description,
                sourceType: data.sourceType as '政府公告' | '媒體報導' | '社群輿情',
                sourceLink: data.sourceLink,
                verified: data.verified,
              });
            }
          );
          
          // 記錄同步結果
          await db.insertSyncLog({
            source: 'news',
            status: newsResult.success ? 'success' : 'failed',
            recordsAdded: newsResult.childRelated,
            errorMessage: newsResult.error,
          });
          
          if (input.source === 'news') {
            return {
              success: newsResult.success,
              message: newsResult.success 
                ? `新聞同步完成：抓取 ${newsResult.synced} 則，新增 ${newsResult.childRelated} 筆兒少相關新聞`
                : newsResult.error || '同步失敗',
            };
          }
        }
        
        return {
          success: true,
          message: `已完成同步 ${input.source} 資料來源`,
        };
      }),
  }),

  // 新聞爬蟲 API
  news: router({
    /**
     * 取得新聞爬蟲狀態
     */
    status: publicProcedure.query(() => {
      return {
        available: true,
        sources: newsScraper.NEWS_SOURCES.map(s => ({ name: s.name, category: s.category })),
        keywords: newsScraper.CHILD_SAFETY_KEYWORDS.slice(0, 10),
        message: '新聞爬蟲隨時可用',
      };
    }),

    /**
     * 預覽最新新聞（不儲存）
     */
    preview: publicProcedure.query(async () => {
      const items = await newsScraper.fetchAllNewsFeeds();
      return {
        count: items.length,
        items: items.slice(0, 10).map(item => ({
          title: item.title,
          source: item.source,
          pubDate: item.pubDate,
          riskTags: item.riskTags,
          extractedNames: item.extractedNames,
          link: item.link,
        })),
      };
    }),

    /**
     * 使用 AI 同步新聞（僅管理員）
     */
    syncWithAI: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        throw new Error("權限不足");
      }

      const result = await aiNewsSync.syncNewsWithAI(
        async (data) => {
          await db.insertCase({
            maskedName: data.maskedName,
            role: data.role as '家教' | '保母' | '才藝老師' | '補習班老師' | '學校老師' | '教練' | '其他',
            riskTags: data.riskTags,
            location: data.location || '未知',
            caseDate: data.date,
            description: data.description,
            sourceType: data.sourceType as '政府公告' | '媒體報導' | '社群輿情',
            sourceLink: data.sourceLink,
            verified: data.verified,
          });
        }
      );

      // 記錄同步結果
      await db.insertSyncLog({
        source: 'news-ai',
        status: result.success ? 'success' : 'failed',
        recordsAdded: result.childRelated,
        errorMessage: result.error,
      });

      return {
        success: result.success,
        message: result.success
          ? `AI 新聞同步完成：抓取 ${result.synced} 則，AI 處理 ${result.aiProcessed} 則，新增 ${result.childRelated} 筆`
          : result.error || '同步失敗',
      };
    }),
  }),

  // 政府資料來源 API
  gov: router({
    /**
     * 取得政府資料來源狀態
     */
    status: publicProcedure.query(() => {
      return govDataScraper.getGovDataSourcesStatus();
    }),
  }),
});

export type AppRouter = typeof appRouter;
