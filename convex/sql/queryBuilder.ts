import { GenericQueryCtx } from "convex/server";
import {
  SelectStatement,
  WhereClause,
  JoinClause,
  ColumnExpression,
  GroupByClause,
} from "../../lib/sql/types";
import { GenericDataModel, TableNamesInDataModel } from "convex/server";
import schema from "../schema.js";

// Cache for extracted index information
let indexCache: Record<string, Record<string, string[]>> | null = null;

function getIndexRegistry(): Record<string, Record<string, string[]>> {
  if (indexCache !== null) {
    return indexCache;
  }

  indexCache = {};

  // Extract index information from the schema at runtime
  if (!schema || !schema.tables) {
    throw new Error("Schema object not found or does not have tables property");
  }

  for (const [tableName, tableDefinition] of Object.entries(schema.tables)) {
    const tableIndexes: Record<string, string[]> = {};

    // Use the experimental indexes() method to get index information
    if (typeof (tableDefinition as any)[" indexes"] !== "function") {
      throw new Error(`Table '${tableName}' does not have indexes() method`);
    }

    const indexes = (tableDefinition as any)[" indexes"]();
    for (const indexInfo of indexes) {
      // Skip system indexes (they start with underscore)
      if (!indexInfo.indexDescriptor.startsWith("_")) {
        // Remove the tiebreaker field (_creationTime) from the end
        const fields = indexInfo.fields.slice(0, -1);
        tableIndexes[indexInfo.indexDescriptor] = fields;
      }
    }

    if (Object.keys(tableIndexes).length > 0) {
      indexCache[tableName] = tableIndexes;
    }
  }

  return indexCache;
}

function applyIndex<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
  query: any,
  tableName: string,
  indexName: string,
  whereClause?: WhereClause,
): any {
  // Get actual index information from the schema
  const indexRegistry = getIndexRegistry();
  const tableIndexes = indexRegistry[tableName];

  if (!tableIndexes) {
    throw new Error(`Table '${tableName}' not found in schema`);
  }

  const indexColumns = tableIndexes[indexName];
  if (!indexColumns) {
    throw new Error(
      `Index '${indexName}' not found for table '${tableName}'. ` +
        `Available indexes: ${Object.keys(tableIndexes).join(", ")}`,
    );
  }

  // Build the index filter based on WHERE conditions
  const indexFilter = buildIndexFilter(whereClause, indexColumns, tableName);

  // Apply the index
  return query.withIndex(indexName, indexFilter);
}

function buildIndexFilter(
  whereClause: WhereClause | undefined,
  indexColumns: string[],
  tableName: string,
): (q: any) => boolean {
  return (q: any) => {
    if (!whereClause) {
      throw new Error(
        `Index '${indexColumns.join("_and_")}' requires WHERE conditions on columns: ${indexColumns.join(", ")}`,
      );
    }

    const conditions = extractComparisonConditions(whereClause, tableName);

    // For multi-column indexes, we need:
    // - Equality conditions for all columns except possibly the last
    // - Any condition (including range) for the last column
    let filterChain = q;

    for (let i = 0; i < indexColumns.length; i++) {
      const column = indexColumns[i];
      const isLastColumn = i === indexColumns.length - 1;
      const condition = conditions.find((c) => c.field === column);

      if (!condition) {
        if (isLastColumn) {
          // Last column doesn't require a condition, but we'll skip it
          continue;
        } else {
          throw new Error(
            `Index '${indexColumns.join("_and_")}' requires WHERE condition on column '${column}' (prefix column)`,
          );
        }
      }

      // Apply the appropriate filter based on the operator
      switch (condition.operator) {
        case "=":
          filterChain = filterChain.eq(column, condition.value);
          break;
        case ">":
          if (!isLastColumn) {
            throw new Error(
              `Index '${indexColumns.join("_and_")}' only supports range queries on the last column '${column}'`,
            );
          }
          filterChain = filterChain.gt(column, condition.value);
          break;
        case "<":
          if (!isLastColumn) {
            throw new Error(
              `Index '${indexColumns.join("_and_")}' only supports range queries on the last column '${column}'`,
            );
          }
          filterChain = filterChain.lt(column, condition.value);
          break;
        case ">=":
          if (!isLastColumn) {
            throw new Error(
              `Index '${indexColumns.join("_and_")}' only supports range queries on the last column '${column}'`,
            );
          }
          filterChain = filterChain.gte(column, condition.value);
          break;
        case "<=":
          if (!isLastColumn) {
            throw new Error(
              `Index '${indexColumns.join("_and_")}' only supports range queries on the last column '${column}'`,
            );
          }
          filterChain = filterChain.lte(column, condition.value);
          break;
        default:
          throw new Error(
            `Index '${indexColumns.join("_and_")}' does not support operator '${condition.operator}' on column '${column}'`,
          );
      }
    }

    return filterChain;
  };
}

