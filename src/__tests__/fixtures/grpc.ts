import * as grpc from "@grpc/grpc-js";
import type {
  EventServiceClient,
  RegisterEventRequest,
  RegisterEventResponse,
} from "../../gen/event/v1/event";
import type {
  AuthServiceClient,
  CreateAPIKeyRequest,
  CreateAPIKeyResponse,
} from "../../gen/auth/v1/auth";

export const GRPC_ADDRESS = "localhost:18069";

export const grpcInsecureCredentials = grpc.credentials.createInsecure();

export function grpcMetadata(authHeader: string): grpc.Metadata {
  const metadata = new grpc.Metadata();
  metadata.set("authorization", authHeader);
  return metadata;
}

export function createAPIKey(
  client: AuthServiceClient,
  request: CreateAPIKeyRequest,
  metadata: grpc.Metadata
): Promise<CreateAPIKeyResponse> {
  return new Promise((resolve, reject) => {
    client.createApiKey(request, metadata, (error, res) => {
      if (error) reject(error);
      else if (!res) reject(new Error("empty response"));
      else resolve(res);
    });
  });
}

export function registerEvent(
  client: EventServiceClient,
  request: RegisterEventRequest,
  metadata: grpc.Metadata
): Promise<RegisterEventResponse> {
  return new Promise((resolve, reject) => {
    client.registerEvent(request, metadata, (error, res) => {
      if (error) reject(error);
      else if (!res) reject(new Error("empty response"));
      else resolve(res);
    });
  });
}
