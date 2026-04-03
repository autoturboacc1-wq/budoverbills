import { Loader2, CircleAlert, CircleCheckBig, Clock3 } from "lucide-react";

import { cn } from "@/lib/utils";

type AsyncResultTone = "loading" | "success" | "warning" | "error";

interface AsyncResultStateProps {
  tone: AsyncResultTone;
  title: string;
  description?: string;
  className?: string;
}

const resultConfig = {
  loading: {
    Icon: Loader2,
    className: "border-primary/20 bg-primary/8 text-primary",
    iconClassName: "animate-spin",
  },
  success: {
    Icon: CircleCheckBig,
    className: "border-status-paid/20 bg-status-paid/8 text-status-paid",
    iconClassName: "",
  },
  warning: {
    Icon: Clock3,
    className: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    iconClassName: "",
  },
  error: {
    Icon: CircleAlert,
    className: "border-destructive/20 bg-destructive/8 text-destructive",
    iconClassName: "",
  },
} satisfies Record<
  AsyncResultTone,
  { Icon: typeof Loader2; className: string; iconClassName: string }
>;

export function AsyncResultState({
  tone,
  title,
  description,
  className,
}: AsyncResultStateProps) {
  const config = resultConfig[tone];
  const Icon = config.Icon;

  return (
    <div className={cn("rounded-2xl border px-4 py-4", config.className, className)}>
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", config.iconClassName)} />
        <div>
          <p className="font-medium">{title}</p>
          {description ? <p className="mt-1 text-sm opacity-90">{description}</p> : null}
        </div>
      </div>
    </div>
  );
}
