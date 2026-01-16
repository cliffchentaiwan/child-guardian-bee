FROM node:20-slim

# 1. 安裝 Chrome 依賴 (這是必要的)
RUN apt-get update && apt-get install -y chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 2. 【關鍵】告訴 Puppeteer 不要下載 Chrome，直接用系統裝好的
# 這能省下幾百 MB 的空間和記憶體，避免崩潰
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# 3. 複製設定檔
COPY package.json ./

# 4. 安裝套件 (移除所有花俏的參數，回歸最簡單的安裝)
# 這裡不使用 verbose 模式以減少 log 輸出，避免塞爆記憶體
RUN npm install --legacy-peer-deps

# 5. 複製程式碼
COPY . .

# 6. 建置 (增加記憶體上限設定，防止 build 過程崩潰)
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

EXPOSE 5000
CMD ["npm", "run", "start"]