function hasConditionsNotInIndex(
  whereClause: WhereClause,
  indexedFields: Set<string>,
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

function extractComparisonConditions(
  whereClause: WhereClause,
  tableName: string,
): Array<{ field: string; operator: string; value: any }> {
  const conditions: Array<{ field: string; operator: string; value: any }> = [];

  function traverseWhere(node: WhereClause): void {
    if (node.type === "COMPARISON") {
      // Only include conditions for the specified table (or no table specified)
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
    // For OR conditions, we don't handle them for indexes (too complex)
  }

  traverseWhere(whereClause);
  return conditions;
}

export async function executeSelect<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
  statement: SelectStatement,
): Promise<any[]> {
  // Validate that the table exists in the schema
  if (!schema.tables || !(statement.from in schema.tables)) {
    throw new Error(`Table '${statement.from}' does not exist`);
  }

  // Handle JOINs if present
  if (statement.joins && statement.joins.length > 0) {
    return await executeSelectWithJoin(ctx, statement);
  }

  // Simple SELECT without JOIN (original logic)
  const tableName = statement.from as TableNamesInDataModel<DataModel>;

  // Start with a table scan or indexed query
  let query = ctx.db.query(tableName);

  // Apply index if specified
  if (statement.fromIndex) {
    query = applyIndex(
      ctx,
      query,
      statement.from,
      statement.fromIndex,
      statement.where,
    );

    // Also apply any WHERE conditions not covered by the index
    if (statement.where) {
      const indexRegistry = getIndexRegistry();
      const indexColumns =
        indexRegistry[statement.from]?.[statement.fromIndex] || [];
      const indexedFields = new Set(indexColumns);

      // Check if WHERE has conditions not in the index
      const hasNonIndexedConditions = hasConditionsNotInIndex(
        statement.where,
        indexedFields,
      );
      if (hasNonIndexedConditions) {
        query = query.filter((q) =>
          buildFilterExpression(q, statement.where!, statement.from),
        );
      }
    }
  } else {
    // Apply WHERE clause as filter
    if (statement.where) {
      query = query.filter((q) =>
        buildFilterExpression(q, statement.where!, statement.from),
      );
    }
  }

  // Apply ORDER BY and execute query with error handling for non-existent tables
  let results;
  try {
    if (statement.orderBy && statement.orderBy.length > 0) {
      const firstOrder = statement.orderBy[0];
      const orderedQuery = query.order(firstOrder.direction);

      if (statement.limit) {
        results = await orderedQuery.take(statement.limit);
      } else {
        results = await orderedQuery.collect();
      }
    } else {
      if (statement.limit) {
        results = await query.take(statement.limit);
      } else {
        results = await query.collect();
      }
    }
  } catch (error: any) {
    // Detect Convex's error for non-existent tables
    if (error.message && error.message.includes("does not exist")) {
      throw new Error(`Table '${statement.from}' does not exist`);
    }
    throw error;
  }

  // Apply GROUP BY if present
  if (statement.groupBy && statement.groupBy.length > 0) {
    return applyGroupBy(results, statement);
  }

  // Apply column selection
  return projectColumns(results, statement.columns, statement.from);
}

async function executeSelectWithJoin<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
  statement: SelectStatement,
): Promise<any[]> {
  // Validate all table names in JOINs
  for (const join of statement.joins!) {
    if (!schema.tables || !(join.table in schema.tables)) {
      throw new Error(`Table '${join.table}' does not exist`);
    }
  }

  const leftTableName = statement.from as TableNamesInDataModel<DataModel>;

  // 1. Query the FROM table (apply WHERE filters that apply to this table)
  let leftQuery = ctx.db.query(leftTableName);

  // Apply index if specified (for performance)
  if (statement.fromIndex) {
    leftQuery = applyIndex(
      ctx,
      leftQuery,
      statement.from,
      statement.fromIndex,
      statement.where,
    );
  }

  // Always apply WHERE filter to ensure correctness
  // (The index may not filter all conditions correctly in some cases)
  if (statement.where) {
    leftQuery = leftQuery.filter((q) =>
      buildFilterExpression(q, statement.where!, statement.from),
    );
  }

  // For JOINs, collect left table results
  let leftResults;
  try {
    leftResults = await leftQuery.collect();
  } catch (error: any) {
    // Detect Convex's error for non-existent tables
    if (error.message && error.message.includes("does not exist")) {
      throw new Error(`Table '${statement.from}' does not exist`);
    }
    throw error;
  }
  console.log(
    `[SQL] Left table (${statement.from}): ${leftResults.length} rows`,
  );

  // 2. For each JOIN, fetch and merge data
  for (const join of statement.joins!) {
    leftResults = await performJoin(
      ctx,
      leftResults,
      join,
      statement.from,
      statement.where,
    );
  }

  // 3. Apply GROUP BY if present
  if (statement.groupBy && statement.groupBy.length > 0) {
    const grouped = applyGroupBy(leftResults, statement);
    // Apply LIMIT after grouping
    return statement.limit ? grouped.slice(0, statement.limit) : grouped;
  }

  // 4. Apply column projection
  const projected = projectColumns(
    leftResults,
    statement.columns,
    statement.from,
    statement.joins,
  );

  // 5. Apply LIMIT to final result (correct SQL semantics)
  return statement.limit ? projected.slice(0, statement.limit) : projected;
}

