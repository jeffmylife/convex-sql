import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

// Include all Convex modules including _generated
// @ts-ignore - import.meta.glob is a Vite feature
const modules = import.meta.glob("../convex/**/*.*s");

describe("Bug: GROUP BY should respect LIMIT", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    await t.mutation(internal.seedData.seedDatabase, {});
  });

  test("GROUP BY with LIMIT should return limited groups", async () => {
    const result = await t.query(internal.sqlQueries.runSQLTest, {
      sql: "SELECT status, COUNT(*) as count FROM users GROUP BY status LIMIT 2",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      console.log(`\nReturned ${result.data.length} groups (expected 2)`);
      console.log("Groups:", result.data.map(r => r.status));

      // Should only return 2 groups, not all 3
      expect(result.data.length).toBe(2);
    }
  });

  test("GROUP BY without LIMIT should return all groups", async () => {
    const result = await t.query(internal.sqlQueries.runSQLTest, {
      sql: "SELECT status, COUNT(*) as count FROM users GROUP BY status",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      console.log(`\nWithout LIMIT: Returned ${result.data.length} groups`);
      console.log("All groups:", result.data.map(r => r.status));

      // Should return all 3 groups (active, inactive, pending)
      expect(result.data.length).toBe(3);
    }
  });

  test("Simple query with LIMIT works correctly", async () => {
    const result = await t.query(internal.sqlQueries.runSQLTest, {
      sql: "SELECT name FROM users LIMIT 5",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(5);
    }
  });
});
