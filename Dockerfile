FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
# Cần devDependencies (vite) để build giao diện React, sau đó bỏ đi cho gọn
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
