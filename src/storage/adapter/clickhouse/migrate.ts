import { getClickHouseDB } from "../../db/clickhouse";
import { runClickHouseMigrations } from "./schema";

const url = process.env.CLICKHOUSE_URL;

if (!url) {
  console.error("CLICKHOUSE_URL environment variable is not set");
  process.exit(1);
}

async function main(): Promise<void> {
  console.log("Initializing ClickHouse connection...");
  getClickHouseDB(url);
  console.log("Running ClickHouse migrations...");
  await runClickHouseMigrations();
  console.log("ClickHouse migrations completed successfully");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
