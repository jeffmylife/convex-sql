import { GenericQueryCtx, GenericDataModel } from "convex/server";
import { executeSQL as executeSQLEngine } from "../../lib/sql/engine";
import { ConvexDatabaseContext } from "./adapter";
import { QueryLimits, DEFAULT_LIMITS } from "../../lib/sql/limits";

/**
 * Execute a SQL SELECT query against Convex database
 *
 * @param ctx - Convex query context
 * @param sql - SQL SELECT statement
 * @param limits - Optional query limits (defaults to DEFAULT_LIMITS for safety)
 * @returns Query results as an array of objects
 *
 * @example
 * const results = await executeSQL(ctx, "SELECT * FROM users WHERE age > 18 LIMIT 10");
 *
 * @example
 * const results = await executeSQL(ctx, "SELECT name, email FROM users WHERE status = 'active' ORDER BY name ASC");
 *
 * @example
 * // With custom limits
 * import { PERMISSIVE_LIMITS } from "../../lib/sql/limits";
 * const results = await executeSQL(ctx, "SELECT * FROM users", PERMISSIVE_LIMITS);
 */
export async function executeSQL<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
  sql: string,
  limits?: QueryLimits
): Promise<any[]> {
  // Create Convex database adapter
  const dbContext = new ConvexDatabaseContext(ctx);

  // Execute using pure SQL engine with limits
  return await executeSQLEngine(dbContext, sql, limits);
}

// Re-export limits for convenience
export type { QueryLimits } from "../../lib/sql/limits";
export { DEFAULT_LIMITS, PERMISSIVE_LIMITS, STRICT_LIMITS } from "../../lib/sql/limits";
