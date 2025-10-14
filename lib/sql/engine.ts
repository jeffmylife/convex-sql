/**
 * Pure SQL execution engine - decoupled from any specific database system
 */

import { Lexer } from "./lexer";
import { Parser } from "./parser";
import {
  SelectStatement,
  WhereClause,
  JoinClause,
  ColumnExpression,
  GroupByClause,
  OrderByClause,
} from "./types";
import { DatabaseContext, SchemaInfo } from "./database";
import { QueryLimits, DEFAULT_LIMITS } from "./limits";

/**
 * Execute a SQL SELECT query against a database context
 *
 * @param ctx - Database context providing query and schema access
 * @param sql - SQL SELECT statement string
 * @param limits - Optional query limits (defaults to DEFAULT_LIMITS)
 * @returns Query results as array of objects
 */
export async function executeSQL(
  ctx: DatabaseContext,
  sql: string,
  limits: QueryLimits = DEFAULT_LIMITS
): Promise<any[]> {
  // Parse SQL
  const lexer = new Lexer(sql);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const statement = parser.parse();

  // Validate query against limits
  validateQueryLimits(statement, limits);

  // Execute
  return await executeSQLStatement(ctx, statement, limits);
}

/**
 * Check if query has only aggregate functions (no GROUP BY)
 */
function hasOnlyAggregateFunctions(statement: SelectStatement): boolean {
  if (statement.groupBy && statement.groupBy.length > 0) {
    return false;
  }
  const hasOnlyFunctions =
    statement.columns.length > 0 &&
    statement.columns.every((c) => c.type === "FUNCTION");
  return hasOnlyFunctions;
}

/**
 * Validate query against configured limits
 */
function validateQueryLimits(statement: SelectStatement, limits: QueryLimits): void {
  const isAggregateOnly = hasOnlyAggregateFunctions(statement);

  // Check if LIMIT is required and missing
  if (limits.requireLimit && !statement.limit && !statement.groupBy && !isAggregateOnly) {
    // Check if table is exempt
    if (!limits.exemptTables.includes(statement.from)) {
      throw new Error(
        `Query must include a LIMIT clause for table '${statement.from}'. ` +
        `Maximum allowed LIMIT is ${limits.maxLimit}. ` +
        `This prevents accidentally reading large tables.`
      );
    }
  }

  // Check if LIMIT exceeds maximum
  if (statement.limit && statement.limit > limits.maxLimit) {
    throw new Error(
      `LIMIT ${statement.limit} exceeds maximum allowed limit of ${limits.maxLimit}. ` +
      `Reduce your LIMIT or contact administrator to increase limits.`
    );
  }

  // Auto-apply maxLimit if no LIMIT specified (and not required)
  // But DON'T apply to aggregate-only queries (they need to scan all rows)
  if (!statement.limit && !statement.groupBy && !isAggregateOnly) {
    statement.limit = limits.maxRows;
  }
}

/**
 * Execute a parsed SQL statement
 */
