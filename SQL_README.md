# SQL-like Query Language for Convex

A TypeScript-based SQL parser and query executor that translates SQL SELECT statements into Convex database queries.

## Features

- ✅ Full SQL SELECT syntax support
- ✅ WHERE clauses with comparisons and logical operators (AND/OR)
- ✅ ORDER BY with ASC/DESC
- ✅ LIMIT for result pagination
- ✅ Column selection and aliases
- ✅ Type-safe integration with Convex

## Installation

The SQL query language is implemented in the `convex/sql/` directory with the following files:

- `types.ts` - AST type definitions
- `lexer.ts` - Tokenizer for SQL strings
- `parser.ts` - SQL parser
- `queryBuilder.ts` - Convex query builder
- `index.ts` - Main export with `executeSQL` function

## Usage

### Basic Example

```typescript
import { query } from "./_generated/server";
import { executeSQL } from "./sql";

export const getUsers = query({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    return await executeSQL(ctx, "SELECT * FROM users");
  },
});
```

### Select Specific Columns

```typescript
const results = await executeSQL(ctx, "SELECT name, email FROM users");
```

### Column Aliases

```typescript
const results = await executeSQL(
  ctx,
  "SELECT name AS userName, email AS userEmail FROM users"
);
```

### WHERE Clauses

```typescript
// Equality
await executeSQL(ctx, "SELECT * FROM users WHERE status = 'active'");

// Comparisons (=, !=, >, <, >=, <=)
await executeSQL(ctx, "SELECT * FROM users WHERE age > 18");

// AND conditions
await executeSQL(
  ctx,
  "SELECT * FROM users WHERE status = 'active' AND age >= 21"
);

// OR conditions
await executeSQL(
  ctx,
  "SELECT * FROM users WHERE status = 'active' OR status = 'pending'"
);

// Boolean values
await executeSQL(ctx, "SELECT * FROM posts WHERE published = true");
```

### ORDER BY

```typescript
// Ascending
await executeSQL(ctx, "SELECT * FROM users ORDER BY age ASC");

// Descending
await executeSQL(ctx, "SELECT * FROM users ORDER BY age DESC");
```

### LIMIT

```typescript
await executeSQL(ctx, "SELECT * FROM users LIMIT 10");
```

### Complex Queries

```typescript
const results = await executeSQL(
  ctx,
  `SELECT name, email
   FROM users
   WHERE age > 18 AND status = 'active'
   ORDER BY age DESC
   LIMIT 5`
);
```

## Supported SQL Features

### ✅ Implemented

- `SELECT` with `*` or specific columns
- Column aliases with `AS`
- `FROM` table_name
- `WHERE` with comparisons: `=`, `!=`, `>`, `<`, `>=`, `<=`
- `WHERE` with `AND`/`OR` logic
- String, number, and boolean values
- `ORDER BY` field `ASC`/`DESC`
- `LIMIT` n

### ❌ Not Yet Supported

- JOIN operations
- GROUP BY / HAVING
- Aggregate functions (COUNT, SUM, AVG, etc.)
- Subqueries
- DISTINCT
- IN / NOT IN
- LIKE pattern matching
- INSERT, UPDATE, DELETE (read-only)

## Example Schema

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    age: v.number(),
    status: v.string(),
  }).index("by_status", ["status"]),

  posts: defineTable({
    title: v.string(),
    content: v.string(),
    authorId: v.id("users"),
    published: v.boolean(),
  }).index("by_author", ["authorId"]),
});
```

## Example Queries

See `convex/sqlQueries.ts` and `convex/sqlExamples.ts` for more examples.

### Generic SQL Query Executor

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";
import { executeSQL } from "./sql";

export const runSQL = query({
  args: { sql: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    return await executeSQL(ctx, args.sql);
  },
});
```

Then call it from your client:

```typescript
const results = await convex.query(api.sqlQueries.runSQL, {
  sql: "SELECT name, email FROM users WHERE age > 25 LIMIT 10"
});
```

## How It Works

1. **Lexer** - Tokenizes the SQL string into tokens (keywords, identifiers, operators, etc.)
2. **Parser** - Builds an Abstract Syntax Tree (AST) from the tokens
3. **Query Builder** - Translates the AST into Convex database queries
4. **Executor** - Runs the Convex query and returns results

## Type Safety

The SQL executor integrates with Convex's type system and works with your defined schema. For best type safety, define specific query functions rather than using the generic executor:

```typescript
export const getActiveUsers = query({
  args: {},
  returns: v.array(v.object({
    name: v.string(),
    email: v.string(),
  })),
  handler: async (ctx) => {
    return await executeSQL(
      ctx,
      "SELECT name, email FROM users WHERE status = 'active'"
    );
  },
});
```

## Limitations

- Read-only (SELECT queries only)
- No JOIN support (single table queries only)
- No aggregate functions
- WHERE clause conditions must reference table fields directly (no computed values)
- ORDER BY only supports the first specified field

## Future Enhancements

Potential additions for future versions:

- JOIN operations (INNER, LEFT, RIGHT)
- Aggregate functions (COUNT, SUM, AVG, MIN, MAX)
- GROUP BY and HAVING
- Subqueries
- IN and NOT IN operators
- LIKE pattern matching
- DISTINCT modifier
- More complex expressions in WHERE clauses
