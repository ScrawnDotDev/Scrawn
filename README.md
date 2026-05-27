# Scrawn Backend

The backend service for Scrawn - a usage-based billing platform with gRPC API endpoints for event tracking, authentication, and payment processing.

## Overview

Scrawn backend provides gRPC services for:

- **Event tracking** - Register SDK calls and usage events
- **Authentication** - API key management
- **Payment processing** - Checkout link generation via Lemon Squeezy

Works with the Scrawn frontend SDK. For detailed API documentation and gRPC endpoint usage, visit the [Scrawn Docs](https://scrawn.vercel.app/docs).

## Railway Quickstart

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/o22nR_?referralCode=jdhNLd&utm_medium=integration&utm_source=template&utm_campaign=generic)

## Prerequisites

- [Bun](https://bun.sh) (latest version)
- PostgreSQL database
- Lemon Squeezy account (for payment processing)

## Setup

1. **Install dependencies**

   ```bash
   bun install
   ```

2. **Configure environment variables**

   Create a `.env.local` file in the backend directory:

   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/scrawn
   HMAC_SECRET=your-hmac-secret-key
   LEMON_SQUEEZY_API_KEY=your-ls-api-key
   LEMON_SQUEEZY_STORE_ID=your-store-id
   LEMON_SQUEEZY_VARIANT_ID=your-variant-id
   LEMON_SQUEEZY_WEBHOOK_SECRET=your-webhook-secret
   ```

3. **Run database migrations**

   ```bash
   bunx drizzle-kit push
   ```

4. **Generate initial API key** (optional)

   ```bash
   bun run init_key
   ```

5. **Generate protocol buffers** (if needed)
   ```bash
   bun run gen
   ```

## Running the Server

**Development mode** (with auto-reload):

```bash
bun run dev:backend
```

**Production mode**:

```bash
bun start
```

The server will start on `http://localhost:8070`

## TLS Configuration (gRPC)

By default, the gRPC server runs without TLS. In production, put the backend behind a TLS-terminating proxy or enable TLS directly.

To enable gRPC TLS, set:

```env
GRPC_TLS_ENABLED=true
GRPC_TLS_CERT_PATH="/path/to/server.crt"
GRPC_TLS_KEY_PATH="/path/to/server.key"
# Optional
GRPC_TLS_CA_PATH="/path/to/ca.pem"
```

## Endpoints

- **Connect / gRPC-Web / gRPC (h2c / HTTP/2 cleartext)**: `http://localhost:8069` (raw gRPC)
- **Webhook**: `http://localhost:8070/webhooks/lemonsqueezy/createdCheckout`

## Documentation

For complete gRPC API documentation, endpoint details, and integration guides, check [API references.](https://scrawn.vercel.app/docs/api-reference).
