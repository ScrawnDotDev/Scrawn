import { describe, beforeAll, afterAll, it, expect } from "vitest";
import { DataQueryServiceClient, OrderBy } from "../gen/data/v1/data";
import {
  GRPC_ADDRESS,
  grpcInsecureCredentials,
  grpcMetadata,
} from "./fixtures/grpc";
import { createTestApiKey } from "./fixtures/apiKey";
import { clearDatabase } from "./db";
import { queryData } from "./fixtures/query";
import { getPostgresDB } from "../storage/db/postgres/db";
import { tagsTable } from "../storage/db/postgres/schema";
import { FilterCondition, FilterGroup } from "../gen/query/v1/query";
import { Metadata } from "@grpc/grpc-js";

describe("Data Query", () => {
  let client: DataQueryServiceClient;
  let rawKey: string;

  beforeAll(async () => {
    client = new DataQueryServiceClient(GRPC_ADDRESS, grpcInsecureCredentials);
    const key = await createTestApiKey();
    rawKey = key.rawKey;
  });

  afterAll(async () => {
    await clearDatabase();
    client.close();
  });

  it("1. returns data when auth is valid and table exists", async () => {
    const db = getPostgresDB();
    await db.insert(tagsTable).values({
      key: "PREMIUM_CALL",
      amount: 100,
    });

    const QueryRequest = {
      table: "tags",
      where: FilterGroup.create({
        logical: 1,
        conditions: [
          FilterCondition.create({
            field: "key",
            operator: 1,
            value: "PREMIUM_CALL",
          }),
        ],
        groups: [],
      }),
      orderBy: [],
      limit: 100,
      offset: 0,
    };

    const response = await queryData(
      client,
      QueryRequest,
      grpcMetadata(`Bearer ${rawKey}`)
    );

    expect(response.columns).toContain("key");
    expect(response.columns).toContain("amount");
    expect(response.total).toBe(1);
    expect(response.rows.length).toBe(1);
    // expect(response.rows).toBeDefined();
    expect(response.rows[0]?.values).toBeDefined();
    expect(response.rows[0]?.values).toContain("PREMIUM_CALL");
    expect(response.rows[0]?.values).toContain("100");
  });

  it("2. returns error when table does not exist", async () => {
    const QueryRequest = {
      table: "nonexistent",
      where: FilterGroup.create({
        logical: 1,
        conditions: [],
        groups: [],
      }),
      orderBy: [],
      limit: 100,
      offset: 0,
    };

    await expect(
      queryData(client, QueryRequest, grpcMetadata(`Bearer ${rawKey}`))
    ).rejects.toThrow(
      'table: Invalid option: expected one of "users"|"sessions"|"tags"|"expressions"|"metadata"'
    );
  });

  it("3. rejects requests without auth", async () => {
    const QueryRequest = {
      table: "users",
      where: FilterGroup.create({
        logical: 1,
        conditions: [],
        groups: [],
      }),
      orderBy: [],
      limit: 100,
      offset: 0,
    };

    await expect(
      queryData(client, QueryRequest, new Metadata())
    ).rejects.toThrow("Missing Authorization header");
  });

  it("4. returns 0 results when no rows match the filter", async () => {
    const db = getPostgresDB();
    await db.insert(tagsTable).values({ key: "CHEAP", amount: 200 });

    const request = {
      table: "tags",
      where: FilterGroup.create({
        logical: 1,
        conditions: [
          FilterCondition.create({
            field: "amount",
            operator: 1,
            value: "696",
          }),
        ],
        groups: [],
      }),
      orderBy: [],
      limit: 100,
      offset: 0,
    };

    const response = await queryData(
      client,
      request,
      grpcMetadata(`Bearer ${rawKey}`)
    );

    expect(response.total).toBe(0);
    expect(response.rows.length).toBe(0);
  });

  it("5. returns all rows when no filter is provided", async () => {
    const db = getPostgresDB();
    await db.insert(tagsTable).values({ key: "A", amount: 1 });
    await db.insert(tagsTable).values({ key: "B", amount: 2 });
    await db.insert(tagsTable).values({ key: "C", amount: 3 });

    const request = {
      table: "tags",
      where: FilterGroup.create({
        logical: 1,
        conditions: [],
        groups: [],
      }),
      orderBy: [],
      limit: 100,
      offset: 0,
    };

    const response = await queryData(
      client,
      request,
      grpcMetadata(`Bearer ${rawKey}`)
    );

    expect(response.total).toBeGreaterThanOrEqual(3);
    expect(response.rows.length).toBeGreaterThanOrEqual(3);
    expect(response.columns).toContain("key");
    expect(response.columns).toContain("amount");
  });

  it("6. supports pagination with limit and offset", async () => {
    const db = getPostgresDB();
    await db.insert(tagsTable).values({ key: "P1", amount: 10 });
    await db.insert(tagsTable).values({ key: "P2", amount: 20 });
    await db.insert(tagsTable).values({ key: "P3", amount: 30 });
    await db.insert(tagsTable).values({ key: "P4", amount: 40 });
    await db.insert(tagsTable).values({ key: "P5", amount: 50 });

    const page1 = await queryData(
      client,
      {
        table: "tags",
        where: FilterGroup.create({ logical: 1, conditions: [], groups: [] }),
        orderBy: [],
        limit: 2,
        offset: 0,
      },
      grpcMetadata(`Bearer ${rawKey}`)
    );

    expect(page1.total).toBeGreaterThanOrEqual(5);
    expect(page1.rows.length).toBe(2);

    const page2 = await queryData(
      client,
      {
        table: "tags",
        where: FilterGroup.create({ logical: 1, conditions: [], groups: [] }),
        orderBy: [],
        limit: 2,
        offset: 2,
      },
      grpcMetadata(`Bearer ${rawKey}`)
    );

    expect(page2.rows.length).toBe(2);

    const page3 = await queryData(
      client,
      {
        table: "tags",
        where: FilterGroup.create({ logical: 1, conditions: [], groups: [] }),
        orderBy: [],
        limit: 2,
        offset: 4,
      },
      grpcMetadata(`Bearer ${rawKey}`)
    );

    expect(page3.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("7. rejects invalid integer value in filter", async () => {
    const request = {
      table: "tags",
      where: FilterGroup.create({
        logical: 1,
        conditions: [
          FilterCondition.create({
            field: "amount",
            operator: 1,
            value: "abc",
          }),
        ],
        groups: [],
      }),
      orderBy: [],
      limit: 100,
      offset: 0,
    };

    await expect(
      queryData(client, request, grpcMetadata(`Bearer ${rawKey}`))
    ).rejects.toThrow();
  });
});
