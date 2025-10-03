"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Play, Database, Trash2, AlertCircle, Loader2 } from "lucide-react";

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
    <div className="flex flex-col gap-6 w-full max-w-6xl mx-auto">
      <div className="flex gap-2 items-center justify-between">
        <div className="flex gap-2">
          <Button
            onClick={() => void seedDatabase()}
            variant="outline"
            size="sm"
          >
            <Database className="mr-2 h-4 w-4" />
            Seed Sample Data
          </Button>
          <Button
            onClick={() => void clearDatabase()}
            variant="outline"
            size="sm"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear Data
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 border rounded-lg p-6 bg-[var(--color-card)] shadow-sm">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold">SQL Query</label>
          <Badge variant="outline" className="font-mono text-[10px]">
            READ-ONLY
          </Badge>
        </div>
        <Textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          className="font-mono min-h-[140px] resize-none bg-[var(--color-muted)]/30 border-[var(--color-muted-foreground)]/20"
          placeholder="SELECT * FROM users WHERE age > 18"
        />
        <div className="flex gap-2 items-center">
          <Button onClick={handleExecute} size="default">
            <Play className="mr-2 h-4 w-4" />
            Execute Query
          </Button>
          <Select onValueChange={setSql}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Load example..." />
            </SelectTrigger>
            <SelectContent>
              {EXAMPLE_QUERIES.map((query, i) => (
                <SelectItem key={i} value={query}>
                  Example {i + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto">
            <Badge variant="secondary" className="font-mono text-[10px]">
              <span className="text-xs mr-1">⌘</span>+ Enter
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold">Results</label>
          {results && (
            <Badge variant="outline">
              {results.length} row{results.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        {response === undefined ? (
          <div className="flex items-center justify-center p-16 border rounded-lg bg-[var(--color-card)] shadow-sm">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
            <span className="ml-3 text-sm text-[var(--color-muted-foreground)]">
              Executing query...
            </span>
          </div>
        ) : error ? (
          <Alert variant="destructive" className="shadow-sm">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Query Error</AlertTitle>
            <AlertDescription className="font-mono text-xs mt-2">
              {error}
            </AlertDescription>
          </Alert>
        ) : results && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 border rounded-lg bg-[var(--color-card)] shadow-sm">
            <Database className="h-12 w-12 text-[var(--color-muted-foreground)]/40 mb-3" />
            <p className="text-sm font-medium text-[var(--color-muted-foreground)]">
              No results found
            </p>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
              Try seeding sample data or adjusting your query
            </p>
          </div>
        ) : results && results.length > 0 ? (
          <div className="rounded-lg border bg-[var(--color-card)] shadow-sm overflow-hidden">
            <div className="max-h-[500px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-[var(--color-muted)] backdrop-blur-sm border-b">
                  <TableRow className="hover:bg-[var(--color-muted)]">
                    {Object.keys(results[0]).map((key) => (
                      <TableHead key={key} className="font-semibold text-[var(--color-foreground)]">
                        {key}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row, i) => (
                    <TableRow key={i}>
                      {Object.values(row).map((value, j) => (
                        <TableCell key={j} className="font-mono text-xs">
                          {typeof value === "boolean" ? (
                            <Badge variant={value ? "default" : "secondary"} className="text-[10px]">
                              {value.toString()}
                            </Badge>
                          ) : value === null ? (
                            <span className="text-[var(--color-muted-foreground)] italic">null</span>
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
    </div>
  );
}
