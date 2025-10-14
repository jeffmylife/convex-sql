/**
 * Convex adapter - implements generic DatabaseContext for Convex backend
 */

import { GenericQueryCtx, GenericDataModel } from "convex/server";
import {
  DatabaseContext,
  QueryBuilder,
  SchemaInfo,
  TableInfo,
  IndexFilterBuilder,
  FilterBuilder,
} from "../../lib/sql/database";
import schema from "../schema";

/**
 * Convex-specific implementation of QueryBuilder
 */
class ConvexQueryBuilder implements QueryBuilder {
  constructor(private query: any) {}

  withIndex(indexName: string, filterFn: (q: IndexFilterBuilder) => any): QueryBuilder {
    const newQuery = this.query.withIndex(indexName, filterFn);
    return new ConvexQueryBuilder(newQuery);
  }

  filter(filterFn: (q: FilterBuilder) => boolean): QueryBuilder {
    const newQuery = this.query.filter(filterFn);
    return new ConvexQueryBuilder(newQuery);
  }

  order(direction: "asc" | "desc"): QueryBuilder {
    const newQuery = this.query.order(direction);
    return new ConvexQueryBuilder(newQuery);
  }

  async take(n: number): Promise<any[]> {
    return await this.query.take(n);
  }

  async collect(): Promise<any[]> {
    return await this.query.collect();
  }
}

/**
 * Convex implementation of DatabaseContext
 */
export class ConvexDatabaseContext<DataModel extends GenericDataModel>
  implements DatabaseContext
{
  private schemaInfo: SchemaInfo | null = null;

  constructor(private ctx: GenericQueryCtx<DataModel>) {}

  query(tableName: string): QueryBuilder {
    const convexQuery = this.ctx.db.query(tableName as any);
    return new ConvexQueryBuilder(convexQuery);
  }

  getSchema(): SchemaInfo {
    if (this.schemaInfo !== null) {
      return this.schemaInfo;
    }

    // Extract schema information from Convex schema at runtime
    const tables: Record<string, TableInfo> = {};

    if (!schema || !schema.tables) {
      throw new Error("Schema object not found or does not have tables property");
    }

    for (const [tableName, tableDefinition] of Object.entries(schema.tables)) {
      const indexes: Record<string, string[]> = {};

      // Use the experimental indexes() method to get index information
      if (typeof (tableDefinition as any)[" indexes"] !== "function") {
        throw new Error(`Table '${tableName}' does not have indexes() method`);
      }

      const indexList = (tableDefinition as any)[" indexes"]();
      for (const indexInfo of indexList) {
        // Skip system indexes (they start with underscore)
        if (!indexInfo.indexDescriptor.startsWith("_")) {
          // Remove the tiebreaker field (_creationTime) from the end
          const fields = indexInfo.fields.slice(0, -1);
          indexes[indexInfo.indexDescriptor] = fields;
        }
      }

      tables[tableName] = { indexes };
    }

    this.schemaInfo = { tables };
    return this.schemaInfo;
  }
}
