FROM node:25-alpine
WORKDIR /app
# 런타임 의존성이 없어 npm install 없이 소스만 복사한다
COPY package.json ./
COPY src ./src
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "src/server.ts"]
