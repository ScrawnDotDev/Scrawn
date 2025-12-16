import type { AITokenUsageEventType } from "../../interface/event/Event";
import { DateTime } from "luxon";
import type { EventUnion } from "../../interface/event/Event";
import { type UserId } from "../../config/identifiers";

export class AITokenUsage implements AITokenUsageEventType {
  public reported_timestamp: DateTime;
  public readonly type = "AI_TOKEN_USAGE" as const;

  constructor(
    public userId: UserId,
    public data: EventUnion<"AI_TOKEN_USAGE">,
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
