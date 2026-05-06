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
import { apiKeyContextKey } from "../context/auth";
import { AuthError } from "../errors/auth";
import { apiKeyCache } from "../utils/apiKeyCache";
import { getPostgresDB } from "../storage/db/postgres/db";
import { apiKeysTable } from "../storage/db/postgres/schema";
import { eq } from "drizzle-orm";
import { hashAPIKey } from "../utils/hashAPIKey";
import { DateTime } from "luxon";

// Whitelisted endpoints that don't require auth
const no_auth = ["/auth.v1.AuthService/CreateAPIKey", "CreateAPIKey"];

interface GrpcCallContext {
  [wideEventContextKey]: WideEventBuilder | null;
  [apiKeyContextKey]: string | undefined;
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

// Untyped handler for gRPC server registration boundary
export type GrpcUntypedHandler = (
  call: unknown,
  callback?: sendUnaryData<unknown>
) => void | Promise<void>;

// Handler with flexible call type for interceptors
export type GrpcFlexibleHandler = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  call: any,
  callback?: sendUnaryData<unknown>
) => void | Promise<void>;

/**
 * Auth interceptor for gRPC - validates API key from metadata
 */
export function authInterceptor<Req, Res>(
  methodPath: string,
  handler: GrpcHandler<Req, Res>
): GrpcHandler<Req, Res> {
  return (call: GrpcCall<Req, Res>, callback) => {
    if (isWhitelistedEndpoint(methodPath)) {
      return handler(call, callback);
    }

    const authResult = extractAndValidateAuth(call);
    if (authResult.error) {
      return callback?.(authResult.error);
    }

    const apiKey = authResult.apiKey!;
    const apiKeyHash = hashAPIKey(apiKey);

    const cached = apiKeyCache.get(apiKeyHash);
    if (cached) {
      call[apiKeyContextKey] = cached.id;
      call[wideEventContextKey]?.setAuth(cached.id, true);
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

        if (DateTime.utc() > DateTime.fromISO(apiKeyRecord.expiresAt)) {
          return callback?.(AuthError.expiredAPIKey());
        }

        apiKeyCache.set(apiKeyHash, {
          id: apiKeyRecord.id,
          expiresAt: apiKeyRecord.expiresAt,
        });

        call[apiKeyContextKey] = apiKeyRecord.id;
        call[wideEventContextKey]?.setAuth(apiKeyRecord.id, false);

        return handler(call, callback);
      })
      .catch((error) => {
        return callback?.(error);
      });
  };
}

function isWhitelistedEndpoint(methodPath: string): boolean {
  const fullPath = methodPath.startsWith("/") ? methodPath : `/${methodPath}`;
  return no_auth.some((path) => fullPath === path || fullPath.endsWith(path));
}

function extractAndValidateAuth(call: GrpcCall<unknown, unknown>): { apiKey?: string; error?: Error } {
  const authHeader = call.metadata.get("authorization")?.[0] as string | undefined;

  if (!authHeader) {
    return { error: AuthError.missingHeader() };
  }

  if (!authHeader.startsWith("Bearer ")) {
    return { error: AuthError.invalidHeaderFormat() };
  }

  const apiKey = authHeader.slice("Bearer ".length).trim();

  if (!apiKey.startsWith("scrn_") || apiKey.length !== 37) {
    return { error: AuthError.invalidAPIKey("Invalid API key format") };
  }

  return { apiKey };
}

async function lookupApiKey(apiKeyHash: string) {
  const db = getPostgresDB();
  const result = await db
    .select({
      id: apiKeysTable.id,
      expiresAt: apiKeysTable.expiresAt,
      revoked: apiKeysTable.revoked,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.key, apiKeyHash))
    .limit(1);

  return result[0];
}
