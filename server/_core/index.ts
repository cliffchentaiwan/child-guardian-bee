// server/_core/index.ts
import { appRouter } from '../routers';
import { createContext } from './context';
import cors from 'cors';
import express from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';

// 🔥 1. 顯示網頁的關鍵：Vite
import { createServer as createViteServer } from 'vite';

// ⏰ 2. 排程系統 (負責半夜偷跑爬蟲)
import { startCronJobs } from './cron';

async function startServer() {
  const app = express();

  // 開啟 CORS
  app.use(cors());

  // === 3. API 路由 (後端大腦 - 搜尋功能靠這裡) ===
  app.use(
    '/api/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // 手動 Search API (給 Home.tsx 用的備用搜尋)
  app.get('/api/search', async (req, res) => {
    try {
        // 簡單的防呆處理，避免 context 建立失敗導致崩潰
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

  // === 4. 網頁顯示路由 (前端臉孔 - 漂亮介面靠這裡) ===
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa', 
  });
  app.use(vite.middlewares);

  // === 5. 啟動伺服器 ===
  // Render 會提供 PORT 環境變數，如果沒有就用 3000
  const port = process.env.PORT || 3000;
  
  app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    
    // ✅ 啟動排程 (正確！設定鬧鐘半夜跑)
    try {
      startCronJobs();
      console.log("⏰ 排程系統已就緒 (每日 03:00 執行)");
    } catch (err) {
      console.error("❌ 排程啟動失敗:", err);
    }

    // ❌ 這裡【絕對沒有】 crawlNewsFinal() 
    // 這樣 Render 啟動時才不會因為開瀏覽器而爆掉記憶體！
  });
}

startServer();