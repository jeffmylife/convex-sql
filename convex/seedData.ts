import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Seed the database with sample users and posts
 */
export const seedDatabase = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Check if data already exists
    const existingUsers = await ctx.db.query("users").take(1);
    if (existingUsers.length > 0) {
      console.log("Database already seeded");
      return null;
    }

    // Create users
    const user1 = await ctx.db.insert("users", {
      name: "Alice Johnson",
      email: "alice@example.com",
      age: 28,
      status: "active",
    });

    const user2 = await ctx.db.insert("users", {
      name: "Bob Smith",
      email: "bob@example.com",
      age: 35,
      status: "active",
    });

    const user3 = await ctx.db.insert("users", {
      name: "Charlie Brown",
      email: "charlie@example.com",
      age: 17,
      status: "pending",
    });

    const user4 = await ctx.db.insert("users", {
      name: "Diana Prince",
      email: "diana@example.com",
      age: 42,
      status: "active",
    });

    const user5 = await ctx.db.insert("users", {
      name: "Eve Davis",
      email: "eve@example.com",
      age: 23,
      status: "inactive",
    });

    // Create posts
    await ctx.db.insert("posts", {
      title: "Getting Started with Convex",
      content: "Convex is a great backend platform...",
      authorId: user1,
      published: true,
    });

    await ctx.db.insert("posts", {
      title: "SQL Queries in Convex",
      content: "You can now write SQL-like queries...",
      authorId: user1,
      published: true,
    });

    await ctx.db.insert("posts", {
      title: "Draft Post",
      content: "This is a draft post...",
      authorId: user2,
      published: false,
    });

    await ctx.db.insert("posts", {
      title: "Advanced Convex Patterns",
      content: "Learn about advanced patterns...",
      authorId: user4,
      published: true,
    });

    console.log("Database seeded successfully!");
    return null;
  },
});

/**
 * Clear all data from users and posts tables
 */
export const clearDatabase = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    for (const user of users) {
      await ctx.db.delete(user._id);
    }

    const posts = await ctx.db.query("posts").collect();
    for (const post of posts) {
      await ctx.db.delete(post._id);
    }

    console.log("Database cleared successfully!");
    return null;
  },
});
