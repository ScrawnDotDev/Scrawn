import type { ServerlessFunctionCallEventType } from "../interface/event/Event";
import { DateTime } from "luxon";

export class ServerlessFunctionCallEvent
  implements ServerlessFunctionCallEventType
{
  public reported_timestamp: DateTime;

  constructor(
    public userId: string,
    public data: { debitAmount: number },
    public type: "SERVERLESS_FUNCTION_CALL",
  ) {
    this.reported_timestamp = DateTime.utc();
  }

  serialize(): string {
    return JSON.stringify({
      type: this.type,
      userId: this.userId,
      reported_timestamp: this.reported_timestamp,
      data: this.data,
    });
  }
}
