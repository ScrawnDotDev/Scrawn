import type {
  AITokenUsageEvent,
  AITokenUsageEventData,
} from "../../interface/event/Event";
import { DateTime } from "luxon";
import type { UserId } from "../../config/identifiers";

export class AITokenUsage implements AITokenUsageEvent {
  public ingested_timestamp: DateTime;
  public readonly type = "AI_TOKEN_USAGE" as const;

  constructor(
    public userId: UserId,
    public reportedTimestamp: DateTime,
    public data: AITokenUsageEventData
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
      },
    };
  }
}
