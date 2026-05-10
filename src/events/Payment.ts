import type {
  PaymentEvent,
  PaymentEventData,
} from "../interface/event/Event";
import { DateTime } from "luxon";
import type { UserId } from "../config/identifiers";

export class Payment implements PaymentEvent {
  public ingested_timestamp: DateTime;
  public readonly type = "PAYMENT" as const;

  constructor(
    public userId: UserId,
    public data: PaymentEventData
  ) {
    this.ingested_timestamp = DateTime.utc();
  }

  serialize() {
    return {
      SQL: {
        type: this.type,
        userId: this.userId,
        reported_timestamp: this.ingested_timestamp,
        data: this.data,
      },
    };
  }
}
