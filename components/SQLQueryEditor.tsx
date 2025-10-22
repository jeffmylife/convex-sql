"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Play, Loader2, Trash2 } from "lucide-react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-sql";
import { DropTableModal } from "@/components/DropTableModal";

const EXAMPLE_QUERIES = [
  {
    label: "Basic: Select all users",
    query: "SELECT * FROM users LIMIT 100",
  },
  {
    label: "WHERE: Filter by age",
    query: "SELECT name, email\nFROM users\nWHERE age > 18\nLIMIT 100",
  },
  {
    label: "Index: Query with index",
    query: "SELECT * FROM users@by_status WHERE status = 'active' LIMIT 100",
  },
  {
    label: "JOIN: Users & posts",
    query: `SELECT users.name, posts.title
FROM users
INNER JOIN posts ON users._id = posts.authorId
LIMIT 100`,
  },
  {
    label: "JOIN: With WHERE filter",
    query: `SELECT users.name, posts.title
FROM users@by_status
INNER JOIN posts@by_author ON users._id = posts.authorId
WHERE users.status = 'active'
LIMIT 100`,
  },
  {
    label: "Aggregate: COUNT",
    query: "SELECT COUNT(*) FROM users",
  },
  {
    label: "GROUP BY: Count by status",
    query: `SELECT status, COUNT(*) AS user_count
FROM users
GROUP BY status`,
  },
  {
    label: "GROUP BY: AVG, MIN, MAX",
    query: `SELECT status, AVG(age) AS avg_age, MIN(age) AS min_age, MAX(age) AS max_age
FROM users
GROUP BY status`,
  },
  {
    label: "HAVING: Filter groups",
    query: `SELECT status, COUNT(*) AS count
FROM users
GROUP BY status
HAVING COUNT(*) > 1`,
  },
];

