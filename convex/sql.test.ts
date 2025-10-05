import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// Include all Convex modules including _generated
// @ts-ignore - import.meta.glob is a Vite feature
const modules = import.meta.glob("./**/*.*s");

describe("SQL Query Examples", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = convexTest(schema, modules);

    // Seed test data
    await t.mutation(api.seedData.seedDatabase, {});
  });

  test("Basic: Select all users", async () => {
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT * FROM users",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0]).toHaveProperty("_id");
      expect(result.data[0]).toHaveProperty("name");
      expect(result.data[0]).toHaveProperty("email");
      expect(result.data[0]).toHaveProperty("age");
      expect(result.data[0]).toHaveProperty("status");
    }
  });

  test("WHERE: Filter by age", async () => {
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT name, email\nFROM users\nWHERE age > 18",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
      // All results should have age > 18
      for (const row of result.data) {
        expect(row).toHaveProperty("name");
        expect(row).toHaveProperty("email");
      }
    }
  });

  test("Index: Query with index", async () => {
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT * FROM users@by_status WHERE status = 'active'",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
      // All results should have status = 'active'
      for (const row of result.data) {
        expect(row.status).toBe("active");
      }
    }
  });

  test("JOIN: Users & posts", async () => {
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: `SELECT users.name, posts.title
FROM users
INNER JOIN posts ON users._id = posts.authorId`,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
      for (const row of result.data) {
        expect(row).toHaveProperty("name");
        expect(row).toHaveProperty("title");
      }
    }
  });

  test("JOIN: With WHERE filter", async () => {
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: `SELECT users.name, posts.title
FROM users@by_status
INNER JOIN posts@by_author ON users._id = posts.authorId
WHERE users.status = 'active'`,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
      for (const row of result.data) {
        expect(row).toHaveProperty("name");
        expect(row).toHaveProperty("title");
      }

      // Verify we're actually filtering - should be less than total posts
      const allPosts = await t.query(api.sqlQueries.runSQL, {
        sql: "SELECT COUNT(*) FROM posts",
      });
      if (allPosts.success) {
        expect(result.data.length).toBeLessThan(allPosts.data[0]["COUNT(*)"]);
      }
    }
  });

  test("JOIN: Index with non-existent status should return 0 rows", async () => {
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: `SELECT users.name, posts.title
FROM users@by_status
INNER JOIN posts@by_author ON users._id = posts.authorId
WHERE users.status = 'NON_EXISTING_STATUS'`,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(0);
    }
  });

  test("Aggregate: COUNT", async () => {
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT COUNT(*) FROM users",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(1);
      expect(result.data[0]).toHaveProperty("COUNT(*)");
      expect(result.data[0]["COUNT(*)"]).toBe(300); // Our seed creates 300 users
    }
  });

  test("GROUP BY: Count by status", async () => {
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: `SELECT status, COUNT(*) AS user_count
FROM users
GROUP BY status`,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
      for (const row of result.data) {
        expect(row).toHaveProperty("status");
        expect(row).toHaveProperty("user_count");
        expect(typeof row.user_count).toBe("number");
      }
    }
  });

  test("GROUP BY: AVG, MIN, MAX", async () => {
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: `SELECT status, AVG(age) AS avg_age, MIN(age) AS min_age, MAX(age) AS max_age
FROM users
GROUP BY status`,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
      for (const row of result.data) {
        expect(row).toHaveProperty("status");
        expect(row).toHaveProperty("avg_age");
        expect(row).toHaveProperty("min_age");
        expect(row).toHaveProperty("max_age");
        expect(typeof row.avg_age).toBe("number");
        expect(typeof row.min_age).toBe("number");
        expect(typeof row.max_age).toBe("number");
      }
    }
  });

  test("HAVING: Filter groups", async () => {
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: `SELECT status, COUNT(*) AS count
FROM users
GROUP BY status
HAVING COUNT(*) > 1`,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      // All groups should have count > 1
      for (const row of result.data) {
        expect(row).toHaveProperty("status");
        expect(row).toHaveProperty("count");
        expect(row.count).toBeGreaterThan(1);
      }
    }
  });

  test("ORDER BY: Sort by name ascending", async () => {
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT name FROM users ORDER BY name ASC LIMIT 5",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBe(5);
      // Check that names are in ascending order
      for (let i = 1; i < result.data.length; i++) {
        expect(result.data[i].name >= result.data[i - 1].name).toBe(true);
      }
    }
  });

  test("ORDER BY: Sort by age descending with index", async () => {
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT name, age FROM users@by_status_and_age WHERE status = 'active' ORDER BY age DESC LIMIT 5",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
      // Check that ages are in descending order
      for (let i = 1; i < result.data.length; i++) {
        expect(result.data[i].age <= result.data[i - 1].age).toBe(true);
      }
    }
  });

  test("Error handling: Invalid SQL", async () => {
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: "INVALID SQL QUERY",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe("string");
    }
  });

  test("Error handling: Non-existent table", async () => {
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT * FROM nonexistent_table",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });
});
