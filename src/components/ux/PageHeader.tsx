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
            className="surface-subtle mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-2xl transition-colors hover:bg-secondary/80"
            aria-label="ย้อนกลับ"
          >
            <ArrowLeft className="h-5 w-5 text-secondary-foreground" />
          </button>
        ) : null}

        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-2xl font-heading font-semibold tracking-tight text-foreground sm:text-[1.85rem]">
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
