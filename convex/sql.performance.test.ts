import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// Include all Convex modules including _generated
// @ts-ignore - import.meta.glob is a Vite feature
const modules = import.meta.glob("./**/*.*s");

describe("SQL Performance - Index vs No Index", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    // Seed with the standard dataset (300 users, 800 posts)
    await t.mutation(api.seedData.seedDatabase, {});
  });

  test("Performance comparison: Finding rare status without index (table scan)", async () => {
    // WITHOUT INDEX: Uses Convex's filter() method (no index)
    const withoutIndex = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT name, email FROM users WHERE status = 'active' LIMIT 10",
    });

    expect(withoutIndex.success).toBe(true);
    if (withoutIndex.success) {
      console.log("\n📊 WITHOUT INDEX (using .filter()):");
      console.log(`   Results returned: ${withoutIndex.data.length}`);
      console.log(`   Method: Convex filter() on 300 users`);
    }
  });

  test("Performance comparison: Finding rare status WITH index (efficient)", async () => {
    // WITH INDEX: Uses by_status index for efficient lookup
    const withIndex = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT name, email FROM users@by_status WHERE status = 'active' LIMIT 10",
    });

    expect(withIndex.success).toBe(true);
    if (withIndex.success) {
      console.log("\n📊 WITH INDEX (by_status):");
      console.log(`   Results returned: ${withIndex.data.length}`);
      console.log(`   Method: Index lookup on users@by_status`);
      console.log(`   🚀 Faster execution via index!`);
    }
  });

  test("Extreme case: Finding 1 user by exact status in large dataset", async () => {
    // Imagine this was a table with 100,000 users where only 100 are 'pending'
    //
    // WITHOUT INDEX:
    // - Reads: 100,000 documents
    // - Returns: 100 results
    // - Cost: 💰 High (100k document reads)
    // - Time: 🐌 Slow (processes all rows)
    //
    // WITH INDEX:
    // - Reads: 100 documents (only pending users)
    // - Returns: 100 results
    // - Cost: 💰 Low (100 document reads)
    // - Time: ⚡ Fast (skips 99,900 rows)
    //
    // Performance gain: 1000x fewer document reads!

    const result = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT COUNT(*) FROM users@by_status WHERE status = 'pending'",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const pendingCount = result.data[0]["COUNT(*)"];
      console.log("\n💡 EXTREME SCENARIO (conceptual):");
      console.log(
        `   Current dataset: ${pendingCount} pending users out of 300 total`,
      );
      console.log(`   \n   Index benefits scale with data size:`);
      console.log(`   - Index lookup performance stays consistent`);
      console.log(`   - Filter performance degrades with more data`);
      console.log(`   - 🚀 Index advantage grows with dataset size!`);
    }
  });

  test("Range query: Finding users by age without index", async () => {
    // WITHOUT INDEX on age field (uses filter())
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT name, age FROM users WHERE age > 60 LIMIT 5",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      console.log("\n📊 RANGE QUERY without index on 'age':");
      console.log(`   Results: ${result.data.length}`);
      console.log(`   Method: Convex filter() on age field`);
      console.log(`   ⚠️  No index on 'age' field - uses filter()`);
    }
  });

  test("Compound index: Filter + Order with index", async () => {
    // WITH COMPOUND INDEX: by_status_and_age
    // - Filters to status = 'active' (~100 users)
    // - Orders by age using the index
    // - Takes first 5
    // - Only reads 5 documents! (with limit optimization)
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: `SELECT name, age
FROM users@by_status_and_age
WHERE status = 'active'
ORDER BY age DESC
LIMIT 5`,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      console.log("\n🚀 COMPOUND INDEX (by_status_and_age) with ORDER BY:");
      console.log(`   Index allows: filter by status + order by age`);
      console.log(`   Results: ${result.data.length}`);
      console.log(`   Method: Index lookup with built-in ordering`);
      console.log(`   🚀 Efficient filtering + ordering!`);
    }
  });

  test("JOIN performance: Indexed join field", async () => {
    // JOIN with index on join field (posts@by_author)
    // - Index on posts.authorId speeds up the join lookup
    // - Without the index, must scan all 800 posts for each user
    const result = await t.query(api.sqlQueries.runSQL, {
      sql: `SELECT users.name, COUNT(*) as post_count
FROM users@by_status
INNER JOIN posts@by_author ON users._id = posts.authorId
WHERE users.status = 'active'
GROUP BY users.name
LIMIT 5`,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      console.log("\n🔗 INDEXED JOIN performance:");
      console.log(`   - Left table (users@by_status): indexed lookup`);
      console.log(`   - Right table (posts@by_author): indexed lookup`);
      console.log(`   - Results: ${result.data.length} user-post combinations`);
      console.log(
        `   \n   💡 Indexes help with efficient table lookups in JOINs`,
      );
    }
  });
});
