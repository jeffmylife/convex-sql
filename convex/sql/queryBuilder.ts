import { GenericQueryCtx } from "convex/server";
import { SelectStatement, WhereClause } from "../../lib/sql/types";
import { GenericDataModel, TableNamesInDataModel } from "convex/server";

export async function executeSelect<DataModel extends GenericDataModel>(
  ctx: GenericQueryCtx<DataModel>,
  statement: SelectStatement
): Promise<any[]> {
  const tableName = statement.from as TableNamesInDataModel<DataModel>;

  // Start with a table scan
  let query = ctx.db.query(tableName);

  // Apply WHERE clause
  if (statement.where) {
    query = query.filter((q) => buildFilterExpression(q, statement.where!));
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
  if (statement.columns.length === 1 && statement.columns[0].type === "STAR") {
    return results;
  }

  return results.map((doc: any) => {
    const projected: any = {};
    for (const col of statement.columns) {
      if (col.type === "COLUMN") {
        const key = col.alias || col.name;
        projected[key] = doc[col.name];
      }
    }
    return projected;
  });
}

function buildFilterExpression(q: any, where: WhereClause): boolean {
  if (where.type === "COMPARISON") {
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
      buildFilterExpression(q, where.left!),
      buildFilterExpression(q, where.right!)
    );
  } else if (where.type === "OR") {
    return q.or(
      buildFilterExpression(q, where.left!),
      buildFilterExpression(q, where.right!)
    );
  }

  throw new Error(`Unknown WHERE clause type: ${where.type}`);
}
