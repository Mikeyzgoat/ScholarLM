FROM oven/bun:1.3.14

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
RUN mkdir -p /app/data/uploads

ENV NODE_ENV=production
EXPOSE 3001

CMD ["bun", "src/server.ts"]
