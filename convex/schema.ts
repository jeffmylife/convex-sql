import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  numbers: defineTable({
    value: v.number(),
  }),
  users: defineTable({
    name: v.string(),
    email: v.string(),
    age: v.number(),
    status: v.string(),
  })
    .index("by_status", ["status"])
    .index("by_status_and_age", ["status", "age"]),
  posts: defineTable({
    title: v.string(),
    content: v.string(),
    authorId: v.id("users"),
    published: v.boolean(),
  }).index("by_author", ["authorId"]),
});
