import { createClient, type ClickHouseClient } from "@clickhouse/client";

let clickhouseClient: ClickHouseClient | null = null;

export function getClickHouseDB(CLICKHOUSE_URL?: string): ClickHouseClient {
  if (clickhouseClient) return clickhouseClient;

  if (!CLICKHOUSE_URL) {
    throw new Error("CLICKHOUSE_URL is not defined");
  }

  clickhouseClient = createClient({
    url: CLICKHOUSE_URL,
  });

  return clickhouseClient;
}
