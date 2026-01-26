import type {
  RequestSDKCallEventData,
  RequestSDKCallEvent,
} from "../../interface/event/Event";
import { DateTime } from "luxon";
import type { UserId } from "../../config/identifiers";

export class RequestSDKCall implements RequestSDKCallEvent {
  public reported_timestamp: DateTime;
  public readonly type = "REQUEST_SDK_CALL" as const;

  constructor(
    public userId: UserId,
    public data: RequestSDKCallEventData
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
