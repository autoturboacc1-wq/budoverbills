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

const accentClass: Record<ActionPriority, string> = {
  primary: "text-foreground",
  warning: "text-status-pending",
  danger: "text-destructive",
  neutral: "text-muted-foreground",
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
    <div className={cn("rounded-md border border-border bg-card p-4", className)}>
      <div className="mb-3 flex items-center justify-between">
        <span className="label-eyebrow">{label}</span>
        {Icon ? (
          <Icon
            className={cn("h-3.5 w-3.5", accentClass[priority])}
            strokeWidth={1.5}
          />
        ) : null}
      </div>
      <p className="font-serif-display text-2xl leading-none text-foreground num">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
