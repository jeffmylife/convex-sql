"use client";

import { SQLQueryEditor } from "@/components/SQLQueryEditor";
import { Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-[var(--color-background)] to-[var(--color-muted)]/20">
      <header className="sticky top-0 z-10 bg-[var(--color-background)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-background)]/60 border-b">
        <div className="container flex h-16 items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
              <Database className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">Convex SQL Query Editor</h1>
              <Badge variant="secondary">Beta</Badge>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex-1 container py-10">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">
              SQL Query Interface
            </h2>
            <p className="text-[var(--color-muted-foreground)] text-lg">
              Write SQL queries against your Convex database with real-time
              results.
            </p>
          </div>
          <SQLQueryEditor />
        </div>
      </main>
      <footer className="border-t py-6 bg-[var(--color-muted)]/30">
        <div className="container text-center text-sm text-[var(--color-muted-foreground)]">
          Built with{" "}
          <span className="font-medium text-[var(--color-foreground)]">Convex</span>,{" "}
          <span className="font-medium text-[var(--color-foreground)]">Next.js</span>, and{" "}
          <span className="font-medium text-[var(--color-foreground)]">shadcn/ui</span>
        </div>
      </footer>
    </div>
  );
}
