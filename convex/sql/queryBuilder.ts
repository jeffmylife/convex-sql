import { GenericQueryCtx } from "convex/server";
import { SelectStatement, WhereClause, JoinClause, ColumnExpression } from "../../lib/sql/types";
import { GenericDataModel, TableNamesInDataModel } from "convex/server";

export async function executeSelect<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
  statement: SelectStatement
): Promise<any[]> {
  // Handle JOINs if present
  if (statement.joins && statement.joins.length > 0) {
    return await executeSelectWithJoin(ctx, statement);
  }

  // Simple SELECT without JOIN (original logic)
  const tableName = statement.from as TableNamesInDataModel<DataModel>;

  // Start with a table scan
  let query = ctx.db.query(tableName);

  // Apply WHERE clause
  if (statement.where) {
    query = query.filter((q) => buildFilterExpression(q, statement.where!, statement.from));
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
  statement: SelectStatement
): Promise<any[]> {
  const leftTableName = statement.from as TableNamesInDataModel<DataModel>;

  // 1. Query the FROM table (apply WHERE filters that apply to this table)
  let leftQuery = ctx.db.query(leftTableName);

  // Apply WHERE clauses that filter the left table
  if (statement.where) {
    leftQuery = leftQuery.filter((q) =>
      buildFilterExpression(q, statement.where!, statement.from)
    );
  }

  let leftResults = await leftQuery.collect();

  // 2. For each JOIN, fetch and merge data
  for (const join of statement.joins!) {
    leftResults = await performJoin(ctx, leftResults, join, statement.from);
  }

  // 3. Apply column projection
  return projectColumns(leftResults, statement.columns, statement.from, statement.joins);
}

async function performJoin<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
  leftResults: any[],
  join: JoinClause,
  fromTable: string
): Promise<any[]> {
  const rightTableName = join.table as TableNamesInDataModel<DataModel>;

  // Fetch all from right table
  const rightResults = await ctx.db.query(rightTableName).collect();

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
  joins?: JoinClause[]
): any[] {
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
      }
    }

    return projected;
  });
}

function buildFilterExpression(q: any, where: WhereClause, currentTable: string): boolean {
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
