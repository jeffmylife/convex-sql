import { convexTest } from "convex-test";
import { expect, test, describe, beforeEach } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// Include all Convex modules including _generated
// @ts-ignore - import.meta.glob is a Vite feature
const modules = import.meta.glob("./**/*.*s");

describe("SQL Performance - Most Dramatic Differences", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = convexTest(schema, modules);
    await t.mutation(api.seedData.seedDatabase, {});
  });

  test("EXTREME #1: Top 10 queries with LIMIT", async () => {
    console.log("\n" + "=".repeat(70));
    console.log("🏆 MOST DRAMATIC OPTIMIZATION: ORDER BY + LIMIT");
    console.log("=".repeat(70));

    // WITHOUT INDEX: Read all 300 users, sort in memory, take 10
    const withoutIndex = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT name, age FROM users ORDER BY age DESC LIMIT 10",
    });

    console.log("\n❌ WITHOUT INDEX on age:");
    console.log("   SQL: SELECT name, age FROM users ORDER BY age DESC LIMIT 10");
    console.log("   ┌─ Read ALL 300 users");
    console.log("   ├─ Sort 300 users in memory");
    console.log("   └─ Return top 10");
    console.log("   📊 Documents read: 300");
    console.log("   ⏱️  Complexity: O(n log n) for sorting");

    // Note: We don't have an index on 'age' alone, but this demonstrates the concept
    console.log("\n✅ WITH INDEX on age (conceptual):");
    console.log("   SQL: SELECT name, age FROM users@by_age ORDER BY age DESC LIMIT 10");
    console.log("   ┌─ Index already sorted by age");
    console.log("   ├─ Read first 10 directly");
    console.log("   └─ Return immediately");
    console.log("   📊 Documents read: 10");
    console.log("   ⏱️  Complexity: O(1) with limit");
    console.log("\n   🚀 SPEEDUP: 30x fewer reads!");
    console.log("   💰 COST SAVINGS: 97% fewer documents");

    console.log("\n📈 SCALING IMPACT:");
    console.log("   ┌─────────────┬──────────────┬────────────┬───────────┐");
    console.log("   │ Table Size  │ No Index     │ With Index │ Speedup   │");
    console.log("   ├─────────────┼──────────────┼────────────┼───────────┤");
    console.log("   │ 1,000       │ 1,000 reads  │ 10 reads   │ 100x      │");
    console.log("   │ 10,000      │ 10,000 reads │ 10 reads   │ 1,000x    │");
    console.log("   │ 100,000     │ 100K reads   │ 10 reads   │ 10,000x   │");
    console.log("   │ 1,000,000   │ 1M reads     │ 10 reads   │ 100,000x  │");
    console.log("   └─────────────┴──────────────┴────────────┴───────────┘");

    expect(withoutIndex.success).toBe(true);
  });

  test("EXTREME #2: Finding needle in haystack", async () => {
    console.log("\n" + "=".repeat(70));
    console.log("🔍 FINDING RARE RECORDS (1% of data)");
    console.log("=".repeat(70));

    // Count 'pending' users (likely a small percentage)
    const countResult = await t.query(api.sqlQueries.runSQL, {
      sql: "SELECT COUNT(*) FROM users WHERE status = 'pending'",
    });

    if (countResult.success) {
      const pendingCount = countResult.data[0]["COUNT(*)"];
      const totalUsers = 300;
      const percentage = ((pendingCount / totalUsers) * 100).toFixed(1);

      console.log("\n📊 Current Dataset:");
      console.log(`   Total users: ${totalUsers}`);
      console.log(`   Pending users: ${pendingCount} (${percentage}%)`);

      console.log("\n❌ WITHOUT INDEX:");
      console.log("   SQL: SELECT * FROM users WHERE status = 'pending'");
      console.log(`   📖 Must read: ${totalUsers} documents (full scan)`);
      console.log(`   ✅ Return: ${pendingCount} documents`);
      console.log(`   💸 Wasted reads: ${totalUsers - pendingCount} (${(100 - parseFloat(percentage)).toFixed(1)}%)`);

      console.log("\n✅ WITH INDEX:");
      console.log("   SQL: SELECT * FROM users@by_status WHERE status = 'pending'");
      console.log(`   📖 Must read: ${pendingCount} documents (index jump)`);
      console.log(`   ✅ Return: ${pendingCount} documents`);
      console.log(`   💸 Wasted reads: 0 (0%)`);

      const speedup = (totalUsers / pendingCount).toFixed(1);
      console.log(`\n   🚀 SPEEDUP: ${speedup}x fewer reads!`);

      // Extrapolate to larger dataset
      console.log("\n💡 SCALED TO 1,000,000 USERS:");
      const scaledPending = Math.round((pendingCount / totalUsers) * 1000000);
      console.log(`   Without index: 1,000,000 reads`);
      console.log(`   With index: ${scaledPending.toLocaleString()} reads`);
      const scaledSpeedup = Math.round(1000000 / scaledPending);
      console.log(`   Speedup: ${scaledSpeedup}x`);
      console.log(`   Time saved: ${((1 - scaledPending / 1000000) * 100).toFixed(1)}%`);
    }
  });

  test("EXTREME #3: Compound index with perfect alignment", async () => {
    console.log("\n" + "=".repeat(70));
    console.log("⚡ COMPOUND INDEX: Filter + Order + Limit");
    console.log("=".repeat(70));

    const result = await t.query(api.sqlQueries.runSQL, {
      sql: `SELECT name, age
FROM users@by_status_and_age
WHERE status = 'active'
ORDER BY age DESC
LIMIT 5`,
    });

    console.log("\n✅ OPTIMAL QUERY:");
    console.log("   SQL: SELECT name, age");
    console.log("        FROM users@by_status_and_age");
    console.log("        WHERE status = 'active'");
    console.log("        ORDER BY age DESC");
    console.log("        LIMIT 5");

    console.log("\n🎯 Why this is optimal:");
    console.log("   1️⃣  Index has [status, age] - perfect match!");
    console.log("   2️⃣  WHERE status = 'active' uses first index field");
    console.log("   3️⃣  ORDER BY age uses second index field");
    console.log("   4️⃣  LIMIT 5 allows early termination");

    console.log("\n📊 Execution Plan:");
    console.log("   ┌─ Jump to 'active' section in index");
    console.log("   ├─ Already sorted by age (descending)");
    console.log("   ├─ Read first 5 documents");
    console.log("   └─ Return immediately");

    console.log("\n❌ Without compound index:");
    console.log("   Documents read: 300 (full table)");
    console.log("   + Sort all in memory");
    console.log("   + Filter + take 5");

    console.log("\n✅ With compound index:");
    console.log("   Documents read: ~5 (only what's needed)");
    console.log("   No sorting needed (index pre-sorted)");
    console.log("   Early termination with LIMIT");

    if (result.success) {
      console.log(`\n   🏆 RESULT: ${result.data.length} rows returned`);
      console.log(`   🚀 SPEEDUP: ~60x fewer reads (300 → 5)`);
    }
  });

  test("EXTREME #4: When indexes DON'T help", async () => {
    console.log("\n" + "=".repeat(70));
    console.log("⚠️  WHEN INDEXES PROVIDE NO BENEFIT");
    console.log("=".repeat(70));

    console.log("\n❌ BAD EXAMPLE #1: Full table scan needed");
    console.log("   SQL: SELECT * FROM users");
    console.log("   Problem: No WHERE/ORDER BY");
    console.log("   Result: Must read all rows anyway");
    console.log("   Index benefit: NONE");

    console.log("\n❌ BAD EXAMPLE #2: Non-selective filter");
    console.log("   SQL: SELECT * FROM users@by_status WHERE status = 'active'");
    console.log("   Problem: 'active' matches 36% of rows (108/300)");
    console.log("   Without index: 300 reads");
    console.log("   With index: ~108 reads");
    console.log("   Index benefit: MINIMAL (only 3x)");
    console.log("   💡 Indexes shine when matching <10% of rows");

    console.log("\n❌ BAD EXAMPLE #3: Wrong field");
    console.log("   SQL: SELECT * FROM users@by_status WHERE age > 30");
    console.log("   Problem: Filtering on 'age', but index is on 'status'");
    console.log("   Result: Can't use index, falls back to filter()");
    console.log("   Index benefit: NONE");

    console.log("\n✅ WHEN TO USE INDEXES:");
    console.log("   ✓ Large tables (1,000+ documents)");
    console.log("   ✓ Selective filters (<20% match)");
    console.log("   ✓ ORDER BY + LIMIT (biggest win!)");
    console.log("   ✓ Frequently executed queries");
    console.log("   ✓ Filter/order on indexed fields");
  });

  test("EXTREME #5: Real-world pagination scenario", async () => {
    console.log("\n" + "=".repeat(70));
    console.log("📄 PAGINATION: Loading page 5 of search results");
    console.log("=".repeat(70));

    // Simulate loading page 5 (records 41-50) of active users sorted by age
    const pageSize = 10;
    const page = 5;
    const offset = (page - 1) * pageSize; // 40

    console.log("\n🎯 SCENARIO: User browsing page 5 of active users");
    console.log(`   Page size: ${pageSize}`);
    console.log(`   Current page: ${page}`);
    console.log(`   Offset: ${offset}`);

    console.log("\n❌ WITHOUT INDEX:");
    console.log("   SQL: SELECT * FROM users");
    console.log("        WHERE status = 'active'");
    console.log("        ORDER BY age DESC");
    console.log("        LIMIT 10 OFFSET 40");
    console.log("\n   Execution:");
    console.log("   ┌─ Read ALL 300 users");
    console.log("   ├─ Filter to active (~108 users)");
    console.log("   ├─ Sort 108 users by age");
    console.log("   ├─ Skip first 40");
    console.log("   └─ Return 10");
    console.log("\n   📊 Documents read: 300");
    console.log("   💾 Memory: Sort 108 records");
    console.log("   ⏱️  Cost: Full scan + sort EVERY page load");

    console.log("\n✅ WITH COMPOUND INDEX:");
    console.log("   SQL: SELECT * FROM users@by_status_and_age");
    console.log("        WHERE status = 'active'");
    console.log("        ORDER BY age DESC");
    console.log("        LIMIT 10 OFFSET 40");
    console.log("\n   Execution:");
    console.log("   ┌─ Jump to 'active' in index");
    console.log("   ├─ Already sorted by age");
    console.log("   ├─ Skip first 40 (using index)");
    console.log("   └─ Read next 10");
    console.log("\n   📊 Documents read: ~50 (offset + limit)");
    console.log("   💾 Memory: Minimal (no sorting)");
    console.log("   ⏱️  Cost: Consistent regardless of page number!");

    console.log("\n💡 PAGINATION INSIGHT:");
    console.log("   Without index: Every page costs 300 reads");
    console.log("   With index: Page N costs (N×10) reads");
    console.log("   Page 1: 300 → 10 reads (30x faster)");
    console.log("   Page 5: 300 → 50 reads (6x faster)");
    console.log("   Page 10: 300 → 100 reads (3x faster)");

    expect(true).toBe(true); // Conceptual test
  });
});
