import { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ActionPriority } from "@/components/ux/types";

interface SummaryCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  priority?: ActionPriority;
  className?: string;
}

const priorityClasses: Record<ActionPriority, string> = {
  primary: "bg-primary/8 border-primary/15 text-primary",
  warning: "bg-amber-500/10 border-amber-500/15 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/10 border-destructive/15 text-destructive",
  neutral: "bg-secondary/55 border-border text-foreground",
};

export function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  priority = "neutral",
  className,
}: SummaryCardProps) {
  return (
    <div className={cn("rounded-3xl border p-4 shadow-card", className)}>
      <div className="mb-3 flex items-center gap-2">
        {Icon ? (
          <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-2xl border", priorityClasses[priority])}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="text-2xl font-heading font-semibold tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
