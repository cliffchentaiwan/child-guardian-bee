// src/server/_core/index.ts
import { appRouter } from '../routers';
import { createContext } from './context';
import cors from 'cors';
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createServer as createViteServer } from 'vite'; // 🔥 1. 補回：引入 Vite 網頁伺服器
import { startCronJobs } from './cron'; 

async function startServer() {
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

  // 手動 Search API (給 Home.tsx 用)
  app.get('/api/search', async (req, res) => {
    const caller = appRouter.createCaller(await createContext({ req, res } as any));
    try {
      const q = req.query.q as string;
      const result = await caller.search.cases({ name: q });
      res.json({ data: result.results });
    } catch (e) {
      console.error("Search API Error:", e);
      res.status(500).json({ error: e });
    }
  });

  // === 網頁顯示區域 (前端) ===
  // 🔥 2. 補回：掛載 Vite，讓伺服器知道怎麼顯示 index.html
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa', 
  });
  app.use(vite.middlewares);

  // === 啟動 ===
  const port = 3000;
  app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
    
    // 啟動排程
    try {
      startCronJobs();
    } catch (err) {
      console.error("❌ 排程啟動失敗:", err);
    }
  });
}

startServer();