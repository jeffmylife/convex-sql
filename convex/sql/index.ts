import { GenericQueryCtx } from "convex/server";
import { GenericDataModel } from "convex/server";
import { Lexer } from "../../lib/sql/lexer";
import { Parser } from "../../lib/sql/parser";
import { executeSelect } from "./queryBuilder";

/**
 * Execute a SQL SELECT query against Convex database
 *
 * @param ctx - Convex query context
 * @param sql - SQL SELECT statement
 * @returns Query results as an array of objects
 *
 * @example
 * const results = await executeSQL(ctx, "SELECT * FROM users WHERE age > 18 LIMIT 10");
 *
 * @example
 * const results = await executeSQL(ctx, "SELECT name, email FROM users WHERE status = 'active' ORDER BY name ASC");
 */
export async function executeSQL<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
  sql: string
): Promise<any[]> {
  // Tokenize
  const lexer = new Lexer(sql);
  const tokens = lexer.tokenize();

  // Parse
  const parser = new Parser(tokens);
  const ast = parser.parse();

  // Execute
  return await executeSelect(ctx, ast);
}
