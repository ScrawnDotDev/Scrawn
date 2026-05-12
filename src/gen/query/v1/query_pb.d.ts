// package: query.v1
// file: query/v1/query.proto

import * as jspb from "google-protobuf";

export class Filter extends jspb.Message {
  getField(): string;
  setField(value: string): void;

  getOperator(): OperatorMap[keyof OperatorMap];
  setOperator(value: OperatorMap[keyof OperatorMap]): void;

  getValue(): string;
  setValue(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Filter.AsObject;
  static toObject(includeInstance: boolean, msg: Filter): Filter.AsObject;
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> };
  static extensionsBinary: {
    [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>;
  };
  static serializeBinaryToWriter(
    message: Filter,
    writer: jspb.BinaryWriter
  ): void;
  static deserializeBinary(bytes: Uint8Array): Filter;
  static deserializeBinaryFromReader(
    message: Filter,
    reader: jspb.BinaryReader
  ): Filter;
}

export namespace Filter {
  export type AsObject = {
    field: string;
    operator: OperatorMap[keyof OperatorMap];
    value: string;
  };
}

export class Aggregation extends jspb.Message {
  getType(): AggregationTypeMap[keyof AggregationTypeMap];
  setType(value: AggregationTypeMap[keyof AggregationTypeMap]): void;

  getField(): string;
  setField(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Aggregation.AsObject;
  static toObject(
    includeInstance: boolean,
    msg: Aggregation
  ): Aggregation.AsObject;
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> };
  static extensionsBinary: {
    [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>;
  };
  static serializeBinaryToWriter(
    message: Aggregation,
    writer: jspb.BinaryWriter
  ): void;
  static deserializeBinary(bytes: Uint8Array): Aggregation;
  static deserializeBinaryFromReader(
    message: Aggregation,
    reader: jspb.BinaryReader
  ): Aggregation;
}

export namespace Aggregation {
  export type AsObject = {
    type: AggregationTypeMap[keyof AggregationTypeMap];
    field: string;
  };
}

export class GroupBy extends jspb.Message {
  getField(): string;
  setField(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GroupBy.AsObject;
  static toObject(includeInstance: boolean, msg: GroupBy): GroupBy.AsObject;
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> };
  static extensionsBinary: {
    [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>;
  };
  static serializeBinaryToWriter(
    message: GroupBy,
    writer: jspb.BinaryWriter
  ): void;
  static deserializeBinary(bytes: Uint8Array): GroupBy;
  static deserializeBinaryFromReader(
    message: GroupBy,
    reader: jspb.BinaryReader
  ): GroupBy;
}

export namespace GroupBy {
  export type AsObject = {
    field: string;
  };
}

export class QueryEventsRequest extends jspb.Message {
  clearFiltersList(): void;
  getFiltersList(): Array<Filter>;
  setFiltersList(value: Array<Filter>): void;
  addFilters(value?: Filter, index?: number): Filter;

  hasAggregation(): boolean;
  clearAggregation(): void;
  getAggregation(): Aggregation | undefined;
  setAggregation(value?: Aggregation): void;

  hasGroupBy(): boolean;
  clearGroupBy(): void;
  getGroupBy(): GroupBy | undefined;
  setGroupBy(value?: GroupBy): void;

  getLimit(): number;
  setLimit(value: number): void;

  getOffset(): number;
  setOffset(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): QueryEventsRequest.AsObject;
  static toObject(
    includeInstance: boolean,
    msg: QueryEventsRequest
  ): QueryEventsRequest.AsObject;
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> };
  static extensionsBinary: {
    [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>;
  };
  static serializeBinaryToWriter(
    message: QueryEventsRequest,
    writer: jspb.BinaryWriter
  ): void;
  static deserializeBinary(bytes: Uint8Array): QueryEventsRequest;
  static deserializeBinaryFromReader(
    message: QueryEventsRequest,
    reader: jspb.BinaryReader
  ): QueryEventsRequest;
}

export namespace QueryEventsRequest {
  export type AsObject = {
    filtersList: Array<Filter.AsObject>;
    aggregation?: Aggregation.AsObject;
    groupBy?: GroupBy.AsObject;
    limit: number;
    offset: number;
  };
}

export class EventRow extends jspb.Message {
  getEventId(): string;
  setEventId(value: string): void;

  getEventType(): string;
  setEventType(value: string): void;

  getUserId(): string;
  setUserId(value: string): void;

  getReportedTimestamp(): string;
  setReportedTimestamp(value: string): void;

  getIngestedTimestamp(): string;
  setIngestedTimestamp(value: string): void;

  hasSdkCallType(): boolean;
  clearSdkCallType(): void;
  getSdkCallType(): string;
  setSdkCallType(value: string): void;

