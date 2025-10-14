import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach } from "vitest";
import schema from "../convex/schema";
import { query } from "../convex/_generated/server";
import { executeSQL } from "../convex/sql";
import { v } from "convex/values";

// Include all Convex modules including _generated
// @ts-ignore - import.meta.glob is a Vite feature
const modules = import.meta.glob("../convex/**/*.*s");

// Test query
const testQuery = query({
  args: { sql: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await executeSQL(ctx, args.sql);
  },
});

describe("SQL Aggregates with LIMIT", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = convexTest(schema, { ...modules, testQuery });
    // Create 100 test users
    for (let i = 0; i < 100; i++) {
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

  test("COUNT(*) without LIMIT should count all rows", async () => {
    const result = await t.run(async (ctx) => {
      return await executeSQL(ctx, "SELECT COUNT(*) FROM users");
    });

    expect(result.length).toBe(1);
    expect(result[0]["COUNT(*)"]).toBe(100);
  });

  test("COUNT(*) with LIMIT should still count all rows (LIMIT applies to result)", async () => {
    const result = await t.run(async (ctx) => {
      return await executeSQL(ctx, "SELECT COUNT(*) FROM users LIMIT 19");
    });

    // LIMIT should NOT affect the count - it counts all 100 rows
    // LIMIT only limits the number of result rows (which is already 1)
    expect(result.length).toBe(1);
    expect(result[0]["COUNT(*)"]).toBe(100); // Should be 100, NOT 19
  });

  test("COUNT(*) with WHERE and LIMIT", async () => {
    const result = await t.run(async (ctx) => {
      return await executeSQL(ctx, "SELECT COUNT(*) FROM users WHERE status = 'active' LIMIT 5");
    });

    // Should count all active users (34 = Math.ceil(100/3)), not just 5
    expect(result.length).toBe(1);
    expect(result[0]["COUNT(*)"]).toBe(34);
  });

  test("SUM with LIMIT should sum all rows", async () => {
    const result = await t.run(async (ctx) => {
      return await executeSQL(ctx, "SELECT SUM(age) as total_age FROM users LIMIT 10");
    });

    // Should sum all 100 users' ages, not just 10
    expect(result.length).toBe(1);
    expect(result[0].total_age).toBeGreaterThan(2000); // Much more than if only 10 users
  });

  test("AVG with LIMIT should average all rows", async () => {
    const result = await t.run(async (ctx) => {
      return await executeSQL(ctx, "SELECT AVG(age) as avg_age FROM users LIMIT 5");
    });

    // Should average all 100 users, not just 5
    expect(result.length).toBe(1);
    expect(result[0].avg_age).toBeCloseTo(44.5, 1); // Average of ages 20-69
  });

  test("Multiple aggregates with LIMIT", async () => {
    const result = await t.run(async (ctx) => {
      return await executeSQL(ctx,
        "SELECT COUNT(*) as count, AVG(age) as avg_age, MIN(age) as min_age, MAX(age) as max_age FROM users LIMIT 1"
      );
    });

    expect(result.length).toBe(1);
    expect(result[0].count).toBe(100);
    expect(result[0].avg_age).toBeCloseTo(44.5, 1);
    expect(result[0].min_age).toBe(20);
    expect(result[0].max_age).toBe(69);
  });

  test("GROUP BY with LIMIT should limit groups, not rows scanned", async () => {
    const result = await t.run(async (ctx) => {
      return await executeSQL(ctx,
        "SELECT status, COUNT(*) as count FROM users GROUP BY status LIMIT 2"
      );
    });

    // Should scan all users but return only 2 groups
    expect(result.length).toBe(2);
    // Each group should have counted all rows in that group
    expect(result[0].count).toBeGreaterThan(30); // ~33-34 per group
  });

  test("Regular SELECT with LIMIT should limit rows", async () => {
    const result = await t.run(async (ctx) => {
      return await executeSQL(ctx, "SELECT name, age FROM users LIMIT 10");
    });

    // Regular SELECT should return only 10 rows
    expect(result.length).toBe(10);
  });

  test("Aggregate without GROUP BY returns single row regardless of LIMIT", async () => {
    const result = await t.run(async (ctx) => {
      return await executeSQL(ctx, "SELECT COUNT(*) FROM users LIMIT 1000");
    });

    // Even with large LIMIT, aggregate returns 1 row
    expect(result.length).toBe(1);
    expect(result[0]["COUNT(*)"]).toBe(100);
  });
});
