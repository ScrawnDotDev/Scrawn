import type { ServerlessFunctionCallEventType } from "../interface/event/Event";
import { DateTime } from "luxon";

export class ServerlessFunctionCallEvent
  implements ServerlessFunctionCallEventType
{
  public reported_timestamp: DateTime;
  public readonly type = "SERVERLESS_FUNCTION_CALL" as const;

  constructor(
    public userId: string,
    public data: { debitAmount: number },
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
