import type {
  BasicUsageEvent,
  BasicUsageEventData,
} from "../interface/event/Event";
import { DateTime } from "luxon";
import type { UserId } from "../config/identifiers";

export class BasicUsage implements BasicUsageEvent {
  public ingested_timestamp: DateTime;
  public readonly type = "BASIC_USAGE" as const;

  constructor(
    public userId: UserId,
    public reportedTimestamp: DateTime,
    public data: BasicUsageEventData,
    public eventId: string,
    public idempotencyKey: string
  ) {
    this.ingested_timestamp = DateTime.utc();
  }

  serialize() {
    return {
      SQL: {
        type: this.type,
        userId: this.userId,
        reported_timestamp: this.reportedTimestamp,
        data: this.data,
        eventId: this.eventId,
        idempotencyKey: this.idempotencyKey,
      },
    };
  }
}
