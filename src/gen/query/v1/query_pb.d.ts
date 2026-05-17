// package: query.v1
// file: query/v1/query.proto

import * as jspb from "google-protobuf";

export class FilterCondition extends jspb.Message {
  getField(): string;
  setField(value: string): void;

  getOperator(): OperatorMap[keyof OperatorMap];
  setOperator(value: OperatorMap[keyof OperatorMap]): void;

  getValue(): string;
  setValue(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): FilterCondition.AsObject;
  static toObject(includeInstance: boolean, msg: FilterCondition): FilterCondition.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: FilterCondition, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): FilterCondition;
  static deserializeBinaryFromReader(message: FilterCondition, reader: jspb.BinaryReader): FilterCondition;
}

export namespace FilterCondition {
  export type AsObject = {
    field: string,
    operator: OperatorMap[keyof OperatorMap],
    value: string,
  }
}

export class FilterGroup extends jspb.Message {
  getLogical(): LogicalOperatorMap[keyof LogicalOperatorMap];
  setLogical(value: LogicalOperatorMap[keyof LogicalOperatorMap]): void;

  clearConditionsList(): void;
  getConditionsList(): Array<FilterCondition>;
  setConditionsList(value: Array<FilterCondition>): void;
  addConditions(value?: FilterCondition, index?: number): FilterCondition;

  clearGroupsList(): void;
  getGroupsList(): Array<FilterGroup>;
  setGroupsList(value: Array<FilterGroup>): void;
  addGroups(value?: FilterGroup, index?: number): FilterGroup;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): FilterGroup.AsObject;
  static toObject(includeInstance: boolean, msg: FilterGroup): FilterGroup.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: FilterGroup, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): FilterGroup;
  static deserializeBinaryFromReader(message: FilterGroup, reader: jspb.BinaryReader): FilterGroup;
}

export namespace FilterGroup {
  export type AsObject = {
    logical: LogicalOperatorMap[keyof LogicalOperatorMap],
    conditionsList: Array<FilterCondition.AsObject>,
    groupsList: Array<FilterGroup.AsObject>,
  }
}

export class Aggregation extends jspb.Message {
  getType(): AggregationTypeMap[keyof AggregationTypeMap];
  setType(value: AggregationTypeMap[keyof AggregationTypeMap]): void;

  getField(): string;
  setField(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Aggregation.AsObject;
  static toObject(includeInstance: boolean, msg: Aggregation): Aggregation.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Aggregation, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Aggregation;
  static deserializeBinaryFromReader(message: Aggregation, reader: jspb.BinaryReader): Aggregation;
}

export namespace Aggregation {
  export type AsObject = {
    type: AggregationTypeMap[keyof AggregationTypeMap],
    field: string,
  }
}

export class GroupBy extends jspb.Message {
  getField(): string;
  setField(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GroupBy.AsObject;
  static toObject(includeInstance: boolean, msg: GroupBy): GroupBy.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GroupBy, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GroupBy;
  static deserializeBinaryFromReader(message: GroupBy, reader: jspb.BinaryReader): GroupBy;
}

export namespace GroupBy {
  export type AsObject = {
    field: string,
  }
}

export class QueryEventsRequest extends jspb.Message {
  hasWhere(): boolean;
  clearWhere(): void;
  getWhere(): FilterGroup | undefined;
  setWhere(value?: FilterGroup): void;

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
  static toObject(includeInstance: boolean, msg: QueryEventsRequest): QueryEventsRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: QueryEventsRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): QueryEventsRequest;
  static deserializeBinaryFromReader(message: QueryEventsRequest, reader: jspb.BinaryReader): QueryEventsRequest;
}

export namespace QueryEventsRequest {
  export type AsObject = {
    where?: FilterGroup.AsObject,
    aggregation?: Aggregation.AsObject,
    groupBy?: GroupBy.AsObject,
    limit: number,
    offset: number,
  }
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

  getBasicUsageType(): string;
  setBasicUsageType(value: string): void;

  getDebitAmount(): number;
  setDebitAmount(value: number): void;

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

  hasProvider(): boolean;
  clearProvider(): void;
  getProvider(): string;
  setProvider(value: string): void;

  hasInputCacheTokens(): boolean;
  clearInputCacheTokens(): void;
  getInputCacheTokens(): number;
  setInputCacheTokens(value: number): void;

