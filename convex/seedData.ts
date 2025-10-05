import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { faker } from "@faker-js/faker";

const STATUSES = ["active", "inactive", "pending"];

/**
 * Seed the database with sample users and posts using Faker
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

    const NUM_USERS = 300;
    const NUM_POSTS = 800;

    // Use seed for deterministic results
    faker.seed(12345);

    console.log(`Seeding ${NUM_USERS} users...`);

    // Create users with realistic fake data
    const userIds: Array<any> = [];
    for (let i = 0; i < NUM_USERS; i++) {
      const userId = await ctx.db.insert("users", {
        name: faker.person.fullName(),
        email: faker.internet.email().toLowerCase(),
        age: faker.number.int({ min: 18, max: 67 }),
        status: faker.helpers.arrayElement(STATUSES),
      });

      userIds.push(userId);
    }

    console.log(`Seeding ${NUM_POSTS} posts...`);

    // Create posts with variety
    for (let i = 0; i < NUM_POSTS; i++) {
      const authorId = faker.helpers.arrayElement(userIds);

      await ctx.db.insert("posts", {
        title: faker.lorem.sentence({ min: 3, max: 8 }),
        content: faker.lorem.paragraphs({ min: 1, max: 3 }),
        authorId,
        published: faker.datatype.boolean({ probability: 0.7 }), // 70% published
      });
    }

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
