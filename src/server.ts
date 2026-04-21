import { getPostgresDB } from "./storage/db/postgres/db.ts";
import { logger } from "./errors/logger.ts";
import { startRawGrpcServer } from "./servers/rawGrpcServer.ts";
import { startFastifyServer } from "./servers/fastifyServer.ts";

const DATABASE_URL = process.env.DATABASE_URL;
const HMAC_SECRET = process.env.HMAC_SECRET;

if (!DATABASE_URL) {
  logger.fatal("DATABASE_URL is not defined in environment variables");
  throw new Error("DATABASE_URL is not defined in environment variables");
}

if (!HMAC_SECRET) {
  logger.fatal("HMAC_SECRET environment variable is not set");
  throw new Error("HMAC_SECRET environment variable is not set");
}

getPostgresDB(DATABASE_URL);

const PORT = Number(process.env.PORT ?? 8069);
const GRPC_PORT = Number(process.env.GRPC_PORT ?? 8070);

async function main(): Promise<void> {
  startRawGrpcServer(GRPC_PORT);
  await startFastifyServer(PORT, GRPC_PORT);
}

void main();
