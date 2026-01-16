# 使用 Node.js 20 的輕量版作為基底
FROM node:20-slim

# 1. 安裝 Puppeteer 需要的 Chrome 相關函式庫與中文字型
# (這些指令會幫雲端伺服器裝上眼睛和看得懂中文的能力)
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 設定環境變數，告訴 Puppeteer 使用我們剛安裝的 Chromium，而不是自己下載
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 設定工作目錄
WORKDIR /app

# 2. 先複製設定檔 (利用 Docker 快取加速安裝)
COPY package*.json ./

# 安裝專案套件
# (使用 --legacy-peer-deps 避免版本衝突，跟你本機一樣)
RUN npm install --legacy-peer-deps

# 3. 複製所有程式碼到伺服器
COPY . .

# 4. 建置前端頁面
RUN npm run build

# 開放連接埠 (Render 預設會給，但寫著比較清楚)
EXPOSE 5000

# 5. 啟動伺服器
CMD ["npm", "run", "start"]