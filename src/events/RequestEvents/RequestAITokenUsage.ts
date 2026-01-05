import type {
  RequestAITokenUsageEventData,
  RequestAITokenUsageEvent,
} from "../../interface/event/Event";
import { DateTime } from "luxon";
import type { UserId } from "../../config/identifiers";

export class RequestAITokenUsage implements RequestAITokenUsageEvent {
  public reported_timestamp: DateTime;
  public readonly type = "REQUEST_AI_TOKEN_USAGE" as const;

  constructor(
    public userId: UserId,
    public data: RequestAITokenUsageEventData,
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
