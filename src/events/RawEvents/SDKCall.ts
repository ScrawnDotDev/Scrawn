import type {
  SDKCallEvent,
  SDKCallEventData,
} from "../../interface/event/Event";
import { DateTime } from "luxon";
import type { UserId } from "../../config/identifiers";

export class SDKCall implements SDKCallEvent {
  public ingested_timestamp: DateTime;
  public readonly type = "SDK_CALL" as const;

  constructor(
    public userId: UserId,
    public reportedTimestamp: DateTime,
    public data: SDKCallEventData
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
