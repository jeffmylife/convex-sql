"use client";

import { SQLQueryEditor } from "@/components/SQLQueryEditor";
import { ThemeToggle } from "@/components/theme-toggle";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <main className="flex-1 container mx-auto py-12">
        <div className="max-w-5xl mx-auto space-y-24">
          <SQLQueryEditor />

          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <h1 className="text-2xl font-mono text-[var(--color-foreground)]/80">
              What if Convex had SQL?
            </h1>
            <p className="text-sm text-[var(--color-muted-foreground)] max-w-md text-center leading-relaxed">
              A not so serious experiment in bringing a read-only SQL query syntax to Convex's
              real-time database.
            </p>
            <p className="text-sm text-[var(--color-muted-foreground)] max-w-md text-center leading-relaxed">
              I thought it might be useful for when I want to do text queries against my data. I have put next to zero thought into the practicality of this in a real project.
            </p>

          </div>
        </div>
      </main>
    </div>
  );
}
