import type {
  MetadataEvent,
  MetadataEventData,
} from "../../interface/event/Event";
import { DateTime } from "luxon";

export class Metadata implements MetadataEvent {
  public ingested_timestamp: DateTime;
  public readonly type = "METADATA" as const;

  constructor(public data: MetadataEventData) {
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
