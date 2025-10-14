import { GenericQueryCtx, GenericDataModel } from "convex/server";
import { executeSQL as executeSQLEngine } from "../../lib/sql/engine";
import { ConvexDatabaseContext } from "./adapter";

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
  // Create Convex database adapter
  const dbContext = new ConvexDatabaseContext(ctx);

  // Execute using pure SQL engine
  return await executeSQLEngine(dbContext, sql);
}
