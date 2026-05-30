FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 8070 8069

CMD ["sh", "-c", "for i in 1 2 3 4 5; do bunx drizzle-kit push --force && break; sleep 3; done && bun run src/server.ts"]
