import * as grpc from "@grpc/grpc-js";
import type {
  DataQueryServiceClient,
  QueryRequest,
  QueryResponse,
} from "../../gen/data/v1/data";

export function queryData(
  client: DataQueryServiceClient,
  request: QueryRequest,
  metadata: grpc.Metadata
): Promise<QueryResponse> {
  return new Promise((resolve, reject) => {
    client.query(request, metadata, (error, res) => {
      if (error) reject(error);
      else if (!res) reject(new Error("empty response"));
      else resolve(res);
    });
  });
}
