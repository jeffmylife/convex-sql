import { GenericQueryCtx } from "convex/server";
import {
  SelectStatement,
  WhereClause,
  JoinClause,
  ColumnExpression,
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
  } else {
    // Apply WHERE clause as filter
    if (statement.where) {
      query = query.filter((q) =>
        buildFilterExpression(q, statement.where!, statement.from),
      );
    }
  }

  // Apply ORDER BY and execute query
  let results;
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

  // Apply column selection
  return projectColumns(results, statement.columns, statement.from);
}

async function executeSelectWithJoin<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
  statement: SelectStatement,
): Promise<any[]> {
  const leftTableName = statement.from as TableNamesInDataModel<DataModel>;

  // 1. Query the FROM table (apply WHERE filters that apply to this table)
  let leftQuery = ctx.db.query(leftTableName);

  // Apply index or WHERE clauses that filter the left table
  if (statement.fromIndex) {
    leftQuery = applyIndex(
      ctx,
      leftQuery,
      statement.from,
      statement.fromIndex,
      statement.where,
    );
  } else {
    // Apply WHERE clauses that filter the left table
    if (statement.where) {
      leftQuery = leftQuery.filter((q) =>
        buildFilterExpression(q, statement.where!, statement.from),
      );
    }
  }

  let leftResults = await leftQuery.collect();

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

  // 3. Apply column projection
  return projectColumns(
    leftResults,
    statement.columns,
    statement.from,
    statement.joins,
  );
}

async function performJoin<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
  leftResults: any[],
  join: JoinClause,
  fromTable: string,
  globalWhereClause?: WhereClause,
): Promise<any[]> {
  const rightTableName = join.table as TableNamesInDataModel<DataModel>;

  // Fetch from right table, potentially using an index
  let rightQuery = ctx.db.query(rightTableName);

  // Try to optimize JOIN with index if possible
  if (join.index) {
    // Check if we can extract join key values from left results
    const leftJoinValues = extractJoinValues(leftResults, join.on.leftField);

    if (leftJoinValues.length > 0) {
      // Use index optimization for all datasets - indexes provide better performance
      // by only fetching relevant data instead of entire tables
      return await performOptimizedJoin(
        ctx,
        leftResults,
        join,
        fromTable,
        leftJoinValues,
        globalWhereClause,
      );
    }
    // Fall back to in-memory join if no join values found
  }

  // Apply any WHERE conditions that apply to this joined table
  if (globalWhereClause) {
    rightQuery = rightQuery.filter((q) =>
      buildFilterExpression(q, globalWhereClause, join.table),
    );
  }

  const rightResults = await rightQuery.collect();

  // Create index map for right table for efficient lookup
  const rightMap = new Map<any, any[]>();
  for (const rightRow of rightResults) {
    const key = rightRow[join.on.rightField];
    if (!rightMap.has(key)) {
      rightMap.set(key, []);
    }
    rightMap.get(key)!.push(rightRow);
  }

  // Perform INNER JOIN
  const joined: any[] = [];

  for (const leftRow of leftResults) {
    const leftKey = leftRow[join.on.leftField];
    const matchingRightRows = rightMap.get(leftKey);

    if (matchingRightRows) {
      for (const rightRow of matchingRightRows) {
        // Merge rows with table prefixes
        const mergedRow: any = {};

        // Add left table fields with prefix
        for (const [key, value] of Object.entries(leftRow)) {
          mergedRow[`${fromTable}.${key}`] = value;
        }

        // Add right table fields with prefix
        for (const [key, value] of Object.entries(rightRow)) {
          mergedRow[`${join.table}.${key}`] = value;
        }

        joined.push(mergedRow);
      }
    }
  }

  return joined;
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

function extractJoinValues(leftResults: any[], leftField: string): any[] {
  const values = new Set<any>();
  for (const row of leftResults) {
    const value = row[leftField];
    if (value !== undefined && value !== null) {
      values.add(value);
    }
  }
  return Array.from(values);
}

async function performOptimizedJoin<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
  leftResults: any[],
  join: JoinClause,
  fromTable: string,
  leftJoinValues: any[],
  globalWhereClause?: WhereClause,
): Promise<any[]> {
  const rightTableName = join.table as TableNamesInDataModel<DataModel>;

  // Build queries for all join values in parallel
  const queryPromises = leftJoinValues.map(async (joinValue) => {
    let rightQuery = ctx.db.query(rightTableName);

    // Apply the index filter for this specific join value
    if (join.index) {
      rightQuery = applyIndexForJoinValue(
        ctx,
        rightQuery,
        join.table,
        join.index,
        join.on.rightField,
        joinValue,
      );
    }

    // Apply any global WHERE conditions
    if (globalWhereClause) {
      rightQuery = rightQuery.filter((q) =>
        buildFilterExpression(q, globalWhereClause, join.table),
      );
    }

    const rightResults = await rightQuery.collect();
    return { joinValue, rightResults };
  });

  // Execute all queries in parallel
  const queryResults = await Promise.all(queryPromises);

  // Build the final joined results
  const joined: any[] = [];

  for (const { joinValue, rightResults } of queryResults) {
    // Find matching left results for this join value
    const matchingLeftResults = leftResults.filter(
      (leftRow) => leftRow[join.on.leftField] === joinValue,
    );

    // Create joined rows
    for (const leftRow of matchingLeftResults) {
      for (const rightRow of rightResults) {
        // Merge rows with table prefixes
        const mergedRow: any = {};

        // Add left table fields with prefix
        for (const [key, value] of Object.entries(leftRow)) {
          mergedRow[`${fromTable}.${key}`] = value;
        }

        // Add right table fields with prefix
        for (const [key, value] of Object.entries(rightRow)) {
          mergedRow[`${join.table}.${key}`] = value;
        }

        joined.push(mergedRow);
      }
    }
  }

  return joined;
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
      // For now, just return the count of non-null values
      const arg = args[0];
      if (arg && arg.type === "COLUMN") {
        const key = arg.table ? `${arg.table}.${arg.name}` : arg.name;
        return allResults.filter((r) => r[key] !== null && r[key] !== undefined)
          .length;
      }
      return allResults.length;

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

function applyIndexForJoinValue<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
  query: any,
  tableName: string,
  indexName: string,
  joinField: string,
  joinValue: any,
): any {
  // Get index information
  const indexRegistry = getIndexRegistry();
  const tableIndexes = indexRegistry[tableName];
  const indexColumns = tableIndexes[indexName];

  // Build a filter that matches the join value on the first index column
  // (assuming the join field is the first column of the index)
  if (indexColumns[0] === joinField) {
    return query.withIndex(indexName, (q: any) => q.eq(joinField, joinValue));
  }

  // If join field is not the first column, we can't optimize with this index
  // Fall back to regular filtering
  return query.filter((q: any) => q.eq(q.field(joinField), joinValue));
}
