import { cn } from "@/lib/utils";

interface BobLogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "w-10 h-10",
  md: "w-16 h-16",
  lg: "w-20 h-20",
  xl: "w-24 h-24",
};

const textSizes = {
  sm: { main: "text-sm", sub: null },
  md: { main: "text-xl", sub: "text-[7px]" },
  lg: { main: "text-2xl", sub: "text-[9px]" },
  xl: { main: "text-3xl", sub: "text-[11px]" },
};

export function BobLogo({ size = "md", className }: BobLogoProps) {
  const sub = textSizes[size].sub;
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-full",
        "bg-gradient-to-br from-primary via-primary to-primary/75",
        "shadow-lg shadow-primary/35",
        "ring-1 ring-inset ring-white/20",
        sizeClasses[size],
        className
      )}
    >
      <span className={cn("font-cherry text-white leading-none tracking-wide", textSizes[size].main)}>
        BOB
      </span>
      {sub && (
        <span className={cn("font-cherry text-white/75 leading-tight tracking-widest", sub)}>
          Bud Over Bills
        </span>
      )}
    </div>
  );
}
