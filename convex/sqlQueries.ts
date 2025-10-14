import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { executeSQL, PERMISSIVE_LIMITS } from "./sql";

/**
 * Example: Get all users (with LIMIT for safety)
 */
export const getAllUsers = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT * FROM users LIMIT 100");
  },
});

/**
 * Example: Get users by status with specific columns
 */
export const getUsersByStatus = query({
  args: { status: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await executeSQL(
      ctx,
      `SELECT name, email FROM users WHERE status = '${args.status}' LIMIT 100`
    );
  },
});

/**
 * Example: Get users older than a certain age
 */
export const getUsersOlderThan = query({
  args: { age: v.number() },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await executeSQL(
      ctx,
      `SELECT * FROM users WHERE age > ${args.age} ORDER BY age DESC LIMIT 100`
    );
  },
});

/**
 * Example: Get limited number of users
 */
export const getRecentUsers = query({
  args: { limit: v.number() },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await executeSQL(ctx, `SELECT * FROM users LIMIT ${args.limit}`);
  },
});

/**
 * Example: Complex query with AND/OR conditions
 */
export const getActiveAdults = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(
      ctx,
      "SELECT name, email FROM users WHERE status = 'active' AND age >= 18 LIMIT 100"
    );
  },
});

/**
 * Example: Get all posts (with LIMIT for safety)
 */
export const getAllPosts = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT * FROM posts LIMIT 100");
  },
});

/**
 * Example: Get published posts only
 */
export const getPublishedPosts = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(
      ctx,
      "SELECT title, content FROM posts WHERE published = true LIMIT 100"
    );
  },
});

/**
 * Generic SQL query executor - use this to run any SQL query
 * Uses DEFAULT_LIMITS for production safety
 *
 * IMPORTANT: All queries must include a LIMIT clause
 * Maximum LIMIT value: 1000
 * Maximum rows returned: 1000
 */
export const runSQL = query({
  args: { sql: v.string() },
  returns: v.union(
    v.object({ success: v.literal(true), data: v.any() }),
    v.object({ success: v.literal(false), error: v.string() })
  ),
  handler: async (ctx, args) => {
    try {
      // Uses DEFAULT_LIMITS for production safety
      const data = await executeSQL(ctx, args.sql);
      return { success: true as const, data };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

/**
 * Internal SQL query executor for testing
 * Uses PERMISSIVE_LIMITS - NOT for production use
 *
 * This is used by tests to avoid strict LIMIT requirements
 */
export const runSQLTest = internalQuery({
  args: { sql: v.string() },
  returns: v.union(
    v.object({ success: v.literal(true), data: v.any() }),
    v.object({ success: v.literal(false), error: v.string() })
  ),
  handler: async (ctx, args) => {
    try {
      // Uses PERMISSIVE_LIMITS for testing
      const data = await executeSQL(ctx, args.sql, PERMISSIVE_LIMITS);
      return { success: true as const, data };
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
