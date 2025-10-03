"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

const EXAMPLE_QUERIES = [
  "SELECT * FROM users",
  "SELECT name, email FROM users WHERE age > 18",
  "SELECT * FROM users WHERE status = 'active' ORDER BY age DESC LIMIT 10",
  "SELECT * FROM posts WHERE published = true",
  "SELECT name, email FROM users WHERE status = 'active' AND age >= 21",
];

export function SQLQueryEditor() {
  const [sql, setSql] = useState(EXAMPLE_QUERIES[0]);
  const [executedQuery, setExecutedQuery] = useState(EXAMPLE_QUERIES[0]);
  const seedDatabase = useMutation(api.seedData.seedDatabase);
  const clearDatabase = useMutation(api.seedData.clearDatabase);

  const response = useQuery(api.sqlQueries.runSQL, { sql: executedQuery });

  const handleExecute = () => {
    setExecutedQuery(sql);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleExecute();
    }
  };

  const results = response?.success ? response.data : null;
  const error = response?.success === false ? response.error : null;

  return (
    <div className="flex flex-col gap-4 w-full max-w-4xl mx-auto">
      <div className="flex gap-2">
        <button
          onClick={() => void seedDatabase()}
          className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1 rounded-md transition-colors"
        >
          Seed Sample Data
        </button>
        <button
          onClick={() => void clearDatabase()}
          className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded-md transition-colors"
        >
          Clear Data
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">SQL Query</label>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          className="font-mono text-sm p-3 border-2 border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 min-h-[100px] focus:outline-none focus:border-blue-500"
          placeholder="SELECT * FROM users WHERE age > 18"
        />
        <div className="flex gap-2 items-center">
          <button
            onClick={handleExecute}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-md transition-colors"
          >
            Execute (⌘/Ctrl + Enter)
          </button>
          <select
            className="text-sm px-3 py-2 border-2 border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900"
            onChange={(e) => setSql(e.target.value)}
            value=""
          >
            <option value="">Load example...</option>
            {EXAMPLE_QUERIES.map((query, i) => (
              <option key={i} value={query}>
                {query}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">Results</label>
        {response === undefined ? (
          <div className="p-4 border-2 border-slate-300 dark:border-slate-700 rounded-md bg-slate-100 dark:bg-slate-900">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Loading...
            </p>
          </div>
        ) : error ? (
          <div className="p-4 border-2 border-red-300 dark:border-red-700 rounded-md bg-red-50 dark:bg-red-950">
            <p className="text-sm text-red-700 dark:text-red-300 font-semibold">
              Error:
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 font-mono mt-1">
              {error}
            </p>
          </div>
        ) : results && results.length === 0 ? (
          <div className="p-4 border-2 border-slate-300 dark:border-slate-700 rounded-md bg-slate-100 dark:bg-slate-900">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              No results
            </p>
          </div>
        ) : results && results.length > 0 ? (
          <div className="border-2 border-slate-300 dark:border-slate-700 rounded-md overflow-auto max-h-[400px]">
            <table className="w-full text-sm">
              <thead className="bg-slate-200 dark:bg-slate-800 sticky top-0">
                <tr>
                  {Object.keys(results[0]).map((key) => (
                    <th
                      key={key}
                      className="text-left px-4 py-2 font-semibold border-b-2 border-slate-300 dark:border-slate-700"
                    >
                      {key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900"
                  >
                    {Object.values(row).map((value, j) => (
                      <td key={j} className="px-4 py-2">
                        {typeof value === "boolean"
                          ? value.toString()
                          : value === null
                            ? "null"
                            : String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {results && (
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {results.length} row(s) returned
          </p>
        )}
      </div>
    </div>
  );
}
