/**
 * Configuration for SQL query execution limits
 * These limits help prevent abuse and excessive resource usage
 */

export interface QueryLimits {
  /**
   * Maximum number of rows that can be returned by a query
   * Default: 1000
   */
  maxRows: number;

  /**
   * Maximum LIMIT value allowed in queries
   * If a query has no LIMIT, maxRows is applied automatically
   * Default: 1000
   */
  maxLimit: number;

  /**
   * Enforce that all queries without GROUP BY must have a LIMIT clause
   * This prevents accidentally reading entire large tables
   * Default: true for production safety
   */
  requireLimit: boolean;

  /**
   * Tables that are exempt from requireLimit check
   * Useful for small lookup tables
   * Default: []
   */
  exemptTables: string[];
}

/**
 * Default limits - safe for production use
 */
export const DEFAULT_LIMITS: QueryLimits = {
  maxRows: 1000,
  maxLimit: 1000,
  requireLimit: true,
  exemptTables: [],
};

/**
 * Permissive limits - for development/testing
 * WARNING: Not recommended for public/production deployment
 */
export const PERMISSIVE_LIMITS: QueryLimits = {
  maxRows: 10000,
  maxLimit: 10000,
  requireLimit: false,
  exemptTables: [],
};

/**
 * Strict limits - for high-security/high-load environments
 */
export const STRICT_LIMITS: QueryLimits = {
  maxRows: 100,
  maxLimit: 100,
  requireLimit: true,
  exemptTables: [],
};
