import { ReactNode } from "react";
import { CheckCircle2, Clock3, AlertTriangle, SearchX, CircleDashed } from "lucide-react";

import { cn } from "@/lib/utils";
import { FinancialStatus } from "@/components/ux/types";

export interface StatusTimelineItem {
  id: string;
  title: string;
  description?: string;
  meta?: string;
  status: FinancialStatus;
  action?: ReactNode;
}

const statusConfig: Record<
  FinancialStatus,
  { dot: string; card: string; Icon: typeof Clock3 }
> = {
  pending: {
    dot: "bg-muted-foreground/50",
    card: "border-border bg-secondary/45",
    Icon: CircleDashed,
  },
  due_soon: {
    dot: "bg-status-overdue",
    card: "border-status-overdue/20 bg-status-overdue/8",
    Icon: Clock3,
  },
  overdue: {
    dot: "bg-destructive",
    card: "border-destructive/20 bg-destructive/8",
    Icon: AlertTriangle,
  },
  verifying: {
    dot: "bg-primary",
    card: "border-primary/20 bg-primary/8",
    Icon: Clock3,
  },
  paid: {
    dot: "bg-status-paid",
    card: "border-status-paid/20 bg-status-paid/8",
    Icon: CheckCircle2,
  },
  rejected: {
    dot: "bg-destructive",
    card: "border-destructive/20 bg-destructive/8",
    Icon: SearchX,
  },
};

interface StatusTimelineProps {
  items: StatusTimelineItem[];
  className?: string;
}

export function StatusTimeline({ items, className }: StatusTimelineProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {items.map((item, index) => {
        const config = statusConfig[item.status];
        const Icon = config.Icon;

        return (
          <div key={item.id} className="flex gap-3">
            <div className="flex w-5 shrink-0 flex-col items-center">
              <span className={cn("mt-2 h-2.5 w-2.5 rounded-full", config.dot)} />
              {index < items.length - 1 ? (
                <span className="mt-2 h-full min-h-8 w-px bg-border/80" />
              ) : null}
            </div>
            <div className={cn("flex-1 rounded-2xl border p-4", config.card)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-foreground/75" />
                    <p className="font-medium text-foreground">{item.title}</p>
                  </div>
                  {item.description ? (
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</p>
                  ) : null}
                </div>
                {item.meta ? (
                  <span className="rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {item.meta}
                  </span>
                ) : null}
              </div>
              {item.action ? <div className="mt-3">{item.action}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
