// server/index.ts
import { appRouter } from './routers'; 
import { createContext } from './_core/context'; 
import cors from 'cors';
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createServer as createViteServer } from 'vite'; 
import { startCronJobs } from './_core/cron'; 

async function startServer() {
  // 🐞 [偵錯日誌] 伺服器啟動時，印出資料庫連線 URL，以確認是否正確
  console.log('✅ [偵錯] DATABASE_URL:', process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 40)}...` : 'Not Set!');
  console.log('✅ [偵錯] process.env.RESEND_API_KEY:', process.env.RESEND_API_KEY ? `${process.env.RESEND_API_KEY.substring(0, 4)}...` : 'Not Set!'); // <-- 新增的偵錯日誌

  const app = express();

  // 開啟 CORS
  app.use(cors());

  // === API 區域 (後端) ===
  app.use(
    '/api/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // 手動 Search API
  app.get('/api/search', async (req, res) => {
    // @ts-ignore
    const caller = appRouter.createCaller(await createContext({ req, res }));
    try {
      const q = req.query.q as string;
      const result = await caller.search.cases({ name: q });
      res.json({ data: result.results });
    } catch (e) {
      console.error("Search API Error:", e);
      res.status(500).json({ error: String(e) });
    }
  });

  // === 網頁顯示區域 (前端) ===
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa', 
  });
  app.use(vite.middlewares);

  // === 啟動 ===
  // Render 會自動分配 PORT，我們必須使用它
  const port = Number(process.env.PORT) || 3000;
  
  // 🔥 關鍵修正：強制監聽 '0.0.0.0'，讓 Render 找得到我們
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${port}`);
    
    // 啟動排程
    try {
      startCronJobs();
      console.log("⏰ 排程系統已就緒");
    } catch (err) {
      console.error("❌ 排程啟動失敗:", err);
    }
  });
}

startServer();