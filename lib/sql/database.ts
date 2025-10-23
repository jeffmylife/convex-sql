/**
 * Generic database interface for SQL engine.
 * Any database system can implement this interface to support SQL querying.
 */

/**
 * Schema information extracted from the database
 */
export interface SchemaInfo {
  tables: Record<string, TableInfo>;
}

export interface TableInfo {
  /** Map of index name to array of field names in the index */
  indexes: Record<string, string[]>;
}

/**
 * Query builder interface - minimal operations needed by SQL engine
 */
export interface QueryBuilder {
  /** Apply an index with filter conditions */
  withIndex(
    indexName: string,
    filterFn: (q: IndexFilterBuilder) => IndexFilterBuilder,
  ): QueryBuilder;

  /** Apply a filter predicate */
  filter(filterFn: (q: FilterBuilder) => boolean): QueryBuilder;

  /** Set order direction (ascending or descending) */
  order(direction: "asc" | "desc"): QueryBuilder;

  /** Take first N results */
  take(n: number): Promise<Record<string, unknown>[]>;

  /** Collect all results */
  collect(): Promise<Record<string, unknown>[]>;
}

/**
 * Filter builder for index queries
 */
export interface IndexFilterBuilder {
  eq(field: string, value: unknown): IndexFilterBuilder;
  gt(field: string, value: unknown): IndexFilterBuilder;
  lt(field: string, value: unknown): IndexFilterBuilder;
  gte(field: string, value: unknown): IndexFilterBuilder;
  lte(field: string, value: unknown): IndexFilterBuilder;
}

/**
 * Filter builder for WHERE clauses
 */
export interface FilterBuilder {
  field(name: string): unknown;
  eq(field: unknown, value: unknown): boolean;
  neq(field: unknown, value: unknown): boolean;
  gt(field: unknown, value: unknown): boolean;
  lt(field: unknown, value: unknown): boolean;
  gte(field: unknown, value: unknown): boolean;
  lte(field: unknown, value: unknown): boolean;
  and(left: boolean, right: boolean): boolean;
  or(left: boolean, right: boolean): boolean;
}

/**
 * Main database context interface
 */
export interface DatabaseContext {
  /**
   * Start a query on a table
   * @throws Error if table doesn't exist
   */
  query(tableName: string): QueryBuilder;

  /**
   * Get schema information for all tables
   */
  getSchema(): SchemaInfo;
}
