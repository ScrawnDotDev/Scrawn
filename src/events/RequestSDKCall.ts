import type {
  RequestSDKCallEventData,
  RequestSDKCallEventType,
} from "../interface/event/Event";
import { DateTime } from "luxon";

export class RequestSDKCall implements RequestSDKCallEventType {
  public reported_timestamp: DateTime;
  public readonly type = "REQUEST_SDK_CALL" as const;

  constructor(
    public userId: string,
    public data: RequestSDKCallEventData,
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
