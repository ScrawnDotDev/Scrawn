import { Parser } from "expr-eval";
import { EventError } from "../errors/event";
import { fetchTagAmount } from "./fetchTagAmount";

/**
 * Expression Parser for Pricing DSL
 *
 * Parses and evaluates pricing expressions sent from the SDK.
 * Expressions follow the format: add(mul(tag(PREMIUM_CALL),3),tag(EXTRA_FEE),250)
 *
 * Supported operations:
 * - add(...args): Sum of all arguments
 * - sub(a, b): a - b
 * - mul(...args): Product of all arguments
 * - div(a, b): a / b (floors result)
 * - tag(NAME): Resolves to the tag's value from database
 *
 * Numbers are treated as cents (integers).
 */

// Regex to match tag(NAME) patterns - tag names must be UPPER_SNAKE_CASE
const TAG_PATTERN = /tag\(([A-Z_][A-Z0-9_]*)\)/g;

// Allowed function names in expressions
const ALLOWED_FUNCTIONS = new Set(["add", "sub", "mul", "div", "tag"]);

/**
 * Creates a configured expr-eval parser with custom functions.
 */
function createParser(): Parser {
  const parser = new Parser();

  // Variadic add: sum of all arguments
  parser.functions.add = (...args: number[]): number => {
    if (args.length === 0) {
      throw new Error("add() requires at least one argument");
    }
    return args.reduce((sum, val) => sum + val, 0);
  };

  // Binary subtraction
  parser.functions.sub = (a: number, b: number): number => {
    if (typeof a !== "number" || typeof b !== "number") {
      throw new Error("sub() requires exactly two numeric arguments");
    }
    return a - b;
  };

  // Variadic multiply: product of all arguments
  parser.functions.mul = (...args: number[]): number => {
    if (args.length === 0) {
      throw new Error("mul() requires at least one argument");
    }
    return args.reduce((product, val) => product * val, 1);
  };

  // Binary division with floor
  parser.functions.div = (a: number, b: number): number => {
    if (typeof a !== "number" || typeof b !== "number") {
      throw new Error("div() requires exactly two numeric arguments");
    }
    if (b === 0) {
      throw new Error("Division by zero");
    }
    return Math.floor(a / b);
  };

  return parser;
}

/**
 * Extracts all tag names from an expression string.
 *
 * @param exprString - The expression string to parse
 * @returns Array of unique tag names found in the expression
 *
 * @example
 * extractTagNames("add(tag(PREMIUM),tag(FEE),100)")
 * // Returns: ["PREMIUM", "FEE"]
 */
export function extractTagNames(exprString: string): string[] {
  const tags = new Set<string>();
  let match: RegExpExecArray | null;

  // Reset regex state
  TAG_PATTERN.lastIndex = 0;

  while ((match = TAG_PATTERN.exec(exprString)) !== null) {
    tags.add(match[1]);
  }

  return Array.from(tags);
}

/**
 * Validates expression syntax without evaluating.
 * Checks for:
 * - Valid parentheses matching
 * - Only allowed function names
 * - Valid tag name format
 *
 * @param exprString - The expression string to validate
 * @throws EventError if validation fails
 */
export function validateExprSyntax(exprString: string): void {
  if (!exprString || exprString.trim() === "") {
    throw EventError.validationFailed("Expression cannot be empty");
  }

  // Check parentheses balance
  let depth = 0;
  for (const char of exprString) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (depth < 0) {
      throw EventError.validationFailed(
        "Invalid expression syntax: unmatched closing parenthesis"
      );
    }
  }
  if (depth !== 0) {
    throw EventError.validationFailed(
      "Invalid expression syntax: unmatched opening parenthesis"
    );
  }

  // Extract and validate function names
  const functionPattern = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = functionPattern.exec(exprString)) !== null) {
    const funcName = match[1].toLowerCase();
    if (!ALLOWED_FUNCTIONS.has(funcName)) {
      throw EventError.validationFailed(
        `Unknown function in expression: ${match[1]}`
      );
    }
  }

  // Validate tag name format (must be UPPER_SNAKE_CASE)
  const tagNamePattern = /tag\(([^)]*)\)/gi;
  while ((match = tagNamePattern.exec(exprString)) !== null) {
    const tagName = match[1];
    if (!/^[A-Z_][A-Z0-9_]*$/.test(tagName)) {
      throw EventError.validationFailed(
        `Invalid tag name format: ${tagName}. Tag names must be UPPER_SNAKE_CASE`
      );
    }
  }
}

/**
 * Resolves all tag references in an expression by fetching their values
 * from the database and replacing them in the expression string.
 *
 * @param exprString - The expression string with tag(NAME) references
 * @returns The expression string with tags replaced by their numeric values
 * @throws EventError if any tag is not found
 */
async function resolveTagsInExpression(exprString: string): Promise<string> {
  const tagNames = extractTagNames(exprString);

  if (tagNames.length === 0) {
    return exprString;
  }

  // Fetch all tag values (fetchTagAmount handles caching)
  const tagValues = new Map<string, number>();

  for (const tagName of tagNames) {
    const value = await fetchTagAmount(tagName, `Tag not found: ${tagName}`);
    tagValues.set(tagName, value);
  }

  // Replace all tag(NAME) with their values
  let resolvedExpr = exprString;
  for (const [tagName, value] of tagValues) {
    // Use a regex with global flag to replace all occurrences
    const tagPattern = new RegExp(`tag\\(${tagName}\\)`, "g");
    resolvedExpr = resolvedExpr.replace(tagPattern, value.toString());
  }

  return resolvedExpr;
}

/**
 * Parses and evaluates a pricing expression string.
 *
 * This is the main entry point for expression evaluation.
 * It handles the full pipeline:
 * 1. Validates expression syntax
 * 2. Resolves all tag references from the database
 * 3. Evaluates the expression using expr-eval
 * 4. Returns the floored integer result (cents)
 *
 * @param exprString - The expression string to evaluate
 * @returns The evaluated result as an integer (cents)
 * @throws EventError for syntax errors, unknown tags, or evaluation errors
 *
 * @example
 * // Simple amount
 * await parseAndEvaluateExpr("250") // Returns: 250
 *
 * @example
 * // With tag (assumes PREMIUM_CALL = 100 in DB)
 * await parseAndEvaluateExpr("add(mul(tag(PREMIUM_CALL),3),250)")
 * // Returns: 550 (100*3 + 250)
 */
export async function parseAndEvaluateExpr(exprString: string): Promise<number> {
  // Step 1: Validate syntax
  validateExprSyntax(exprString);

  // Step 2: Resolve all tags to their values
  const resolvedExpr = await resolveTagsInExpression(exprString);

  // Step 3: Parse and evaluate
  const parser = createParser();

  try {
    const expression = parser.parse(resolvedExpr);
    const result = expression.evaluate();

    // Step 4: Validate and return result
    if (typeof result !== "number" || !Number.isFinite(result)) {
      throw EventError.validationFailed(
        `Expression evaluation produced invalid result: ${result}`
      );
    }

    // Floor to ensure integer cents
    return Math.floor(result);
  } catch (error) {
    // Re-throw EventError as-is
    if (error instanceof EventError) {
      throw error;
    }

    // Wrap other errors
    const message =
      error instanceof Error ? error.message : "Unknown evaluation error";

    // Check for specific error types
    if (message.includes("Division by zero")) {
      throw EventError.validationFailed("Division by zero in expression");
    }

    throw EventError.validationFailed(
      `Failed to evaluate expression: ${message}`
    );
  }
}