export function SQLQueryEditor() {
  const [sql, setSql] = useState(EXAMPLE_QUERIES[0].query);
  const [executedQuery, setExecutedQuery] = useState(EXAMPLE_QUERIES[0].query);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [changedRows, setChangedRows] = useState<Set<number>>(new Set());
  const [mounted, setMounted] = useState(false);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [dropModalOpen, setDropModalOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState("");
  const previousResults = useRef<any[] | null>(null);
  const queryStartTime = useRef<number | null>(null);

  const response = useQuery(api.sqlQueries.runSQL, { sql: executedQuery });

  const handleExecute = () => {
    // Check if query contains DROP command
    const dropMatch = sql.match(/DROP\s+TABLE\s+(\w+)/i);
    if (dropMatch) {
      const tableName = dropMatch[1];
      handleDropTable(tableName);
      return;
    }

    setExecutedQuery(sql);
    previousResults.current = null; // Reset tracking on new query
    setChangedRows(new Set());
    queryStartTime.current = performance.now();
    setExecutionTime(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleExecute();
    }
  };

  const handleDropTable = (tableName: string) => {
    setTableToDelete(tableName);
    setDropModalOpen(true);
  };

  const results = response?.success ? response.data : null;
  const error = response?.success === false ? response.error : null;

  // Set mounted state to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Track changes in results and measure execution time
  useEffect(() => {
    // Calculate execution time when query completes
    if (response !== undefined && queryStartTime.current !== null) {
      const elapsed = performance.now() - queryStartTime.current;
      setExecutionTime(elapsed);
      queryStartTime.current = null;
    }

    if (results && results.length > 0) {
      setLastUpdated(new Date());

      if (previousResults.current) {
        const newChangedRows = new Set<number>();
        const prevResultsStr = JSON.stringify(previousResults.current);
        const currentResultsStr = JSON.stringify(results);

        if (prevResultsStr !== currentResultsStr) {
          // Detect which rows changed
          results.forEach((row, idx) => {
            const prevRow = previousResults.current?.[idx];
            if (!prevRow || JSON.stringify(prevRow) !== JSON.stringify(row)) {
              newChangedRows.add(idx);
            }
          });

          setChangedRows(newChangedRows);

          // Clear highlights after animation
          setTimeout(() => setChangedRows(new Set()), 2000);
        }
      }

      previousResults.current = results;
    }
  }, [results, response]);

  return (
    <div className="flex flex-col gap-8 w-full">
      <div className="flex flex-col gap-4">
        <div
          className="border-2 rounded-lg bg-[var(--color-card)] overflow-hidden border-[var(--color-muted-foreground)]/20 hover:border-[var(--color-muted-foreground)]/30 transition-colors shadow-sm"
          onKeyDown={handleKeyDown}
        >
          {mounted ? (
            <Editor
              value={sql}
              onValueChange={setSql}
              highlight={(code) => Prism.highlight(code, Prism.languages.sql, "sql")}
              padding={16}
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 14,
                minHeight: "160px",
                backgroundColor: "transparent",
                lineHeight: "1.6",
              }}
              textareaClassName="focus:outline-none"
              placeholder="SELECT * FROM users WHERE age > 18"
            />
          ) : (
            <div
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 14,
                minHeight: "160px",
                padding: 16,
                color: "var(--color-foreground)",
                lineHeight: "1.6",
              }}
            >
              {sql}
            </div>
          )}
        </div>
        <div className="flex gap-3 items-center justify-between">
          <div className="flex gap-2 items-center">
            <Button
              onClick={handleExecute}
              size="sm"
              variant="ghost"
            >
              <Play className="h-4 w-4" />
            </Button>
            <Select onValueChange={setSql}>
              <SelectTrigger className="w-[200px] h-8 border-[var(--color-muted-foreground)]/10">
                <SelectValue placeholder="examples" />
              </SelectTrigger>
              <SelectContent>
                {EXAMPLE_QUERIES.map((example, i) => (
                  <SelectItem key={i} value={example.query}>
                    {example.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            {executionTime !== null && (
              <span className="text-xs text-[var(--color-muted-foreground)] font-mono">
                {executionTime < 1000
                  ? `${executionTime.toFixed(0)}ms`
                  : `${(executionTime / 1000).toFixed(2)}s`
                }
              </span>
            )}
            {results && (
              <span className="text-xs text-[var(--color-muted-foreground)]">
                {results.length} row{results.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {response === undefined ? (
          <div className="flex items-center justify-center p-16">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--color-muted-foreground)]" />
          </div>
        ) : error ? (
          <div className="border border-red-500/20 rounded-md p-4 bg-red-500/5">
            <p className="font-mono text-xs text-red-500">
              {error}
            </p>
          </div>
        ) : results && results.length === 0 ? (
          <div className="flex items-center justify-center p-16">
            <p className="text-xs text-[var(--color-muted-foreground)]">
              no results
            </p>
          </div>
        ) : results && results.length > 0 ? (
          <div className="rounded-lg border-2 border-[var(--color-muted-foreground)]/20 overflow-hidden bg-[var(--color-card)] shadow-sm">
            <div className="max-h-[600px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-[var(--color-card)] backdrop-blur-sm border-b-2 border-[var(--color-muted-foreground)]/20">
                  <TableRow className="hover:bg-transparent">
                    {Object.keys(results[0]).map((key) => (
                      <TableHead key={key} className="text-xs font-semibold text-[var(--color-foreground)]/70">
                        {key}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row, i) => (
                    <TableRow
                      key={i}
                      className={`border-[var(--color-muted-foreground)]/10 hover:bg-[var(--color-muted)]/30 transition-colors ${changedRows.has(i) ? "animate-highlight" : ""}`}
                    >
                      {Object.entries(row).map(([key, value], j) => (
                        <TableCell key={j} className="font-mono text-xs text-[var(--color-foreground)]">
                          {typeof value === "boolean" ? (
                            <span>
                              {value.toString()}
                            </span>
                          ) : value === null ? (
                            <span className="text-[var(--color-muted-foreground)] italic">null</span>
                          ) : key === "_creationTime" && typeof value === "number" ? (
                            <span className="whitespace-nowrap">
                              {new Date(value).toLocaleString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </span>
                          ) : (
                            String(value)
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </div>

      <DropTableModal
        open={dropModalOpen}
        onOpenChange={setDropModalOpen}
        tableName={tableToDelete}
      />
    </div>
  );
}
