import type { DateTime } from "luxon";

export function toClickHouseDateTime(dt: DateTime): string {
  return dt.toUTC().toFormat("yyyy-MM-dd HH:mm:ss.SSS");
}
