import { status as grpcStatus } from "@grpc/grpc-js";
import type {
  ServerUnaryCall,
  ServerReadableStream,
  ServerWritableStream,
  ServerDuplexStream,
  sendUnaryData,
  Metadata,
} from "@grpc/grpc-js";
import {
  wideEventContextKey,
  type WideEventBuilder,
} from "../context/requestContext";
import { apiKeyContextKey, type AuthContext } from "../context/auth";
import { AuthError } from "../errors/auth";
import { apiKeyCache } from "../utils/apiKeyCache";
import { getPostgresDB } from "../storage/db/postgres/db";
import {
  apiKeysTable,
  webhookEndpointsTable,
} from "../storage/db/postgres/schema";
import { eq, and, isNull } from "drizzle-orm";
import { hashAPIKey } from "../utils/hashAPIKey";
import { DateTime } from "luxon";
import {
  parseRoleFromApiKey,
  getModeForRole,
  isValidApiKeyFormat,
} from "../utils/keyFormat";
import type { ApiKeyRole } from "../utils/keyFormat";
import { Cache } from "../utils/cacheStore";

const no_auth: string[] = [];

const WEBHOOK_REQUIRED_PATHS = [
  "/event.v1.EventService/RegisterEvent",
  "/event.v1.EventService/StreamEvents",
  "/payment.v1.PaymentService/CreateCheckoutLink",
];

const webhookEndpointCache = Cache.getStore<string, boolean>(
  "webhook-endpoints",
  {
    max: 1000,
    ttlMs: 60 * 1000,
  }
);

/**
 * Invalidate the cached webhook endpoint existence for an API key.
 * Must be called after upserting or deleting a webhook endpoint so
 * the auth interceptor re-queries the database on the next request.
 */
export function invalidateWebhookEndpointCache(apiKeyId: string): void {
  webhookEndpointCache.delete(apiKeyId);
}

interface GrpcCallContext {
  [wideEventContextKey]: WideEventBuilder | null;
  [apiKeyContextKey]: AuthContext | undefined;
  metadata: Metadata;
}

type GrpcCall<Req, Res> =
  | (ServerUnaryCall<Req, Res> & GrpcCallContext)
  | (ServerReadableStream<Req, Res> & GrpcCallContext)
  | (ServerWritableStream<Req, Res> & GrpcCallContext)
  | (ServerDuplexStream<Req, Res> & GrpcCallContext);

export type { GrpcCall };

export type GrpcHandler<Req, Res> = (
  call: GrpcCall<Req, Res>,
  callback?: sendUnaryData<Res>
) => void | Promise<void>;

export type GrpcUntypedHandler = (
  call: unknown,
  callback?: sendUnaryData<unknown>
) => void | Promise<void>;

export type GrpcFlexibleHandler = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  call: any,
  callback?: sendUnaryData<unknown>
) => void | Promise<void>;

async function checkWebhookEndpoint(apiKeyId: string): Promise<boolean> {
  const cached = webhookEndpointCache.get(apiKeyId);
  if (cached !== undefined) return cached;

  const db = getPostgresDB();
  const [endpoint] = await db
    .select({ id: webhookEndpointsTable.id })
    .from(webhookEndpointsTable)
    .where(
      and(
        eq(webhookEndpointsTable.apiKeyId, apiKeyId),
        isNull(webhookEndpointsTable.deletedAt)
      )
    )
    .limit(1);

  const exists = !!endpoint;
  webhookEndpointCache.set(apiKeyId, exists);
  return exists;
}

/**
 * Auth interceptor for gRPC — validates API key, extracts role, sets context.
 */
