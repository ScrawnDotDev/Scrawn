import type {
  AITokenUsageEvent,
  AITokenUsageEventData,
} from "../../interface/event/Event";
import { DateTime } from "luxon";
import type { UserId } from "../../config/identifiers";

export class AITokenUsage implements AITokenUsageEvent {
  public reported_timestamp: DateTime;
  public readonly type = "AI_TOKEN_USAGE" as const;

  constructor(
    public userId: UserId,
    public data: AITokenUsageEventData
  ) {
    this.reported_timestamp = DateTime.utc();
  }

  serialize() {
    return {
      SQL: {
        type: this.type,
        userId: this.userId,
        reported_timestamp: this.reported_timestamp,
        data: this.data,
      },
    };
  }
}
