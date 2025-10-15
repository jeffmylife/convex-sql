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
        <div className="max-w-5xl mx-auto">
          <SQLQueryEditor />
        </div>
      </main>
    </div>
  );
}
