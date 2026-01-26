// server/_core/index.ts
import { appRouter } from '../routers'; // 指向 server/routers.ts
import { createContext } from './context';
import cors from 'cors';
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createServer as createViteServer } from 'vite';

// ⏰ 排程設定 (只引入設定函式，不引入爬蟲本身)
import { startCronJobs } from './cron';

async function startServer() {
  const app = express();

  // 開啟 CORS，允許前端連線
  app.use(cors());

  // === 後端 API 路由 (tRPC) ===
  app.use(
    '/api/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // 備用 Search API (給 Home.tsx 用)
  app.get('/api/search', async (req, res) => {
    try {
        const ctx = await createContext({ req, res } as any);
        const caller = appRouter.createCaller(ctx);
        const q = req.query.q as string;
        const result = await caller.search.cases({ name: q });
        res.json({ data: result.results });
    } catch (e) {
      console.error("Search API Error:", e);
      res.status(500).json({ error: String(e) });
    }
  });

  // === 前端網頁路由 (Vite Middleware) ===
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa', 
  });
  app.use(vite.middlewares);

  // === 啟動伺服器 ===
  const port = process.env.PORT || 3000;
  
  app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    
    // ✅ 正確：只啟動排程計時器 (鬧鐘)，不直接跑爬蟲
    try {
      startCronJobs();
      console.log("⏰ 排程系統已就緒 (每日 03:00 執行)");
    } catch (err) {
      console.error("❌ 排程啟動失敗:", err);
    }
  });
}

startServer();