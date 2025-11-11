import type {
  RequestPaymentEventType,
  RequestPaymentEventData,
} from "../../interface/event/Event";
import { DateTime } from "luxon";

export class RequestPayment implements RequestPaymentEventType {
  public reported_timestamp: DateTime;
  public readonly type = "REQUEST_PAYMENT" as const;

  constructor(
    public userId: string,
    public data: RequestPaymentEventData,
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
