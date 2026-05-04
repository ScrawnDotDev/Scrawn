import type { UserEvent, UserEventData } from "../../interface/event/Event";
import { DateTime } from "luxon";

export class User implements UserEvent {
  public ingested_timestamp: DateTime;
  public readonly type = "USER" as const;

  constructor(public data: UserEventData) {
    this.ingested_timestamp = DateTime.utc();
  }

  serialize() {
    return {
      SQL: {
        type: this.type,
        reported_timestamp: this.ingested_timestamp,
        data: this.data,
      },
    };
  }
}