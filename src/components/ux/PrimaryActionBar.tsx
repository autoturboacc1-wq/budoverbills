import { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PrimaryActionBarProps {
  children: ReactNode;
  className?: string;
}

export function PrimaryActionBar({ children, className }: PrimaryActionBarProps) {
  return (
    <div
      className={cn(
        "sticky-action-bar sticky bottom-0 z-20 rounded-[1.5rem] border border-border/70 bg-background/92 p-3 shadow-elevated backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
