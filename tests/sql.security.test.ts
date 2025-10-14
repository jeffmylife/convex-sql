import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

// Include all Convex modules including _generated
// @ts-ignore - import.meta.glob is a Vite feature
const modules = import.meta.glob("../convex/**/*.*s");

describe("SQL Security - Write Operation Protection", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    await t.mutation(internal.seedData.seedDatabase, {});
  });

  test("INSERT should be rejected", async () => {
    const result = await t.query(internal.sqlQueries.runSQLTest, {
      sql: "INSERT INTO users (name, email) VALUES ('hacker', 'hacker@evil.com')",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Write operations are not supported");
      expect(result.error).toContain("INSERT");
    }
  });

  test("UPDATE should be rejected", async () => {
    const result = await t.query(internal.sqlQueries.runSQLTest, {
      sql: "UPDATE users SET status = 'hacked' WHERE status = 'active'",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Write operations are not supported");
      expect(result.error).toContain("UPDATE");
    }
  });

  test("DELETE should be rejected", async () => {
    const result = await t.query(internal.sqlQueries.runSQLTest, {
      sql: "DELETE FROM users WHERE status = 'active'",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Write operations are not supported");
      expect(result.error).toContain("DELETE");
    }
  });

  test("DROP should be rejected", async () => {
    const result = await t.query(internal.sqlQueries.runSQLTest, {
      sql: "DROP TABLE users",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Write operations are not supported");
      expect(result.error).toContain("DROP");
    }
  });

  test("CREATE should be rejected", async () => {
    const result = await t.query(internal.sqlQueries.runSQLTest, {
      sql: "CREATE TABLE evil_table (id INT, data TEXT)",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Write operations are not supported");
      expect(result.error).toContain("CREATE");
    }
  });

  test("ALTER should be rejected", async () => {
    const result = await t.query(internal.sqlQueries.runSQLTest, {
      sql: "ALTER TABLE users ADD COLUMN hacked TEXT",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Write operations are not supported");
      expect(result.error).toContain("ALTER");
    }
  });

  test("TRUNCATE should be rejected", async () => {
    const result = await t.query(internal.sqlQueries.runSQLTest, {
      sql: "TRUNCATE TABLE users",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Write operations are not supported");
      expect(result.error).toContain("TRUNCATE");
    }
  });

  test("SELECT should still work (read-only)", async () => {
    const result = await t.query(internal.sqlQueries.runSQLTest, {
      sql: "SELECT * FROM users LIMIT 5",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(5);
    }
  });
});
