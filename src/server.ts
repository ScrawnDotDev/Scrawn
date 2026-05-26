import { STORAGE_ADAPTER } from "./config/identifiers.ts";
import { getPostgresDB } from "./storage/db/postgres/db.ts";
import { logger } from "./errors/logger.ts";
import {
  startRawGrpcServer,
  type GrpcTlsOptions,
} from "./servers/rawGrpcServer.ts";
import { startFastifyServer } from "./servers/fastifyServer.ts";
import {
  initScheduler,
  type OnboardingScheduler,
} from "./schedulers/onboarding.ts";
import { getClickHouseDB } from "./storage/db/clickhouse.ts";
import { readFileSync } from "node:fs";
import * as Sentry from "@sentry/bun";

const isProduction = process.env.NODE_ENV === "production";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: isProduction ? "production" : "development",
  release: process.env.GIT_COMMIT_SHA ?? "dev",
  integrations: [Sentry.fastifyIntegration(), Sentry.httpIntegration()],
  tracesSampleRate: isProduction ? 0.1 : 1.0,
  ignoreErrors: ["ConnectionRefusedError", "ECONNREFUSED"],
  maxBreadcrumbs: 10,
});

process.on("uncaughtException", (error) => {
  Sentry.captureException(error);
  Sentry.flush().then(() => process.exit(1));
});

process.on("unhandledRejection", (reason) => {
  Sentry.captureException(reason);
  Sentry.flush().then(() => process.exit(1));
});

const DATABASE_URL = process.env.DATABASE_URL;
const HMAC_SECRET = process.env.HMAC_SECRET;
const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL;

if (STORAGE_ADAPTER === "postgres") {
  if (!DATABASE_URL) {
    logger.fatal("DATABASE_URL is not defined in environment variables");
    throw new Error("DATABASE_URL is not defined in environment variables");
  }
  getPostgresDB(DATABASE_URL);
}

if (!HMAC_SECRET) {
  logger.fatal("HMAC_SECRET environment variable is not set");
  throw new Error("HMAC_SECRET environment variable is not set");
}

if (STORAGE_ADAPTER === "clickhouse") {
  if (!CLICKHOUSE_URL) {
    logger.fatal("CLICKHOUSE_URL environment variable is not set");
    throw new Error("CLICKHOUSE_URL environment variable is not set");
  }
  getClickHouseDB(CLICKHOUSE_URL);
}

if (!process.env.SENTRY_DSN) {
  logger.fatal(
    "SENTRY_DSN environment variable is not set — errors will NOT be reported to Sentry"
  );
}

const PORT = Number(process.env.PORT ?? 8070);
const GRPC_PORT = Number(process.env.GRPC_PORT ?? 8069);
const GRPC_TLS_CERT_PATH = process.env.GRPC_TLS_CERT_PATH;
const GRPC_TLS_KEY_PATH = process.env.GRPC_TLS_KEY_PATH;
const GRPC_TLS_CA_PATH = process.env.GRPC_TLS_CA_PATH;
const GRPC_TLS_ENABLED = process.env.GRPC_TLS_ENABLED === "true";

function loadGrpcTlsOptions(): GrpcTlsOptions | undefined {
  if (!GRPC_TLS_ENABLED) {
    return undefined;
  }

  if (!GRPC_TLS_CERT_PATH || !GRPC_TLS_KEY_PATH) {
    logger.fatal(
      "GRPC_TLS_ENABLED requires GRPC_TLS_CERT_PATH and GRPC_TLS_KEY_PATH"
    );
    throw new Error("gRPC TLS config incomplete");
  }

  const cert = readFileSync(GRPC_TLS_CERT_PATH);
  const key = readFileSync(GRPC_TLS_KEY_PATH);
  if (!cert.length || !key.length) {
    logger.fatal("gRPC TLS cert or key file is empty");
    throw new Error("gRPC TLS cert or key file is empty");
  }

  const ca = GRPC_TLS_CA_PATH ? readFileSync(GRPC_TLS_CA_PATH) : undefined;

  return {
    cert,
    key,
    ca,
  };
}

let onboardingScheduler: OnboardingScheduler | undefined;

async function main(): Promise<void> {
  const tlsOptions = loadGrpcTlsOptions();
  startRawGrpcServer(GRPC_PORT, tlsOptions);
  await startFastifyServer(PORT, GRPC_PORT);

  if (!tlsOptions) {
    logger.lifecycleWarning(
      "Server running without TLS. In production, use a TLS-terminating proxy or enable TLS."
    );
  }

  onboardingScheduler = initScheduler();
  await onboardingScheduler.start();
  logger.lifecycle("Onboarding scheduler started");
}

process.on("beforeExit", async () => {
  if (onboardingScheduler) {
    onboardingScheduler.stop();
  }
  await Sentry.flush(2000);
});

void main();
