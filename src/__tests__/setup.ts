import { beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import type * as grpc from "@grpc/grpc-js";

let fastifyServer: FastifyInstance | undefined;
let grpcServer: grpc.Server | undefined;

beforeAll(async () => {
  config({ path: resolve(process.cwd(), ".env.test"), override: true });

  const { getPostgresDB } = await import("../storage/db/postgres/db");
  getPostgresDB(process.env.DATABASE_URL);

  if (process.env.STORAGE_ADAPTER === "clickhouse") {
    const { getClickHouseDB } = await import("../storage/db/clickhouse");
    getClickHouseDB(process.env.CLICKHOUSE_URL);
  }

  const { startRawGrpcServer } = await import("../servers/rawGrpcServer");
  const { startFastifyServer } = await import("../servers/fastifyServer");
  grpcServer = await startRawGrpcServer(18069);
  fastifyServer = await startFastifyServer(18070, 18069);
});

afterAll(async () => {
  await fastifyServer?.close();
  grpcServer?.forceShutdown();
});
