import type { SDKCallEventType } from "../interface/event/Event";
import { DateTime } from "luxon";
import type { SDKCallEventData, EventUnion } from "../interface/event/Event";

export class SDKCall implements SDKCallEventType {
  public reported_timestamp: DateTime;
  public readonly type = "SDK_CALL" as const;

  constructor(
    public userId: string,
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
