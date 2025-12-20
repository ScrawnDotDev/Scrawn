import type { AddKeyEvent, AddKeyEventData } from "../../interface/event/Event";
import { DateTime } from "luxon";

export class AddKey implements AddKeyEvent {
  public reported_timestamp: DateTime;
  public readonly type = "ADD_KEY" as const;

  constructor(public data: AddKeyEventData) {
    this.reported_timestamp = DateTime.utc();
  }

  serialize() {
    return {
      SQL: {
        type: this.type,
        reported_timestamp: this.reported_timestamp,
        data: this.data,
      },
    };
  }
}
