FROM node:20-alpine

WORKDIR /app

# 先複製依賴設定，利用 Docker 快取層
COPY package*.json ./

RUN npm ci --only=production

# 複製其餘專案檔案
COPY . .

# 預設 PORT 環境變數（Koyeb 部署時會自動注入或可於後台設定）
ENV PORT=8000
EXPOSE 8000

CMD ["node", "server.js"]