export async function executeSQLStatement(
  ctx: DatabaseContext,
  statement: SelectStatement,
  limits: QueryLimits = DEFAULT_LIMITS
): Promise<any[]> {
  const schema = ctx.getSchema();

  // Validate table exists
  if (!schema.tables || !(statement.from in schema.tables)) {
    throw new Error(`Table '${statement.from}' does not exist`);
  }

  // Handle JOINs if present
  if (statement.joins && statement.joins.length > 0) {
    return await executeSelectWithJoin(ctx, statement, schema, limits);
  }

  // Simple SELECT without JOIN
  let query = ctx.query(statement.from);

  // Apply index if specified
  if (statement.fromIndex) {
    query = applyIndex(
      query,
      statement.from,
      statement.fromIndex,
      statement.where,
      schema
    );

    // Also apply any WHERE conditions not covered by the index
    if (statement.where) {
      const indexColumns = schema.tables[statement.from]?.indexes[statement.fromIndex] || [];
      const indexedFields = new Set(indexColumns);

      if (hasConditionsNotInIndex(statement.where, indexedFields)) {
        query = query.filter((q) =>
          buildFilterExpression(q, statement.where!, statement.from)
        );
      }
    }
  } else {
    // Apply WHERE clause as filter
    if (statement.where) {
      query = query.filter((q) =>
        buildFilterExpression(q, statement.where!, statement.from)
      );
    }
  }

  // Determine if we can use database's built-in ordering
  let canUseNativeOrdering = false;
  if (statement.orderBy && statement.orderBy.length > 0) {
    const firstOrder = statement.orderBy[0];

    // Can use native ordering if:
    // 1. Ordering by _creationTime (common default)
    // 2. Using an index and ordering by the first field of that index
    if (firstOrder.field === "_creationTime") {
      canUseNativeOrdering = true;
    } else if (statement.fromIndex) {
      const indexColumns = schema.tables[statement.from]?.indexes[statement.fromIndex] || [];
      if (indexColumns.length > 0 && indexColumns[0] === firstOrder.field) {
        canUseNativeOrdering = true;
      }
    }
  }

  // Check if this is an aggregate-only query
  const isAggregateOnly = hasOnlyAggregateFunctions(statement);

  // Execute query
  let results;
  try {
    if (canUseNativeOrdering && statement.orderBy && statement.orderBy.length > 0) {
      const direction = statement.orderBy[0].direction;
      const orderedQuery = query.order(direction);

      // Don't apply LIMIT during scan for aggregate-only queries (they need all rows)
      if (statement.limit && !isAggregateOnly) {
        results = await orderedQuery.take(statement.limit);
      } else {
        results = await orderedQuery.collect();
      }
    } else {
      results = await query.collect();
    }
  } catch (error: any) {
    if (error.message && error.message.includes("does not exist")) {
      throw new Error(`Table '${statement.from}' does not exist`);
    }
    throw error;
  }

  // Apply GROUP BY if present (must be before LIMIT for correct SQL semantics)
  if (statement.groupBy && statement.groupBy.length > 0) {
    const grouped = applyGroupBy(results, statement);
    const ordered = statement.orderBy ? applyOrderBy(grouped, statement.orderBy) : grouped;
    return statement.limit ? ordered.slice(0, statement.limit) : ordered;
  }

  // Apply in-memory ORDER BY if we couldn't use native ordering
  if (!canUseNativeOrdering && statement.orderBy && statement.orderBy.length > 0) {
    results = applyOrderBy(results, statement.orderBy);
  }

  // Apply LIMIT if we didn't use native ordering (which already applied it)
  // BUT skip for aggregate-only queries (they need to aggregate all rows first)
  if (!canUseNativeOrdering && statement.limit && !isAggregateOnly) {
    results = results.slice(0, statement.limit);
  }

  // Apply column selection (which computes aggregates if hasOnlyFunctions)
  const projected = projectColumns(results, statement.columns, statement.from);

  // Apply LIMIT AFTER aggregates for aggregate-only queries
  if (isAggregateOnly && statement.limit) {
    const limited = projected.slice(0, statement.limit);
    return limited.length > limits.maxRows ? limited.slice(0, limits.maxRows) : limited;
  }

  // Enforce maximum result size
  if (projected.length > limits.maxRows) {
    return projected.slice(0, limits.maxRows);
  }

  return projected;
}

/**
 * Execute SELECT with JOINs
 */
async function executeSelectWithJoin(
  ctx: DatabaseContext,
  statement: SelectStatement,
  schema: SchemaInfo,
  limits: QueryLimits
): Promise<any[]> {
  // Validate all table names in JOINs
  for (const join of statement.joins!) {
    if (!schema.tables || !(join.table in schema.tables)) {
      throw new Error(`Table '${join.table}' does not exist`);
    }
  }

  // 1. Query the FROM table
  let leftQuery = ctx.query(statement.from);

  // Apply index if specified
  if (statement.fromIndex) {
    leftQuery = applyIndex(
      leftQuery,
      statement.from,
      statement.fromIndex,
      statement.where,
      schema
    );
  }

  // Always apply WHERE filter to ensure correctness
  if (statement.where) {
    leftQuery = leftQuery.filter((q) =>
      buildFilterExpression(q, statement.where!, statement.from)
    );
  }

  // Collect left table results
  let leftResults;
  try {
    leftResults = await leftQuery.collect();
  } catch (error: any) {
    if (error.message && error.message.includes("does not exist")) {
      throw new Error(`Table '${statement.from}' does not exist`);
    }
    throw error;
  }

  console.log(`[SQL] Left table (${statement.from}): ${leftResults.length} rows`);

  // 2. For each JOIN, fetch and merge data
  for (const join of statement.joins!) {
    leftResults = await performJoin(
      ctx,
      leftResults,
      join,
      statement.from,
      statement.where,
      schema
    );
  }

  // 3. Apply GROUP BY if present
  if (statement.groupBy && statement.groupBy.length > 0) {
    const grouped = applyGroupBy(leftResults, statement);
    const ordered = statement.orderBy ? applyOrderBy(grouped, statement.orderBy) : grouped;
    const limited = statement.limit ? ordered.slice(0, statement.limit) : ordered;

    // Enforce maximum result size
    return limited.length > limits.maxRows ? limited.slice(0, limits.maxRows) : limited;
  }

  // 4. Apply column projection
  const projected = projectColumns(
    leftResults,
    statement.columns,
    statement.from,
    statement.joins
  );

  // 5. Apply ORDER BY
  const ordered = statement.orderBy ? applyOrderBy(projected, statement.orderBy) : projected;

  // 6. Apply LIMIT
  const limited = statement.limit ? ordered.slice(0, statement.limit) : ordered;

  // 7. Enforce maximum result size
  return limited.length > limits.maxRows ? limited.slice(0, limits.maxRows) : limited;
}

