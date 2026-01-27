// server/index.ts

// ✅ 修正 1: routers 在同層，改用 ./
import { appRouter } from './routers'; 

// ✅ 修正 2: context 在 _core 資料夾內，改用 ./_core/context
import { createContext } from './_core/context'; 

import cors from 'cors';
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createServer as createViteServer } from 'vite'; 

// ✅ 修正 3: cron 在 _core 資料夾內，改用 ./_core/cron
import { startCronJobs } from './_core/cron'; 

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
    // 建立臨時 Caller
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
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
    
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