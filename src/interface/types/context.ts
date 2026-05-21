import type { ServerReadableStream } from "@grpc/grpc-js";
import type {
  StreamEventRequest,
  StreamEventResponse,
} from "../../gen/event/v1/event";
import type { WideEventBuilder } from "../../context/requestContext";
import { apiKeyContextKey, type AuthContext } from "../../context/auth";
import { wideEventContextKey } from "../../context/requestContext";
import type { ServerUnaryCall, sendUnaryData } from "@grpc/grpc-js";
import type {
  CreateAPIKeyRequest,
  CreateAPIKeyResponse,
} from "../../gen/auth/v1/auth";

type WithContext<T> = T & {
  [wideEventContextKey]: WideEventBuilder | null;
  [apiKeyContextKey]: AuthContext | undefined;
};

export type ContextStreamCall = WithContext<
  ServerReadableStream<StreamEventRequest, StreamEventResponse>
>;

export type ContextUnaryCall<Req, Res> = WithContext<ServerUnaryCall<Req, Res>>;
