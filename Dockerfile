FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
# Cần devDependencies (vite) để build giao diện React, sau đó bỏ đi cho gọn
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3000
# Không chạy bằng root
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