async function performJoin<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
  leftResults: any[],
  join: JoinClause,
  fromTable: string,
  globalWhereClause?: WhereClause,
): Promise<any[]> {
  const rightTableName = join.table as TableNamesInDataModel<DataModel>;

  // Simple SQL semantics: Read the right table
  let rightQuery = ctx.db.query(rightTableName);

  // Apply index hint on the right table if provided and usable
  if (join.index) {
    try {
      rightQuery = applyIndex(
        ctx,
        rightQuery,
        join.table,
        join.index,
        globalWhereClause,
      );
    } catch (_e) {
      // If index application fails (e.g., missing prefix), fall back silently
    }
  }

  // Apply any WHERE conditions that apply to this joined table
  if (globalWhereClause) {
    rightQuery = rightQuery.filter((q) =>
      buildFilterExpression(q, globalWhereClause, join.table),
    );
  }

  // Read right table
  let rightResults;
  try {
    rightResults = await rightQuery.collect();
  } catch (error: any) {
    // Detect Convex's error for non-existent tables
    if (error.message && error.message.includes("does not exist")) {
      throw new Error(`Table '${join.table}' does not exist`);
    }
    throw error;
  }
  console.log(`[SQL] Right table (${join.table}): ${rightResults.length} rows`);

  // Build lookup maps for each equality to speed up multi-condition joins
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
    field: string,
  ): any {
    if (table === join.table) {
      return rightRow[field];
    }
    // Value should come from the accumulated left row
    const prefixedKey = `${table}.${field}`;
    if (prefixedKey in leftRow) return leftRow[prefixedKey];
    // For the root FROM table, left rows may be unprefixed initially
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
        const leftVal = getValue(
          leftRow,
          rightRow,
          cond.leftTable,
          cond.leftField,
        );
        const rightVal = getValue(
          leftRow,
          rightRow,
          cond.rightTable,
          cond.rightField,
        );
        if (leftVal !== rightVal) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;

      // Merge rows with table prefixes, preserving already-prefixed keys on left
      const mergedRow: any = {};

      for (const [key, value] of Object.entries(leftRow)) {
        if (key.includes(".")) {
          mergedRow[key] = value; // already prefixed from prior join
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

function applyGroupBy(results: any[], statement: SelectStatement): any[] {
  if (!statement.groupBy || statement.groupBy.length === 0) {
    return results;
  }

  // Build group key for each row
  const groups = new Map<string, any[]>();

  for (const row of results) {
    const keyParts: Array<string> = [];

    for (const groupCol of statement.groupBy) {
      const key = groupCol.table
        ? `${groupCol.table}.${groupCol.field}`
        : groupCol.field;
      const value = row[key] ?? row[groupCol.field];
      // Use JSON.stringify to handle complex values
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

    // Add GROUP BY columns to the result
    const groupByColumns: GroupByClause[] = statement.groupBy;
    for (const groupCol of groupByColumns) {
      const key = groupCol.table
        ? `${groupCol.table}.${groupCol.field}`
        : groupCol.field;
      const value = groupRows[0][key] ?? groupRows[0][groupCol.field];
      resultRow[key] = value;
    }

    // Compute aggregates for each column in SELECT
    for (const col of statement.columns) {
      if (col.type === "FUNCTION") {
        const functionKey = `${col.name}(${formatFunctionArgs(col.args)})`;
        const outputKey = col.alias || functionKey;
        const value = executeFunction(col.name, col.args, null, groupRows);

        resultRow[outputKey] = value;
        // Also store with function key for HAVING clause to find it
        if (col.alias && outputKey !== functionKey) {
          resultRow[functionKey] = value;
        }
      } else if (col.type === "COLUMN") {
        // Non-aggregate column must be in GROUP BY
        const colKey = col.table ? `${col.table}.${col.name}` : col.name;
        const isInGroupBy = statement.groupBy.some(
          (g) =>
            g.field === col.name &&
            (g.table === col.table || (!g.table && !col.table)),
        );

        if (!isInGroupBy) {
          throw new Error(
            `Column '${colKey}' must appear in GROUP BY clause or be used in an aggregate function`,
          );
        }

        const outputKey = col.alias || col.name;
        resultRow[outputKey] = resultRow[colKey] ?? groupRows[0][col.name];
      } else if (col.type === "STAR" || col.type === "TABLE_STAR") {
        throw new Error(
          "SELECT * is not allowed with GROUP BY. Specify columns explicitly.",
        );
      }
    }

    groupedResults.push(resultRow);
  }

  // Apply HAVING filter if present
  let filteredResults = groupedResults;
  if (statement.having) {
    filteredResults = groupedResults.filter((row) =>
      evaluateHaving(row, statement.having!),
    );
  }

  // Clean up: remove duplicate function keys that were only added for HAVING
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
    // Also include GROUP BY columns (we know groupBy exists due to function guard)
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

function projectColumns(
  results: any[],
  columns: ColumnExpression[],
  fromTable: string,
  joins?: JoinClause[],
): any[] {
  // If the selection is only aggregates (FUNCTION columns) with no plain columns,
  // compute once and return a single-row result.
  const hasOnlyFunctions =
    columns.length > 0 && columns.every((c) => c.type === "FUNCTION");
  const hasAnyFunctions = columns.some((c) => c.type === "FUNCTION");
  const hasAnyPlainColumns = columns.some((c) => c.type === "COLUMN");

  if (hasAnyFunctions && hasAnyPlainColumns) {
    // Real SQL would require GROUP BY for mixing aggregates and non-aggregates.
    // Keep it simple and error clearly for now.
    throw new Error(
      "Mixing aggregates with columns requires GROUP BY (not implemented)",
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
    // If no joins, return as-is
    if (!joins || joins.length === 0) {
      return results;
    }

    // For joins, we need to flatten the prefixed fields
    return results;
  }

  // Handle TABLE_STAR (e.g., users.*)
  if (columns.some((col) => col.type === "TABLE_STAR")) {
    return results.map((row) => {
      const projected: any = {};

      for (const col of columns) {
        if (col.type === "TABLE_STAR") {
          // Include all fields from this table
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

function buildFilterExpression(
  q: any,
  where: WhereClause,
  currentTable: string,
): boolean {
  if (where.type === "COMPARISON") {
    // Only apply filter if it's for the current table (or no table specified)
    if (where.table && where.table !== currentTable) {
      // This filter is for a different table, skip it for now
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
      buildFilterExpression(q, where.right!, currentTable),
    );
  } else if (where.type === "OR") {
    return q.or(
      buildFilterExpression(q, where.left!, currentTable),
      buildFilterExpression(q, where.right!, currentTable),
    );
  }

  throw new Error(`Unknown WHERE clause type: ${where.type}`);
}

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

function executeFunction(
  name: string,
  args: ColumnExpression[],
  row: any,
  allResults: any[],
): any {
  switch (name) {
    case "COUNT":
      // COUNT(*) returns the total number of rows
      if (args.length === 1 && args[0].type === "STAR") {
        return allResults.length;
      }
      // Count non-null values in the specified column
      const countArg = args[0];
      if (countArg && countArg.type === "COLUMN") {
        const key = countArg.table
          ? `${countArg.table}.${countArg.name}`
          : countArg.name;
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
