"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DropTableModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableName: string;
}

export function DropTableModal({
  open,
  onOpenChange,
  tableName,
}: DropTableModalProps) {
  const [stage, setStage] = useState<"warning" | "reveal">("warning");

  const handleClose = () => {
    setStage("warning");
    onOpenChange(false);
  };

  const handleContinue = () => {
    setStage("reveal");
  };

  const handleBackToSafety = () => {
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        {stage === "warning" ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-destructive text-xl">
                ⚠️ Wait! Are you sure?
              </DialogTitle>
              <DialogDescription className="pt-4 space-y-3 text-base">
                <p className="font-semibold">
                  Please don't do it, everything will be lost and I forgot to
                  use backups.
                </p>
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  You are about to drop the table{" "}
                  <code className="px-1.5 py-0.5 bg-[var(--color-muted)] rounded text-[var(--color-foreground)] font-mono">
                    {tableName}
                  </code>
                </p>
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mt-4">
                  <p className="text-sm text-destructive font-medium">
                    This action cannot be undone. All data will be permanently
                    lost forever.
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleBackToSafety}>
                No, take me back to safety!
              </Button>
              <Button variant="destructive" onClick={handleContinue}>
                Continue anyway
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-destructive text-2xl">
                NOOOO 😱
              </DialogTitle>
              <DialogDescription className="pt-4 space-y-4 text-base">
                <div className="space-y-3">
                  <p className="text-lg font-bold text-destructive animate-pulse">
                    You just dropped the production database!!!!
                  </p>
                  <div className="bg-destructive/10 border border-destructive/30 rounded-md p-4">
                    <p className="font-mono text-sm text-destructive">
                      DROP TABLE {tableName};
                      <br />
                      Query OK, 1,247,832 rows affected (0.03 sec)
                    </p>
                  </div>
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    All customer data... gone.
                    <br />
                    Years of work... vanished.
                    <br />
                    Your career... over.
                  </p>
                </div>
                <div className="border-t border-[var(--color-border)] pt-4 mt-4">
                  <p className="text-base">
                    <span className="font-semibold">Just kidding! 😄</span>
                  </p>
                  <p className="text-sm text-[var(--color-muted-foreground)] mt-2">
                    This is read-only mode. Your data is safe and sound. We
                    would never let you accidentally destroy everything... or
                    would we? 🤔
                  </p>
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={handleBackToSafety} className="w-full sm:w-auto">
                Phew! Close this
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
