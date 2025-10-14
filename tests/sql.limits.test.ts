import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach } from "vitest";
import schema from "../convex/schema";
import { query } from "../convex/_generated/server";
import { executeSQL, PERMISSIVE_LIMITS, QueryLimits } from "../convex/sql";
import { v } from "convex/values";

// Include all Convex modules including _generated
// @ts-ignore - import.meta.glob is a Vite feature
const modules = import.meta.glob("../convex/**/*.*s");

// Test query that uses custom limits
const testQueryWithLimits = query({
  args: { sql: v.string(), limits: v.optional(v.any()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await executeSQL(ctx, args.sql, args.limits as QueryLimits | undefined);
  },
});

describe("SQL Query Limits", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = convexTest(schema, { ...modules, testQueryWithLimits });
    // Create test data
    for (let i = 0; i < 50; i++) {
      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          name: `User ${i}`,
          email: `user${i}@test.com`,
          age: 20 + (i % 50),
          status: i % 3 === 0 ? "active" : i % 3 === 1 ? "inactive" : "pending",
        });
      });
    }
  });

  test("DEFAULT_LIMITS: Query without LIMIT should be rejected", async () => {
    try {
      await t.run(async (ctx) => {
        await executeSQL(ctx, "SELECT * FROM users");
      });
      throw new Error("Should have thrown error");
    } catch (error: any) {
      expect(error.message).toContain("must include a LIMIT clause");
      expect(error.message).toContain("users");
    }
  });

  test("DEFAULT_LIMITS: Query with LIMIT <= maxLimit should work", async () => {
    const result = await t.run(async (ctx) => {
      return await executeSQL(ctx, "SELECT * FROM users LIMIT 10");
    });

    expect(result.length).toBe(10);
  });

  test("DEFAULT_LIMITS: Query with LIMIT > maxLimit should be rejected", async () => {
    try {
      await t.run(async (ctx) => {
        await executeSQL(ctx, "SELECT * FROM users LIMIT 5000");
      });
      throw new Error("Should have thrown error");
    } catch (error: any) {
      expect(error.message).toContain("exceeds maximum allowed limit");
      expect(error.message).toContain("1000");
    }
  });

  test("PERMISSIVE_LIMITS: Query without LIMIT should work", async () => {
    const result = await t.run(async (ctx) => {
      return await executeSQL(ctx, "SELECT * FROM users", PERMISSIVE_LIMITS);
    });

    // Should auto-apply maxRows limit (10000, but we only have 50 rows)
    expect(result.length).toBe(50);
  });

  test("PERMISSIVE_LIMITS: Allows higher limits", async () => {
    const result = await t.run(async (ctx) => {
      return await executeSQL(ctx, "SELECT * FROM users LIMIT 5000", PERMISSIVE_LIMITS);
    });

    expect(result.length).toBe(50); // All rows
  });

  test("Custom limits: exemptTables allows queries without LIMIT", async () => {
    const customLimits: QueryLimits = {
      maxRows: 1000,
      maxLimit: 1000,
      requireLimit: true,
      exemptTables: ["users"],
    };

    const result = await t.run(async (ctx) => {
      return await executeSQL(ctx, "SELECT * FROM users", customLimits);
    });

    expect(result.length).toBe(50); // All rows
  });

  test("GROUP BY queries don't require LIMIT", async () => {
    const result = await t.run(async (ctx) => {
      return await executeSQL(ctx, "SELECT status, COUNT(*) as count FROM users GROUP BY status");
    });

    expect(result.length).toBe(3); // 3 statuses
    expect(result[0]).toHaveProperty("status");
    expect(result[0]).toHaveProperty("count");
  });

  test("Result size is capped at maxRows even with larger LIMIT", async () => {
    const customLimits: QueryLimits = {
      maxRows: 5, // Only allow 5 rows max
      maxLimit: 1000,
      requireLimit: false,
      exemptTables: [],
    };

    const result = await t.run(async (ctx) => {
      return await executeSQL(ctx, "SELECT * FROM users LIMIT 100", customLimits);
    });

    expect(result.length).toBe(5); // Capped at maxRows
  });

  test("Empty query should be rejected", async () => {
    try {
      await t.run(async (ctx) => {
        await executeSQL(ctx, "");
      });
      throw new Error("Should have thrown error");
    } catch (error: any) {
      expect(error.message).toContain("Empty SQL query");
    }
  });
});
