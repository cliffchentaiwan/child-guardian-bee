import { appRouter } from '../routers';
import { createContext } from './context';
import cors from 'cors';
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';

// 🔥 1. 補回：引入 Vite (這是顯示網頁的關鍵！)
import { createServer as createViteServer } from 'vite';

// 引入排程器
import { startCronJobs } from './cron';

async function startServer() {
  const app = express();

  // 開啟 CORS
  app.use(cors());

  // === 1. API 路由 (後端大腦) ===
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

  // === 2. 網頁顯示路由 (前端臉孔) ===
  // 🔥 這段就是你原本缺少的！沒有它就沒有畫面！
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa', 
  });
  app.use(vite.middlewares);

  // === 3. 啟動伺服器 ===
  const port = 3000;
  app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
    
    // 啟動每日排程
    try {
      startCronJobs();
    } catch (err) {
      console.error("❌ 排程啟動失敗:", err);
    }
  });
}

startServer();