import type {
  RequestPaymentEvent,
  RequestPaymentEventData,
} from "../../interface/event/Event";
import { DateTime } from "luxon";
import type { UserId } from "../../config/identifiers";

export class RequestPayment implements RequestPaymentEvent {
  public reported_timestamp: DateTime;
  public readonly type = "REQUEST_PAYMENT" as const;

  constructor(
    public userId: UserId,
    public data: RequestPaymentEventData
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
