import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

type MessageTone = "error" | "warning" | "info" | "success";

interface InlineValidationMessageProps {
  tone?: MessageTone;
  message: string;
  className?: string;
}

const config = {
  error: {
    wrapper: "border-destructive/20 bg-destructive/8 text-destructive",
    Icon: AlertCircle,
  },
  warning: {
    wrapper: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    Icon: TriangleAlert,
  },
  info: {
    wrapper: "border-primary/20 bg-primary/8 text-primary",
    Icon: Info,
  },
  success: {
    wrapper: "border-status-paid/20 bg-status-paid/8 text-status-paid",
    Icon: CheckCircle2,
  },
} satisfies Record<MessageTone, { wrapper: string; Icon: typeof AlertCircle }>;

export function InlineValidationMessage({
  tone = "error",
  message,
  className,
}: InlineValidationMessageProps) {
  const toneConfig = config[tone];
  const Icon = toneConfig.Icon;

  return (
    <div className={cn("flex items-start gap-2 rounded-2xl border px-3 py-2.5 text-sm", toneConfig.wrapper, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}
