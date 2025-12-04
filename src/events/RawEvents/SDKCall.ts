import type { SDKCallEventType } from "../../interface/event/Event";
import { DateTime } from "luxon";
import type { EventUnion } from "../../interface/event/Event";
import { type UserId } from "../../config/identifiers";

export class SDKCall implements SDKCallEventType {
  public reported_timestamp: DateTime;
  public readonly type = "SDK_CALL" as const;

  constructor(
    public userId: UserId,
    public data: EventUnion<"SDK_CALL">,
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
