# 使用 Node.js 20 的輕量版作為基底
FROM node:20-slim

# 1. 安裝 Puppeteer 需要的 Chrome 相關函式庫與中文字型
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 設定環境變數
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# 2. 【關鍵修改】先升級 npm 到最新版，避免舊版 Bug
RUN npm install -g npm@latest

# 複製 package.json
COPY package.json ./

# 3. 安裝套件 (加上除錯指令：如果失敗，就把詳細錯誤印出來給我們看)
RUN npm install --legacy-peer-deps --no-audit --no-fund || \
    (echo "❌ 安裝失敗，正在印出錯誤日誌..." && cat /root/.npm/_logs/*-debug-0.log && exit 1)

# 複製所有程式碼
COPY . .

# 建置前端
RUN npm run build

EXPOSE 5000

CMD ["npm", "run", "start"]