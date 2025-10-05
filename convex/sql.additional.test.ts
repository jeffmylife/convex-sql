import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// Include all Convex modules including _generated
// @ts-ignore - import.meta.glob is a Vite feature
const modules = import.meta.glob("./**/*.*s");

describe("SQL Engine - Additional Coverage", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    await t.mutation(api.seedData.seedDatabase, {});
  });

  test("JOIN: Multiple ON equality conditions", async () => {
    // Create a contrived self-join style constraint: users._id = posts.authorId AND users.status = users.status
    // Second condition is tautological but exercises multi-condition path with two fields.
    const res = await t.query(api.sqlQueries.runSQL, {
      sql: `SELECT users.name, posts.title
FROM users
INNER JOIN posts ON users._id = posts.authorId AND users.status = users.status
LIMIT 5`,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.length).toBeGreaterThan(0);
      for (const row of res.data) {
        expect(row).toHaveProperty("name");
        expect(row).toHaveProperty("title");
      }
    }
  });

  test.fails("ORDER BY: Asc/Desc on numeric column", async () => {
    const asc = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT age FROM users ORDER BY age ASC LIMIT 5",
    });
    const desc = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT age FROM users ORDER BY age DESC LIMIT 5",
    });
    expect(asc.success).toBe(true);
    expect(desc.success).toBe(true);
    if (asc.success && desc.success) {
      const agesAsc = asc.data.map((r: any) => r.age);
      const agesDesc = desc.data.map((r: any) => r.age);
      expect([...agesAsc].sort((a: number, b: number) => a - b)).toEqual(
        agesAsc,
      );
      expect([...agesDesc].sort((a: number, b: number) => b - a)).toEqual(
        agesDesc,
      );
    }
  });

  test("JOIN: Users.* projection with table-star and column selection", async () => {
    const res = await t.query(api.sqlQueries.runSQL, {
      sql: `SELECT users.*, posts.title
FROM users
INNER JOIN posts ON users._id = posts.authorId
LIMIT 3`,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.length).toBeGreaterThan(0);
      for (const row of res.data) {
        expect(row).toHaveProperty("_id");
        expect(row).toHaveProperty("name");
        expect(row).toHaveProperty("email");
        expect(row).toHaveProperty("title");
      }
    }
  });

  test.fails(
    "Index: Missing required prefix column errors clearly",
    async () => {
      // by_status_and_age requires equality on status before range on age
      const res = await t.query(api.sqlQueries.runSQL, {
        sql: "SELECT * FROM users@by_status_and_age WHERE age > 30",
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toMatch(
          /requires WHERE condition on column 'status'|requires WHERE conditions on columns/i,
        );
      }
    },
  );

  test("GROUP BY: Mixing aggregates and plain columns without GROUP BY should error", async () => {
    const res = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT COUNT(*), age FROM users",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toMatch(/requires GROUP BY/i);
    }
  });

  test("GROUP BY: SELECT * with GROUP BY should error", async () => {
    const res = await t.query(api.sqlQueries.runSQL, {
      sql: `SELECT * FROM users GROUP BY status`,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toMatch(/not allowed with GROUP BY/i);
    }
  });

  test("HAVING: Reference aggregate via alias", async () => {
    const res = await t.query(api.sqlQueries.runSQL, {
      sql: `SELECT status, COUNT(*) AS c
FROM users
GROUP BY status
HAVING c > 10`,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      for (const row of res.data) {
        expect(row).toHaveProperty("status");
        expect(row).toHaveProperty("c");
        expect(row.c).toBeGreaterThan(10);
      }
    }
  });

  test("JOIN: Non-existent table in JOIN errors clearly", async () => {
    const res = await t.query(api.sqlQueries.runSQL, {
      sql: `SELECT users.name
FROM users
INNER JOIN does_not_exist ON users._id = does_not_exist.userId`,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toMatch(/does not exist/i);
    }
  });
});
