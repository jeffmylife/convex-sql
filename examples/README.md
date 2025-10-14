# SQL Engine Examples

This folder contains examples of how to use the SQL engine with Convex.

## Basic Usage

### 1. Import the SQL execution function

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";
import { executeSQL } from "./sql";
```

### 2. Create a query that uses SQL

```typescript
export const getAllUsers = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT * FROM users");
  },
});
```

### 3. Examples with parameters

```typescript
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
```

## Supported Features

- **SELECT**: Basic column selection, wildcards (`*`), table-qualified columns
- **WHERE**: Comparison operators (`=`, `!=`, `>`, `<`, `>=`, `<=`), AND/OR logic
- **JOIN**: INNER JOIN with ON conditions
- **GROUP BY**: Grouping with aggregates (COUNT, SUM, AVG, MIN, MAX)
- **HAVING**: Filtering grouped results
- **ORDER BY**: Sorting by one or multiple columns (ASC/DESC)
- **LIMIT**: Limiting result count
- **Index Hints**: Use `@index_name` syntax for performance (e.g., `users@by_status`)

## Performance Tips

### Use Index Hints

```typescript
// Without index - reads all 300 users
await executeSQL(ctx, "SELECT * FROM users WHERE status = 'active'");

// With index - reads only matching users
await executeSQL(ctx, "SELECT * FROM users@by_status WHERE status = 'active'");
```

### Combine ORDER BY + LIMIT with indexes

```typescript
// Optimal: Uses index for both filtering and ordering
await executeSQL(
  ctx,
  `SELECT name, age
   FROM users@by_status_and_age
   WHERE status = 'active'
   ORDER BY age DESC
   LIMIT 10`
);
```

### Use compound indexes

When your query filters by one field and orders by another, create a compound index:

```typescript
// In convex/schema.ts
export default defineSchema({
  users: defineTable({
    name: v.string(),
    status: v.string(),
    age: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_status_and_age", ["status", "age"]),
});
```

## Error Handling

Wrap SQL execution in try-catch for production use:

```typescript
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
```

## More Examples

See the full implementation in `convex/sqlQueries.ts` for more examples including:
- Complex WHERE conditions with AND/OR
- JOINs with multiple tables
- Aggregate functions
- GROUP BY with HAVING
- Multi-column ORDER BY
