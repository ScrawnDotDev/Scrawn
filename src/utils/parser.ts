import { Parser as ExprEvalParser } from "expr-eval";
import { EventError } from "../errors/event";
import { fetchTagAmount } from "./fetchTagAmount";

type TokenType = "INUMBER" | "IVAR" | "IFUNCALL";

interface ExprToken {
  type: TokenType;
  value: number | string;
}

interface FunctionRef {
  kind: "func";
  name: string;
}

type StackValue = number | string | FunctionRef;

const isFunctionRef = (value: StackValue): value is FunctionRef => {
  return typeof value === "object" && value !== null && value.kind === "func";
};

const executeFunction = async (
  name: string,
  args: Array<number | string>
): Promise<number> => {
  switch (name) {
    case "tag": {
      if (args.length !== 1 || typeof args[0] !== "string") {
        throw EventError.validationFailed(
          "tag() requires exactly one string argument"
        );
      }
      return fetchTagAmount(args[0], `Tag not found: ${args[0]}`);
    }
    case "add": {
      let sum = 0;
      for (const arg of args) {
        if (typeof arg !== "number") {
          throw EventError.validationFailed("add() requires numeric arguments");
        }
        sum += arg;
      }
      return sum;
    }
    case "mul": {
      let product = 1;
      for (const arg of args) {
        if (typeof arg !== "number") {
          throw EventError.validationFailed("mul() requires numeric arguments");
        }
        product *= arg;
      }
      return product;
    }
    default:
      throw EventError.validationFailed(`Unknown function: ${name}`);
  }
};

const evaluateTokens = async (tokens: ExprToken[]): Promise<number> => {
  const stack: StackValue[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "INUMBER":
        stack.push(token.value);
        break;
      case "IVAR":
        stack.push({ kind: "func", name: String(token.value) });
        break;
      case "IFUNCALL": {
        if (typeof token.value !== "number") {
          throw EventError.validationFailed("Invalid function call token");
        }
        const argCount = token.value;
        const args: Array<number | string> = [];

        for (let i = 0; i < argCount; i += 1) {
          const arg = stack.pop();
          if (arg === undefined || isFunctionRef(arg)) {
            throw EventError.validationFailed(
              "Invalid arguments for expression function"
            );
          }
          args.unshift(arg);
        }

        const funcRef = stack.pop();
        if (!funcRef || !isFunctionRef(funcRef)) {
          throw EventError.validationFailed(
            "Invalid function call in expression"
          );
        }

        const result = await executeFunction(funcRef.name, args);
        stack.push(result);
        break;
      }
      default:
        throw EventError.validationFailed(
          `Unsupported token type: ${String(token.type)}`
        );
    }
  }

  if (stack.length !== 1 || typeof stack[0] !== "number") {
    throw EventError.validationFailed(
      "Expression did not evaluate to a number"
    );
  }

  return stack[0];
};

export const evaluateExpression = async (
  expression: string
): Promise<number> => {
  try {
    const parser = new ExprEvalParser();
    const parsed = parser.parse(expression);
    const tokens = (parsed as unknown as { tokens: ExprToken[] }).tokens;
    return await evaluateTokens(tokens);
  } catch (e) {
    if (e instanceof EventError) {
      throw e;
    }
    throw EventError.validationFailed(
      `Invalid expression syntax: ${(e as Error).message}`,
      e as Error
    );
  }
};
