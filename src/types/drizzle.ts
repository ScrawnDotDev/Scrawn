import { BaseServerlessFunctionCallHandler } from "../storage/handlers/BaseServerlessFunctionCallHandler";

// --- Type inference helpers ---

export type DatabaseType = Awaited<
  ReturnType<BaseServerlessFunctionCallHandler["getDatabase"]>
>;

export type TransactionType = DatabaseType extends {
  transaction(fn: (txn: infer T, ...args: any[]) => any, ...rest: any[]): any;
}
  ? T
  : never;
