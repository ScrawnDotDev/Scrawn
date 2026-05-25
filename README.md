# Scrawn Backend

The backend service for Scrawn — a usage-based billing platform with gRPC and HTTP APIs for event tracking, authentication, and payment processing.

## Prerequisites

- [Bun](https://bun.sh) (latest)
- PostgreSQL 15
- Redis 7
- ClickHouse (optional — used for analytics storage adapter)
- Dodo Payments account (for payment processing)

## Setup

1. **Install dependencies**

   ```bash
   bun install
   ```

2. **Configure environment variables**

   Copy `.env.example` to `.env.local` and fill in:

   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/scrawn
   REDIS_URL=redis://localhost:6379
   CLICKHOUSE_URL=http://localhost:8123
   HMAC_SECRET=your-hmac-secret-key
   SENTRY_DSN=https://your-dsn@sentry.io/your-project
   DODO_PAYMENTS_API_KEY=your-dodo-api-key
   DODO_PAYMENTS_WEBHOOK_SECRET=your-webhook-secret
   ```

3. **Start infrastructure**

   ```bash
   docker compose up -d db redis clickhouse
   ```

4. **Run database migrations**

   ```bash
   bunx drizzle-kit push
   ```

5. **Generate an initial API key** (optional)

   ```bash
   bun run init_key
   ```

6. **Generate protocol buffers** (if proto definitions change)

   ```bash
   bun run gen
   ```

## Running the Server

**Development** (with auto-reload):

```bash
bun run dev:backend
```

**Production**:

```bash
bun start
```

The server listens on two ports:

- **gRPC** (h2c / HTTP/2 cleartext): `localhost:8069`
- **HTTP** (Fastify — webhooks, API routes, health check): `localhost:8070`

## gRPC Services

| Service          | RPC                | Description                                         |
| ---------------- | ------------------ | --------------------------------------------------- |
| AuthService      | CreateAPIKey       | Create a new API key                                |
| EventService     | RegisterEvent      | Register a single usage event                       |
| EventService     | StreamEvents       | Client-streaming batch event registration           |
| PaymentService   | CreateCheckoutLink | Generate a Dodo Payments checkout link              |
| QueryService     | QueryEvents        | Query events with filters, aggregation, group-by    |
| DataQueryService | Query              | Query internal tables (users, sessions, tags, etc.) |

## HTTP Endpoints

| Method   | Path                                | Purpose                    |
| -------- | ----------------------------------- | -------------------------- |
| GET      | `/`                                 | Health check               |
| GET      | `/checkout/:sessionId`              | Checkout redirect          |
| POST     | `/webhooks/payment/createdCheckout` | Dodo Payments webhook      |
| GET/POST | `/api/v1/tags`                      | Manage pricing tags        |
| GET/POST | `/api/v1/expressions`               | Manage pricing expressions |
| POST     | `/api/v1/internals/onboarding`      | Onboarding endpoint        |

## Storage Adapters

Scrawn supports two storage backends via an abstract `StorageAdapter` interface:

- **PostgreSQL** (default) — full relational schema via Drizzle ORM
- **ClickHouse** — columnar analytics DB with `ReplacingMergeTree` for event deduplication

Set `STORAGE_ADAPTER` in `src/config/identifiers.ts` to switch. Only one adapter operates at a time.

## TLS Configuration (gRPC)

By default, the gRPC server runs without TLS. In production, put the backend behind a TLS-terminating proxy or enable TLS directly:

```env
GRPC_TLS_ENABLED=true
GRPC_TLS_CERT_PATH="/path/to/server.crt"
GRPC_TLS_KEY_PATH="/path/to/server.key"
GRPC_TLS_CA_PATH="/path/to/ca.pem"
```

## Testing

Integration and black-box tests are set up with Vitest, using an isolated test environment.

1. **Configure test environment variables**

   ```bash
   cp .env.example .env.test
   ```

   Edit `.env.test` and ensure the `DATABASE_URL`, `REDIS_URL`, and `CLICKHOUSE_URL` point to test instances (separate ports/databases from development).

2. **Start test infrastructure**

   ```bash
   docker compose -f docker-compose.test.yml up -d
   ```

   This runs PostgreSQL, Redis, and ClickHouse on non-overlapping ports (see the compose file).

3. **Prepare test database**

   ```bash
   DATABASE_URL=postgresql://postgres:postgres@localhost:5433/scrawn_test bunx drizzle-kit push
   ```

4. **Run tests**

   ```bash
   bun run test
   ```

The test suite starts the gRPC and Fastify servers on separate ports (`18069` / `18070`) so they don't conflict with a running dev server.

## Documentation

For complete gRPC API documentation, endpoint details, and integration guides, visit the [Scrawn Docs](https://scrawn.vercel.app/docs).
