import { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface ReviewPanelRow {
  label: string;
  value: ReactNode;
  hint?: string;
}

interface ReviewPanelProps {
  title: string;
  description?: string;
  rows: ReviewPanelRow[];
  className?: string;
}

export function ReviewPanel({ title, description, rows, className }: ReviewPanelProps) {
  return (
    <div className={cn("surface-panel", className)}>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}

      <div className="mt-4 divide-y divide-border/70">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{row.label}</p>
              {row.hint ? <p className="mt-1 text-xs text-muted-foreground">{row.hint}</p> : null}
            </div>
            <div className="text-right text-sm font-medium text-foreground">{row.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
