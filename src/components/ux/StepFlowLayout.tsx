import { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface StepDefinition {
  title: string;
  description: string;
}

interface StepFlowLayoutProps {
  title: string;
  description?: string;
  currentStep: number;
  steps: StepDefinition[];
  children: ReactNode;
  className?: string;
}

export function StepFlowLayout({
  title,
  description,
  currentStep,
  steps,
  children,
  className,
}: StepFlowLayoutProps) {
  const activeStep = steps[currentStep];

  return (
    <div className={cn("space-y-5", className)}>
      <div className="surface-panel">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium tracking-[0.12em] text-muted-foreground">
              Step {currentStep + 1} / {steps.length}
            </p>
            <h2 className="mt-1 font-serif-display text-[1.4rem] text-foreground">{title}</h2>
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          <div className="rounded-[1rem] border border-border/80 bg-secondary/60 px-3 py-2 text-right">
            <p className="text-xs tracking-[0.12em] text-muted-foreground">กำลังทำ</p>
            <p className="text-sm font-semibold text-primary">{activeStep.title}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-4">
          {steps.map((step, index) => {
            const isActive = index === currentStep;
            const isDone = index < currentStep;
            return (
              <div
                key={step.title}
                className={cn(
                  "rounded-[1rem] border px-3 py-3 transition-colors",
                  isActive
                    ? "border-primary/25 bg-primary/5"
                    : isDone
                      ? "border-status-paid/20 bg-status-paid/5"
                      : "border-border/80 bg-background",
                )}
              >
                <p className="text-xs font-medium tracking-[0.1em] text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">{step.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {children}
    </div>
  );
}
