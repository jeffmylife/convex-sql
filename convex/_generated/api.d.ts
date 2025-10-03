/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as seedData from "../seedData.js";
import type * as sql_index from "../sql/index.js";
import type * as sql_queryBuilder from "../sql/queryBuilder.js";
import type * as sqlQueries from "../sqlQueries.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  seedData: typeof seedData;
  "sql/index": typeof sql_index;
  "sql/queryBuilder": typeof sql_queryBuilder;
  sqlQueries: typeof sqlQueries;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
