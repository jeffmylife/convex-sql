/**
 * SQL-like Query Language for Convex - Examples
 *
 * This file demonstrates how to use the SQL-like query language with Convex.
 * Import the executeSQL function and use it in your queries.
 */

import { query } from "./_generated/server";
import { v } from "convex/values";
import { executeSQL } from "./sql";

/**
 * BASIC EXAMPLES
 */

// 1. Select all records from a table
// SQL: SELECT * FROM users
const example1 = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT * FROM users");
  },
});

// 2. Select specific columns
// SQL: SELECT name, email FROM users
const example2 = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT name, email FROM users");
  },
});

// 3. Column aliases
// SQL: SELECT name AS userName, email AS userEmail FROM users
const example3 = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT name AS userName, email AS userEmail FROM users");
  },
});

/**
 * WHERE CLAUSE EXAMPLES
 */

// 4. Equality comparison
// SQL: SELECT * FROM users WHERE status = 'active'
const example4 = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT * FROM users WHERE status = 'active'");
  },
});

// 5. Greater than comparison
// SQL: SELECT * FROM users WHERE age > 18
const example5 = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT * FROM users WHERE age > 18");
  },
});

// 6. AND condition
// SQL: SELECT * FROM users WHERE status = 'active' AND age >= 21
const example6 = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT * FROM users WHERE status = 'active' AND age >= 21");
  },
});

// 7. OR condition
// SQL: SELECT * FROM users WHERE status = 'active' OR status = 'pending'
const example7 = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT * FROM users WHERE status = 'active' OR status = 'pending'");
  },
});

// 8. Boolean values
// SQL: SELECT * FROM posts WHERE published = true
const example8 = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT * FROM posts WHERE published = true");
  },
});

/**
 * ORDER BY EXAMPLES
 */

// 9. Order by ascending
// SQL: SELECT * FROM users ORDER BY age ASC
const example9 = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT * FROM users ORDER BY age ASC");
  },
});

// 10. Order by descending
// SQL: SELECT * FROM users ORDER BY age DESC
const example10 = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT * FROM users ORDER BY age DESC");
  },
});

/**
 * LIMIT EXAMPLES
 */

// 11. Limit results
// SQL: SELECT * FROM users LIMIT 10
const example11 = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT * FROM users LIMIT 10");
  },
});

// 12. Combine WHERE, ORDER BY, and LIMIT
// SQL: SELECT name, email FROM users WHERE age > 18 ORDER BY age DESC LIMIT 5
const example12 = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(
      ctx,
      "SELECT name, email FROM users WHERE age > 18 ORDER BY age DESC LIMIT 5"
    );
  },
});

/**
 * SUPPORTED SQL FEATURES:
 *
 * - SELECT with * or specific columns
 * - Column aliases with AS
 * - FROM table_name
 * - WHERE with comparisons: =, !=, >, <, >=, <=
 * - WHERE with AND/OR logic
 * - String, number, and boolean values
 * - ORDER BY field ASC/DESC
 * - LIMIT n
 *
 * NOT YET SUPPORTED:
 * - JOIN operations
 * - GROUP BY / HAVING
 * - Aggregate functions (COUNT, SUM, AVG, etc.)
 * - Subqueries
 * - DISTINCT
 * - IN / NOT IN
 * - LIKE pattern matching
 * - INSERT, UPDATE, DELETE (read-only)
 */