export function authInterceptor<Req, Res>(
  methodPath: string,
  handler: GrpcHandler<Req, Res>
): GrpcHandler<Req, Res> {
  return (call: GrpcCall<Req, Res>, callback) => {
    const fullPath = methodPath.startsWith("/") ? methodPath : `/${methodPath}`;
    if (no_auth.some((path) => fullPath === path || fullPath.endsWith(path))) {
      return handler(call, callback);
    }

    const wideEventBuilder = call[wideEventContextKey];

    const authHeader = call.metadata.get("authorization")?.[0] as
      | string
      | undefined;

    if (!authHeader) {
      return callback?.(AuthError.missingHeader());
    }

    if (!authHeader.startsWith("Bearer ")) {
      return callback?.(AuthError.invalidHeaderFormat());
    }

    const apiKey = authHeader.slice("Bearer ".length).trim();

    const role = parseRoleFromApiKey(apiKey);
    if (!role) {
      return callback?.(
        AuthError.invalidAPIKey(
          "Invalid key prefix — expected scrn_dash_, scrn_live_, or scrn_test_"
        )
      );
    }

    if (!isValidApiKeyFormat(apiKey, role)) {
      return callback?.(AuthError.invalidAPIKey("Invalid API key format"));
    }

    const mode = getModeForRole(role);
    const apiKeyHash = hashAPIKey(apiKey);

    const needsWebhook =
      role !== "dashboard" && WEBHOOK_REQUIRED_PATHS.includes(fullPath);

    const cached = apiKeyCache.get(apiKeyHash);
    if (cached) {
      if (cached.role !== role) {
        return callback?.(
          AuthError.roleMismatch(
            `Key prefix ${role} doesn't match stored role ${cached.role}`
          )
        );
      }
      call[apiKeyContextKey] = {
        apiKeyId: cached.id,
        role: cached.role,
        mode: cached.mode,
      };
      wideEventBuilder?.setAuth(cached.id, true);

      if (needsWebhook) {
        checkWebhookEndpoint(cached.id)
          .then((hasEndpoint) => {
            if (!hasEndpoint) {
              return callback?.(
                AuthError.permissionDenied(
                  "A webhook endpoint must be configured before using this API key. " +
                    "Register one via POST /api/v1/internals/webhook-endpoint"
                )
              );
            }
            return handler(call, callback);
          })
          .catch((error) => callback?.(error));
        return;
      }

      return handler(call, callback);
    }

    lookupApiKey(apiKeyHash)
      .then((apiKeyRecord) => {
        if (!apiKeyRecord) {
          return callback?.(AuthError.invalidAPIKey("API key not found"));
        }

        if (apiKeyRecord.revoked) {
          return callback?.(AuthError.revokedAPIKey());
        }

        if (
          DateTime.utc() >
          DateTime.fromISO(apiKeyRecord.expiresAt, { zone: "utc" })
        ) {
          return callback?.(AuthError.expiredAPIKey());
        }

        if (apiKeyRecord.role !== role) {
          return callback?.(
            AuthError.roleMismatch(
              `Key prefix ${role} doesn't match stored role ${apiKeyRecord.role}`
            )
          );
        }

        const recordMode = getModeForRole(apiKeyRecord.role as ApiKeyRole);

        apiKeyCache.set(apiKeyHash, {
          id: apiKeyRecord.id,
          role: apiKeyRecord.role as ApiKeyRole,
          mode: recordMode,
          expiresAt: apiKeyRecord.expiresAt,
        });

        call[apiKeyContextKey] = {
          apiKeyId: apiKeyRecord.id,
          role: apiKeyRecord.role as ApiKeyRole,
          mode: recordMode,
        };
        wideEventBuilder?.setAuth(apiKeyRecord.id, false);

        if (needsWebhook) {
          return checkWebhookEndpoint(apiKeyRecord.id)
            .then((hasEndpoint) => {
              if (!hasEndpoint) {
                return callback?.(
                  AuthError.permissionDenied(
                    "A webhook endpoint must be configured before using this API key. " +
                      "Register one via POST /api/v1/internals/webhook-endpoint"
                  )
                );
              }
              return handler(call, callback);
            })
            .catch((error) => callback?.(error));
        }

        return handler(call, callback);
      })
      .catch((error) => {
        return callback?.(error);
      });
  };
}

async function lookupApiKey(apiKeyHash: string) {
  const db = getPostgresDB();
  const result = await db
    .select({
      id: apiKeysTable.id,
      role: apiKeysTable.role,
      expiresAt: apiKeysTable.expiresAt,
      revoked: apiKeysTable.revoked,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.key, apiKeyHash))
    .limit(1);

  return result[0];
}
