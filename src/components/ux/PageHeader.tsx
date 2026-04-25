import { ArrowLeft } from "lucide-react";
import { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  onBack?: () => void;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  onBack,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex items-start justify-between gap-4 py-5", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-card/80 transition-colors hover:bg-accent"
            aria-label="ย้อนกลับ"
          >
            <ArrowLeft className="h-5 w-5 text-secondary-foreground" />
          </button>
        ) : null}

        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-serif-display text-[1.9rem] tracking-tight text-foreground sm:text-[2.05rem]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>

      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
