FROM oven/bun:1.3.14 AS build

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY build.ts index.html tsconfig.json ./
COPY public ./public
COPY src ./src

ARG API_BASE_URL=/api
ENV API_BASE_URL=${API_BASE_URL}
RUN bun run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