  hasDebitAmount(): boolean;
  clearDebitAmount(): void;
  getDebitAmount(): number;
  setDebitAmount(value: number): void;

  hasCreditAmount(): boolean;
  clearCreditAmount(): void;
  getCreditAmount(): number;
  setCreditAmount(value: number): void;

  hasModel(): boolean;
  clearModel(): void;
  getModel(): string;
  setModel(value: string): void;

  hasInputTokens(): boolean;
  clearInputTokens(): void;
  getInputTokens(): number;
  setInputTokens(value: number): void;

  hasOutputTokens(): boolean;
  clearOutputTokens(): void;
  getOutputTokens(): number;
  setOutputTokens(value: number): void;

  hasInputDebitAmount(): boolean;
  clearInputDebitAmount(): void;
  getInputDebitAmount(): number;
  setInputDebitAmount(value: number): void;

  hasOutputDebitAmount(): boolean;
  clearOutputDebitAmount(): void;
  getOutputDebitAmount(): number;
  setOutputDebitAmount(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): EventRow.AsObject;
  static toObject(includeInstance: boolean, msg: EventRow): EventRow.AsObject;
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> };
  static extensionsBinary: {
    [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>;
  };
  static serializeBinaryToWriter(
    message: EventRow,
    writer: jspb.BinaryWriter
  ): void;
  static deserializeBinary(bytes: Uint8Array): EventRow;
  static deserializeBinaryFromReader(
    message: EventRow,
    reader: jspb.BinaryReader
  ): EventRow;
}

export namespace EventRow {
  export type AsObject = {
    eventId: string;
    eventType: string;
    userId: string;
    reportedTimestamp: string;
    ingestedTimestamp: string;
    sdkCallType: string;
    debitAmount: number;
    creditAmount: number;
    model: string;
    inputTokens: number;
    outputTokens: number;
    inputDebitAmount: number;
    outputDebitAmount: number;
  };
}

export class AggregationRow extends jspb.Message {
  hasGroupValue(): boolean;
  clearGroupValue(): void;
  getGroupValue(): string;
  setGroupValue(value: string): void;

  getAggValue(): string;
  setAggValue(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): AggregationRow.AsObject;
  static toObject(
    includeInstance: boolean,
    msg: AggregationRow
  ): AggregationRow.AsObject;
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> };
  static extensionsBinary: {
    [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>;
  };
  static serializeBinaryToWriter(
    message: AggregationRow,
    writer: jspb.BinaryWriter
  ): void;
  static deserializeBinary(bytes: Uint8Array): AggregationRow;
  static deserializeBinaryFromReader(
    message: AggregationRow,
    reader: jspb.BinaryReader
  ): AggregationRow;
}

export namespace AggregationRow {
  export type AsObject = {
    groupValue: string;
    aggValue: string;
  };
}

export class QueryEventsResponse extends jspb.Message {
  clearRowsList(): void;
  getRowsList(): Array<EventRow>;
  setRowsList(value: Array<EventRow>): void;
  addRows(value?: EventRow, index?: number): EventRow;

  clearAggRowsList(): void;
  getAggRowsList(): Array<AggregationRow>;
  setAggRowsList(value: Array<AggregationRow>): void;
  addAggRows(value?: AggregationRow, index?: number): AggregationRow;

  getTotal(): number;
  setTotal(value: number): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): QueryEventsResponse.AsObject;
  static toObject(
    includeInstance: boolean,
    msg: QueryEventsResponse
  ): QueryEventsResponse.AsObject;
  static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> };
  static extensionsBinary: {
    [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>;
  };
  static serializeBinaryToWriter(
    message: QueryEventsResponse,
    writer: jspb.BinaryWriter
  ): void;
  static deserializeBinary(bytes: Uint8Array): QueryEventsResponse;
  static deserializeBinaryFromReader(
    message: QueryEventsResponse,
    reader: jspb.BinaryReader
  ): QueryEventsResponse;
}

export namespace QueryEventsResponse {
  export type AsObject = {
    rowsList: Array<EventRow.AsObject>;
    aggRowsList: Array<AggregationRow.AsObject>;
    total: number;
  };
}

export interface OperatorMap {
  OPERATOR_UNSPECIFIED: 0;
  EQ: 1;
  GT: 2;
  GTE: 3;
  LT: 4;
  LTE: 5;
  NEQ: 6;
}

export const Operator: OperatorMap;

export interface AggregationTypeMap {
  AGGREGATION_TYPE_UNSPECIFIED: 0;
  SUM: 1;
  COUNT: 2;
}

export const AggregationType: AggregationTypeMap;
