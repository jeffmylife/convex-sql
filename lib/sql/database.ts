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
  withIndex(indexName: string, filterFn: (q: IndexFilterBuilder) => any): QueryBuilder;

  /** Apply a filter predicate */
  filter(filterFn: (q: FilterBuilder) => boolean): QueryBuilder;

  /** Set order direction (ascending or descending) */
  order(direction: "asc" | "desc"): QueryBuilder;

  /** Take first N results */
  take(n: number): Promise<any[]>;

  /** Collect all results */
  collect(): Promise<any[]>;
}

/**
 * Filter builder for index queries
 */
export interface IndexFilterBuilder {
  eq(field: string, value: any): any;
  gt(field: string, value: any): any;
  lt(field: string, value: any): any;
  gte(field: string, value: any): any;
  lte(field: string, value: any): any;
}

/**
 * Filter builder for WHERE clauses
 */
export interface FilterBuilder {
  field(name: string): any;
  eq(field: any, value: any): boolean;
  neq(field: any, value: any): boolean;
  gt(field: any, value: any): boolean;
  lt(field: any, value: any): boolean;
  gte(field: any, value: any): boolean;
  lte(field: any, value: any): boolean;
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
