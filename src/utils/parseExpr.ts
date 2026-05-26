import { Parser } from "expr-eval";
import { EventError } from "../errors/event";
import { fetchTagAmount } from "./fetchTagAmount";
import { findExpressionByKey } from "../storage/db/postgres/helpers/expressions";

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
 * - expr(NAME): Resolves to a stored expression, recursively evaluated
 *
 * Token placeholders (inputTokens(), outputTokens()) may appear in
 * persisted expressions; they are resolved from the AI token usage context.
 *
 * Numbers are treated as cents (integers).
 */

// Regex to match tag(NAME) patterns - tag names must be UPPER_SNAKE_CASE
const TAG_PATTERN = /tag\(([A-Z_][A-Z0-9_]*)\)/g;

// Regex to match expr(NAME) patterns - same format as tags
const EXPR_PATTERN = /expr\(([A-Z_][A-Z0-9_]*)\)/g;

// Allowed function names in expressions
const ALLOWED_FUNCTIONS = new Set(["add", "sub", "mul", "div", "tag", "expr"]);

/**
 * Token context passed from AI token usage event handlers.
 */
export interface EvalTokenContext {
  inputTokens?: number;
  outputTokens?: number;
  outputCacheTokens?: number;
}

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

function extractTagNames(exprString: string): string[] {
  const tags = new Set<string>();
  let match: RegExpExecArray | null;

  // Reset regex state
  TAG_PATTERN.lastIndex = 0;

  while ((match = TAG_PATTERN.exec(exprString)) !== null) {
    if (match[1]) {
      tags.add(match[1]);
    }
  }

  return Array.from(tags);
}

function validateExprSyntax(exprString: string): void {
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
    const funcName = match[1]?.toLowerCase();
    if (!funcName || !ALLOWED_FUNCTIONS.has(funcName)) {
      throw EventError.validationFailed(
        `Unknown function in expression: ${match[1]}`
      );
    }
  }

  // Validate tag name format (must be UPPER_SNAKE_CASE)
  const tagNamePattern = /tag\(([^)]*)\)/gi;
  while ((match = tagNamePattern.exec(exprString)) !== null) {
    const tagName = match[1];
    if (!tagName || !/^[A-Z_][A-Z0-9_]*$/.test(tagName)) {
      throw EventError.validationFailed(
        `Invalid tag name format: ${tagName}. Tag names must be UPPER_SNAKE_CASE`
      );
    }
  }

  // Validate expr name format (same UPPER_SNAKE_CASE as tags)
  const exprNamePattern = /expr\(([^)]*)\)/gi;
  while ((match = exprNamePattern.exec(exprString)) !== null) {
    const exprName = match[1];
    if (!exprName || !/^[A-Z_][A-Z0-9_]*$/.test(exprName)) {
      throw EventError.validationFailed(
        `Invalid expression name format: ${exprName}. Names must be UPPER_SNAKE_CASE`
      );
    }
  }
}

/**
 * Resolves all expr(NAME) references in an expression by fetching
 * their stored expression strings from the database and expanding them.
 *
 * Handles recursion: if a stored expression itself contains expr() refs,
 * those are resolved recursively. Cycle detection prevents infinite loops.
 *
 * @param exprString - The expression string with expr(NAME) references
 * @returns The expression string with all expr() refs expanded
 * @throws EventError if an expression is not found or a cycle is detected
 */
async function resolveExprRefsInExpression(
  exprString: string,
  resolving: Set<string> = new Set()
): Promise<string> {
  const refs = extractExprRefs(exprString);

  if (refs.length === 0) {
    return exprString;
  }

  let resolved = exprString;

  for (const refName of refs) {
    if (resolving.has(refName)) {
      throw EventError.validationFailed(
        `Circular expression reference detected: ${refName}`
      );
    }

    const storedExpr = await findExpressionByKey(refName);
    if (!storedExpr) {
      throw EventError.validationFailed(`Expression not found: ${refName}`);
    }

    resolving.add(refName);

    const expanded = await resolveExprRefsInExpression(storedExpr, resolving);

    const refPattern = new RegExp(`expr\\(${refName}\\)`, "g");
    resolved = resolved.replace(refPattern, `(${expanded})`);

    resolving.delete(refName);
  }

  return resolved;
}

function extractExprRefs(exprString: string): string[] {
  const refs = new Set<string>();
  let match: RegExpExecArray | null;

  EXPR_PATTERN.lastIndex = 0;

  while ((match = EXPR_PATTERN.exec(exprString)) !== null) {
    if (match[1]) {
      refs.add(match[1]);
    }
  }

  return Array.from(refs);
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
 * Replaces inputTokens() and outputTokens() and outputCacheTokens() placeholders with concrete
 * values from the AI token usage event context.
 *
 * This handles persisted expressions that contain token placeholders,
 * since the SDK cannot resolve them for expressions it doesn't know about.
 */
function resolveTokenPlaceholders(
  exprString: string,
  context: EvalTokenContext
): string {
  return exprString
    .replace(/inputTokens\(\)/g, String(context.inputTokens ?? 0))
    .replace(/outputTokens\(\)/g, String(context.outputTokens ?? 0))
    .replace(/outputCacheTokens\(\)/g, String(context.outputCacheTokens ?? 0));
}

/**
 * Parses and evaluates a pricing expression string.
 *
 * This is the main entry point for expression evaluation.
 * It handles the full pipeline:
 * 1. Validates expression syntax
 * 2. Resolves all expr(NAME) references from the database (recursive, with cycle detection)
 * 3. Resolves all tag references from the database
 * 4. Resolves token placeholders (if tokenContext provided)
 * 5. Evaluates the expression using expr-eval
 * 6. Returns the floored integer result (cents)
 *
 * @param exprString - The expression string to evaluate
 * @param tokenContext - Optional AI token usage context for resolving placeholders
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
 *
 * @example
 * // With persisted expression + token placeholders
 * await parseAndEvaluateExpr("expr(PER_TOKEN_INPUT)", {
 *   inputTokens: 150,
 *   outputTokens: 0,
 * })
 * // Fetches PER_TOKEN_INPUT from DB → "mul(tag(RATE),inputTokens())"
 * // Resolves tag(RATE) and inputTokens()=150 → evaluates
 */
export async function parseAndEvaluateExpr(
  exprString: string,
  tokenContext?: EvalTokenContext
): Promise<number> {
  // Step 1: Validate syntax
  validateExprSyntax(exprString);

  // Step 2: Resolve all expr(NAME) references (recursive, from DB)
  const expandedExpr = await resolveExprRefsInExpression(exprString);

  // Step 3: Resolve all tags to their values
  const tagResolvedExpr = await resolveTagsInExpression(expandedExpr);

  // Step 4: Resolve token placeholders if context provided
  const finalExpr = tokenContext
    ? resolveTokenPlaceholders(tagResolvedExpr, tokenContext)
    : tagResolvedExpr;

  // Step 5: Parse and evaluate
  const parser = createParser();

  try {
    const expression = parser.parse(finalExpr);
    const result = expression.evaluate();

    // Step 6: Validate and return result
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
