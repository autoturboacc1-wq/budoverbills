import { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PageSectionProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function PageSection({
  title,
  description,
  action,
  children,
  className,
  contentClassName,
}: PageSectionProps) {
  return (
    <section className={cn("space-y-4", className)}>
      {title || description || action ? (
        <div className="flex items-end justify-between gap-3 border-b border-border pb-3">
          <div>
            {title ? (
              <h2 className="font-serif-display text-xl leading-none text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn("space-y-4", contentClassName)}>{children}</div>
    </section>
  );
}
