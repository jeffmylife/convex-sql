import { query } from "./_generated/server";
import { v } from "convex/values";
import { executeSQL } from "./sql";

/**
 * Example: Get all users
 */
export const getAllUsers = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT * FROM users");
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
      `SELECT name, email FROM users WHERE status = '${args.status}'`
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
      `SELECT * FROM users WHERE age > ${args.age} ORDER BY age DESC`
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
      "SELECT name, email FROM users WHERE status = 'active' AND age >= 18"
    );
  },
});

/**
 * Example: Get all posts
 */
export const getAllPosts = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT * FROM posts");
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
      "SELECT title, content FROM posts WHERE published = true"
    );
  },
});

/**
 * Generic SQL query executor - use this to run any SQL query
 */
export const runSQL = query({
  args: { sql: v.string() },
  returns: v.union(
    v.object({ success: v.literal(true), data: v.any() }),
    v.object({ success: v.literal(false), error: v.string() })
  ),
  handler: async (ctx, args) => {
    try {
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