/**
 * Perform JOIN operation in memory
 */
async function performJoin(
  ctx: DatabaseContext,
  leftResults: any[],
  join: JoinClause,
  fromTable: string,
  globalWhereClause: WhereClause | undefined,
  schema: SchemaInfo
): Promise<any[]> {
  let rightQuery = ctx.query(join.table);

  // Apply index hint on the right table if provided
  if (join.index) {
    try {
      rightQuery = applyIndex(
        rightQuery,
        join.table,
        join.index,
        globalWhereClause,
        schema
      );
    } catch (_e) {
      // If index application fails, fall back silently
    }
  }

  // Apply any WHERE conditions that apply to this joined table
  if (globalWhereClause) {
    rightQuery = rightQuery.filter((q) =>
      buildFilterExpression(q, globalWhereClause, join.table)
    );
  }

  // Read right table
  let rightResults;
  try {
    rightResults = await rightQuery.collect();
  } catch (error: any) {
    if (error.message && error.message.includes("does not exist")) {
      throw new Error(`Table '${join.table}' does not exist`);
    }
    throw error;
  }

  console.log(`[SQL] Right table (${join.table}): ${rightResults.length} rows`);

  // Build lookup maps for join conditions
  const onConditions = Array.isArray(join.on) ? join.on : [join.on];

  // For single-condition fast path
  let singleMap: Map<any, any[]> | null = null;
  if (onConditions.length === 1) {
    const cond = onConditions[0];
    if (cond.rightTable === join.table) {
      singleMap = new Map<any, any[]>();
      for (const rightRow of rightResults) {
        const key = rightRow[cond.rightField];
        if (!singleMap.has(key)) singleMap.set(key, []);
        singleMap.get(key)!.push(rightRow);
      }
    }
  }

  // Perform INNER JOIN in memory
  const joined: any[] = [];

  function getValue(
    leftRow: any,
    rightRow: any,
    table: string,
    field: string
  ): any {
    if (table === join.table) {
      return rightRow[field];
    }
    const prefixedKey = `${table}.${field}`;
    if (prefixedKey in leftRow) return leftRow[prefixedKey];
    if (table === fromTable && field in leftRow) return leftRow[field];
    return undefined;
  }

  for (const leftRow of leftResults) {
    let candidates: any[] = rightResults;

    if (singleMap) {
      const cond = onConditions[0];
      const leftKey = getValue(leftRow, null, cond.leftTable, cond.leftField);
      const byKey = singleMap.get(leftKey) || [];
      candidates = byKey;
    }

    for (const rightRow of candidates) {
      // Verify all ON conditions
      let matches = true;
      for (const cond of onConditions) {
        const leftVal = getValue(leftRow, rightRow, cond.leftTable, cond.leftField);
        const rightVal = getValue(leftRow, rightRow, cond.rightTable, cond.rightField);
        if (leftVal !== rightVal) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;

      // Merge rows with table prefixes
      const mergedRow: any = {};

      for (const [key, value] of Object.entries(leftRow)) {
        if (key.includes(".")) {
          mergedRow[key] = value;
        } else {
          mergedRow[`${fromTable}.${key}`] = value;
        }
      }

      for (const [key, value] of Object.entries(rightRow)) {
        mergedRow[`${join.table}.${key}`] = value;
      }

      joined.push(mergedRow);
    }
  }

  return joined;
}

/**
 * Apply index to query with WHERE conditions
 */
function applyIndex(
  query: any,
  tableName: string,
  indexName: string,
  whereClause: WhereClause | undefined,
  schema: SchemaInfo
): any {
  const tableIndexes = schema.tables[tableName]?.indexes;

  if (!tableIndexes) {
    throw new Error(`Table '${tableName}' not found in schema`);
  }

  const indexColumns = tableIndexes[indexName];
  if (!indexColumns) {
    throw new Error(
      `Index '${indexName}' not found for table '${tableName}'. ` +
        `Available indexes: ${Object.keys(tableIndexes).join(", ")}`
    );
  }

  // Build the index filter based on WHERE conditions
  const indexFilter = buildIndexFilter(whereClause, indexColumns, tableName);

  return query.withIndex(indexName, indexFilter);
}

/**
 * Build index filter function from WHERE clause
 */
function buildIndexFilter(
  whereClause: WhereClause | undefined,
  indexColumns: string[],
  tableName: string
): (q: any) => any {
  return (q: any) => {
    if (!whereClause) {
      throw new Error(
        `Index '${indexColumns.join("_and_")}' requires WHERE conditions on columns: ${indexColumns.join(", ")}`
      );
    }

    const conditions = extractComparisonConditions(whereClause, tableName);
    let filterChain = q;

    for (let i = 0; i < indexColumns.length; i++) {
      const column = indexColumns[i];
      const isLastColumn = i === indexColumns.length - 1;
      const condition = conditions.find((c) => c.field === column);

      if (!condition) {
        if (isLastColumn) {
          continue;
        } else {
          throw new Error(
            `Index '${indexColumns.join("_and_")}' requires WHERE condition on column '${column}' (prefix column)`
          );
        }
      }

      switch (condition.operator) {
        case "=":
          filterChain = filterChain.eq(column, condition.value);
          break;
        case ">":
          if (!isLastColumn) {
            throw new Error(
              `Index '${indexColumns.join("_and_")}' only supports range queries on the last column`
            );
          }
          filterChain = filterChain.gt(column, condition.value);
          break;
        case "<":
          if (!isLastColumn) {
            throw new Error(
              `Index '${indexColumns.join("_and_")}' only supports range queries on the last column`
            );
          }
          filterChain = filterChain.lt(column, condition.value);
          break;
        case ">=":
          if (!isLastColumn) {
            throw new Error(
              `Index '${indexColumns.join("_and_")}' only supports range queries on the last column`
            );
          }
          filterChain = filterChain.gte(column, condition.value);
          break;
        case "<=":
          if (!isLastColumn) {
            throw new Error(
              `Index '${indexColumns.join("_and_")}' only supports range queries on the last column`
            );
          }
          filterChain = filterChain.lte(column, condition.value);
          break;
        default:
          throw new Error(
            `Index '${indexColumns.join("_and_")}' does not support operator '${condition.operator}'`
          );
      }
    }

    return filterChain;
  };
}

/**
 * Check if WHERE clause has conditions not covered by index
 */
function hasConditionsNotInIndex(
  whereClause: WhereClause,
  indexedFields: Set<string>
): boolean {
  function checkWhere(node: WhereClause): boolean {
    if (node.type === "COMPARISON") {
      return !indexedFields.has(node.field!);
    } else if (node.type === "AND") {
      return checkWhere(node.left!) || checkWhere(node.right!);
    } else if (node.type === "OR") {
      return checkWhere(node.left!) || checkWhere(node.right!);
    }
    return false;
  }

  return checkWhere(whereClause);
}

/**
 * Extract comparison conditions from WHERE clause for index
 */
function extractComparisonConditions(
  whereClause: WhereClause,
  tableName: string
): Array<{ field: string; operator: string; value: any }> {
  const conditions: Array<{ field: string; operator: string; value: any }> = [];

  function traverseWhere(node: WhereClause): void {
    if (node.type === "COMPARISON") {
      if (!node.table || node.table === tableName) {
        conditions.push({
          field: node.field!,
          operator: node.operator!,
          value: node.value,
        });
      }
    } else if (node.type === "AND") {
      traverseWhere(node.left!);
      traverseWhere(node.right!);
    }
  }

  traverseWhere(whereClause);
  return conditions;
}

/**
 * Apply ORDER BY in memory
 */
function applyOrderBy(results: any[], orderBy: OrderByClause[]): any[] {
  if (orderBy.length === 0) {
    return results;
  }

  return results.slice().sort((a, b) => {
    for (const order of orderBy) {
      const key = order.table ? `${order.table}.${order.field}` : order.field;
      let aVal = a[key] ?? a[order.field];
      let bVal = b[key] ?? b[order.field];

      const aIsNull = aVal === null || aVal === undefined;
      const bIsNull = bVal === null || bVal === undefined;

      if (aIsNull && bIsNull) continue;
      if (aIsNull) return order.direction === "asc" ? 1 : -1;
      if (bIsNull) return order.direction === "asc" ? -1 : 1;

      let comparison = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      if (comparison !== 0) {
        return order.direction === "asc" ? comparison : -comparison;
      }
    }
    return 0;
  });
}

/**
 * Apply GROUP BY with aggregations
 */
function applyGroupBy(results: any[], statement: SelectStatement): any[] {
  if (!statement.groupBy || statement.groupBy.length === 0) {
    return results;
  }

  // Build groups
  const groups = new Map<string, any[]>();

  for (const row of results) {
    const keyParts: Array<string> = [];

    for (const groupCol of statement.groupBy) {
      const key = groupCol.table
        ? `${groupCol.table}.${groupCol.field}`
        : groupCol.field;
      const value = row[key] ?? row[groupCol.field];
      keyParts.push(JSON.stringify(value));
    }

    const groupKey = keyParts.join(":::");

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(row);
  }

  // Build result rows for each group
  const groupedResults: Array<any> = [];

  for (const [groupKey, groupRows] of groups.entries()) {
    const resultRow: any = {};

    // Add GROUP BY columns
    const groupByColumns: GroupByClause[] = statement.groupBy;
    for (const groupCol of groupByColumns) {
      const key = groupCol.table
        ? `${groupCol.table}.${groupCol.field}`
        : groupCol.field;
      const value = groupRows[0][key] ?? groupRows[0][groupCol.field];
      resultRow[key] = value;
    }

    // Compute aggregates
    for (const col of statement.columns) {
      if (col.type === "FUNCTION") {
        const functionKey = `${col.name}(${formatFunctionArgs(col.args)})`;
        const outputKey = col.alias || functionKey;
        const value = executeFunction(col.name, col.args, null, groupRows);

        resultRow[outputKey] = value;
        if (col.alias && outputKey !== functionKey) {
          resultRow[functionKey] = value;
        }
      } else if (col.type === "COLUMN") {
        const colKey = col.table ? `${col.table}.${col.name}` : col.name;
        const isInGroupBy = statement.groupBy.some(
          (g) =>
            g.field === col.name &&
            (g.table === col.table || (!g.table && !col.table))
        );

        if (!isInGroupBy) {
          throw new Error(
            `Column '${colKey}' must appear in GROUP BY clause or be used in an aggregate function`
          );
        }

        const outputKey = col.alias || col.name;
        resultRow[outputKey] = resultRow[colKey] ?? groupRows[0][col.name];
      } else if (col.type === "STAR" || col.type === "TABLE_STAR") {
        throw new Error(
          "SELECT * is not allowed with GROUP BY. Specify columns explicitly."
        );
      }
    }

    groupedResults.push(resultRow);
  }

  // Apply HAVING filter
  let filteredResults = groupedResults;
  if (statement.having) {
    filteredResults = groupedResults.filter((row) =>
      evaluateHaving(row, statement.having!)
    );
  }

  // Clean up duplicate function keys
  const cleanedResults = filteredResults.map((row) => {
    const cleanRow: any = {};
    for (const col of statement.columns) {
      if (col.type === "FUNCTION") {
        const outputKey =
          col.alias || `${col.name}(${formatFunctionArgs(col.args)})`;
        cleanRow[outputKey] = row[outputKey];
      } else if (col.type === "COLUMN") {
        const outputKey = col.alias || col.name;
        const sourceKey = col.table ? `${col.table}.${col.name}` : col.name;
        cleanRow[outputKey] = row[sourceKey] ?? row[col.name];
      }
    }
    if (statement.groupBy) {
      for (const groupCol of statement.groupBy) {
        const key = groupCol.table
          ? `${groupCol.table}.${groupCol.field}`
          : groupCol.field;
        if (!(key in cleanRow)) {
          cleanRow[key] = row[key];
        }
      }
    }
    return cleanRow;
  });

  return cleanedResults;
}

/**
 * Evaluate HAVING clause
 */
function evaluateHaving(row: any, having: WhereClause): boolean {
  if (having.type === "COMPARISON") {
    const value = row[having.field!];
    const compareValue = having.value;

    switch (having.operator) {
      case "=":
        return value === compareValue;
      case "!=":
        return value !== compareValue;
      case ">":
        if (compareValue === null || compareValue === undefined) {
          return false;
        }
        return value > compareValue;
      case "<":
        if (compareValue === null || compareValue === undefined) {
          return false;
        }
        return value < compareValue;
      case ">=":
        if (compareValue === null || compareValue === undefined) {
          return false;
        }
        return value >= compareValue;
      case "<=":
        if (compareValue === null || compareValue === undefined) {
          return false;
        }
        return value <= compareValue;
      default:
        throw new Error(`Unknown operator: ${having.operator}`);
    }
  } else if (having.type === "AND") {
    return (
      evaluateHaving(row, having.left!) && evaluateHaving(row, having.right!)
    );
  } else if (having.type === "OR") {
    return (
      evaluateHaving(row, having.left!) || evaluateHaving(row, having.right!)
    );
  }

  throw new Error(`Unknown HAVING clause type: ${having.type}`);
}

/**
 * Project columns from results
 */
function projectColumns(
  results: any[],
  columns: ColumnExpression[],
  fromTable: string,
  joins?: JoinClause[]
): any[] {
  // If only aggregates, compute once
  const hasOnlyFunctions =
    columns.length > 0 && columns.every((c) => c.type === "FUNCTION");
  const hasAnyFunctions = columns.some((c) => c.type === "FUNCTION");
  const hasAnyPlainColumns = columns.some((c) => c.type === "COLUMN");

  if (hasAnyFunctions && hasAnyPlainColumns) {
    throw new Error(
      "Mixing aggregates with columns requires GROUP BY (not implemented)"
    );
  }

  if (hasOnlyFunctions) {
    const row: any = {};
    for (const col of columns) {
      const key = col.alias || `${col.name}(${formatFunctionArgs(col.args)})`;
      row[key] = executeFunction(col.name, col.args, null, results);
    }
    return [row];
  }

  // Handle SELECT *
  if (columns.length === 1 && columns[0].type === "STAR") {
    if (!joins || joins.length === 0) {
      return results;
    }
    return results;
  }

  // Handle TABLE_STAR
  if (columns.some((col) => col.type === "TABLE_STAR")) {
    return results.map((row) => {
      const projected: any = {};

      for (const col of columns) {
        if (col.type === "TABLE_STAR") {
          for (const [key, value] of Object.entries(row)) {
            if (key.startsWith(`${col.table}.`)) {
              const fieldName = key.split(".")[1];
              projected[fieldName] = value;
            }
          }
        } else if (col.type === "COLUMN") {
          const key = col.alias || col.name;
          const sourceKey = col.table ? `${col.table}.${col.name}` : col.name;
          projected[key] = row[sourceKey] ?? row[col.name];
        } else if (col.type === "FUNCTION") {
          const key =
            col.alias || `${col.name}(${formatFunctionArgs(col.args)})`;
          projected[key] = executeFunction(col.name, col.args, row, results);
        }
      }

      return projected;
    });
  }

  // Project specific columns
  return results.map((row) => {
    const projected: any = {};

    for (const col of columns) {
      if (col.type === "COLUMN") {
        const key = col.alias || col.name;
        const sourceKey = col.table ? `${col.table}.${col.name}` : col.name;
        projected[key] = row[sourceKey] ?? row[col.name];
      } else if (col.type === "FUNCTION") {
        const key = col.alias || `${col.name}(${formatFunctionArgs(col.args)})`;
        projected[key] = executeFunction(col.name, col.args, row, results);
      }
    }

    return projected;
  });
}

/**
 * Build filter expression for WHERE clause
 */
function buildFilterExpression(
  q: any,
  where: WhereClause,
  currentTable: string
): boolean {
  if (where.type === "COMPARISON") {
    if (where.table && where.table !== currentTable) {
      return true;
    }

    const field = q.field(where.field!);
    const value = where.value;

    switch (where.operator) {
      case "=":
        return q.eq(field, value);
      case "!=":
        return q.neq(field, value);
      case ">":
        return q.gt(field, value);
      case "<":
        return q.lt(field, value);
      case ">=":
        return q.gte(field, value);
      case "<=":
        return q.lte(field, value);
      default:
        throw new Error(`Unknown operator: ${where.operator}`);
    }
  } else if (where.type === "AND") {
    return q.and(
      buildFilterExpression(q, where.left!, currentTable),
      buildFilterExpression(q, where.right!, currentTable)
    );
  } else if (where.type === "OR") {
    return q.or(
      buildFilterExpression(q, where.left!, currentTable),
      buildFilterExpression(q, where.right!, currentTable)
    );
  }

  throw new Error(`Unknown WHERE clause type: ${where.type}`);
}

/**
 * Format function arguments for display
 */
function formatFunctionArgs(args: ColumnExpression[]): string {
  return args
    .map((arg) => {
      switch (arg.type) {
        case "STAR":
          return "*";
        case "TABLE_STAR":
          return `${arg.table}.*`;
        case "COLUMN":
          return arg.table ? `${arg.table}.${arg.name}` : arg.name;
        case "FUNCTION":
          return `${arg.name}(${formatFunctionArgs(arg.args)})`;
        default:
          return "?";
      }
    })
    .join(", ");
}

/**
 * Execute aggregate or scalar function
 */
function executeFunction(
  name: string,
  args: ColumnExpression[],
  row: any,
  allResults: any[]
): any {
  switch (name) {
    case "COUNT":
      if (args.length === 1 && args[0].type === "STAR") {
        return allResults.length;
      }
      const countArg = args[0];
      if (countArg && countArg.type === "COLUMN") {
        const key = countArg.table ? `${countArg.table}.${countArg.name}` : countArg.name;
        return allResults.filter((r) => r[key] !== null && r[key] !== undefined)
          .length;
      }
      return allResults.length;

    case "SUM":
      if (args.length === 1 && args[0].type === "COLUMN") {
        const arg = args[0];
        const key = arg.table ? `${arg.table}.${arg.name}` : arg.name;
        return allResults.reduce((sum, r) => {
          const value = r[key];
          return (
            sum + (value !== null && value !== undefined ? Number(value) : 0)
          );
        }, 0);
      }
      throw new Error("SUM function requires a single column argument");

    case "AVG":
      if (args.length === 1 && args[0].type === "COLUMN") {
        const arg = args[0];
        const key = arg.table ? `${arg.table}.${arg.name}` : arg.name;
        const values = allResults
          .map((r) => r[key])
          .filter((v) => v !== null && v !== undefined)
          .map(Number);
        return values.length > 0
          ? values.reduce((a, b) => a + b, 0) / values.length
          : null;
      }
      throw new Error("AVG function requires a single column argument");

    case "MIN":
      if (args.length === 1 && args[0].type === "COLUMN") {
        const arg = args[0];
        const key = arg.table ? `${arg.table}.${arg.name}` : arg.name;
        const values = allResults
          .map((r) => r[key])
          .filter((v) => v !== null && v !== undefined);
        return values.length > 0 ? Math.min(...values.map(Number)) : null;
      }
      throw new Error("MIN function requires a single column argument");

    case "MAX":
      if (args.length === 1 && args[0].type === "COLUMN") {
        const arg = args[0];
        const key = arg.table ? `${arg.table}.${arg.name}` : arg.name;
        const values = allResults
          .map((r) => r[key])
          .filter((v) => v !== null && v !== undefined);
        return values.length > 0 ? Math.max(...values.map(Number)) : null;
      }
      throw new Error("MAX function requires a single column argument");

    case "ABS":
      if (row && args.length === 1 && args[0].type === "COLUMN") {
        const arg = args[0];
        const key = arg.table ? `${arg.table}.${arg.name}` : arg.name;
        const value = row[key];
        return Math.abs(Number(value));
      }
      throw new Error("ABS function requires a single column argument");

    default:
      throw new Error(`Unknown function: ${name}`);
  }
}