  hasInputCacheDebitAmount(): boolean;
  clearInputCacheDebitAmount(): void;
  getInputCacheDebitAmount(): number;
  setInputCacheDebitAmount(value: number): void;

  hasMetadata(): boolean;
  clearMetadata(): void;
  getMetadata(): string;
  setMetadata(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): EventRow.AsObject;
  static toObject(includeInstance: boolean, msg: EventRow): EventRow.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: EventRow, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): EventRow;
  static deserializeBinaryFromReader(message: EventRow, reader: jspb.BinaryReader): EventRow;
}

export namespace EventRow {
  export type AsObject = {
    eventId: string,
    eventType: string,
    userId: string,
    reportedTimestamp: string,
    ingestedTimestamp: string,
    basicUsageType: string,
    debitAmount: number,
    model: string,
    inputTokens: number,
    outputTokens: number,
    inputDebitAmount: number,
    outputDebitAmount: number,
    provider: string,
    inputCacheTokens: number,
    inputCacheDebitAmount: number,
    metadata: string,
  }
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
  static toObject(includeInstance: boolean, msg: AggregationRow): AggregationRow.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: AggregationRow, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): AggregationRow;
  static deserializeBinaryFromReader(message: AggregationRow, reader: jspb.BinaryReader): AggregationRow;
}

export namespace AggregationRow {
  export type AsObject = {
    groupValue: string,
    aggValue: string,
  }
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
  static toObject(includeInstance: boolean, msg: QueryEventsResponse): QueryEventsResponse.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: QueryEventsResponse, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): QueryEventsResponse;
  static deserializeBinaryFromReader(message: QueryEventsResponse, reader: jspb.BinaryReader): QueryEventsResponse;
}

export namespace QueryEventsResponse {
  export type AsObject = {
    rowsList: Array<EventRow.AsObject>,
    aggRowsList: Array<AggregationRow.AsObject>,
    total: number,
  }
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

export interface LogicalOperatorMap {
  LOGICAL_OPERATOR_UNSPECIFIED: 0;
  AND: 1;
  OR: 2;
}

export const LogicalOperator: LogicalOperatorMap;

export interface BasicUsageFieldMap {
  BASIC_USAGE_FIELD_UNSPECIFIED: 0;
  BASIC_USAGE_EVENT_ID: 1;
  BASIC_USAGE_EVENT_TYPE: 2;
  BASIC_USAGE_USER_ID: 3;
  BASIC_USAGE_API_KEY_ID: 4;
  BASIC_USAGE_REPORTED_TIMESTAMP: 5;
  BASIC_USAGE_INGESTED_TIMESTAMP: 6;
  BASIC_USAGE_BASIC_USAGE_TYPE: 7;
  BASIC_USAGE_DEBIT_AMOUNT: 8;
  BASIC_USAGE_METADATA: 9;
}

export const BasicUsageField: BasicUsageFieldMap;

export interface AiTokenFieldMap {
  AI_TOKEN_FIELD_UNSPECIFIED: 0;
  AI_TOKEN_EVENT_ID: 1;
  AI_TOKEN_EVENT_TYPE: 2;
  AI_TOKEN_USER_ID: 3;
  AI_TOKEN_API_KEY_ID: 4;
  AI_TOKEN_REPORTED_TIMESTAMP: 5;
  AI_TOKEN_INGESTED_TIMESTAMP: 6;
  AI_TOKEN_MODEL: 7;
  AI_TOKEN_INPUT_TOKENS: 8;
  AI_TOKEN_OUTPUT_TOKENS: 9;
  AI_TOKEN_INPUT_DEBIT_AMOUNT: 10;
  AI_TOKEN_OUTPUT_DEBIT_AMOUNT: 11;
  AI_TOKEN_METADATA: 12;
}

export const AiTokenField: AiTokenFieldMap;

export interface PaymentFieldMap {
  PAYMENT_FIELD_UNSPECIFIED: 0;
  PAYMENT_EVENT_ID: 1;
  PAYMENT_EVENT_TYPE: 2;
  PAYMENT_USER_ID: 3;
  PAYMENT_API_KEY_ID: 4;
  PAYMENT_REPORTED_TIMESTAMP: 5;
  PAYMENT_INGESTED_TIMESTAMP: 6;
  PAYMENT_CREDIT_AMOUNT: 7;
}

export const PaymentField: PaymentFieldMap;

