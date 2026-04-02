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
  sm: { main: "text-sm", sub: "text-[4px]" },
  md: { main: "text-lg", sub: "text-[6px]" },
  lg: { main: "text-2xl", sub: "text-[8px]" },
  xl: { main: "text-3xl", sub: "text-[10px]" },
};

export function BobLogo({ size = "md", className }: BobLogoProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-full bg-primary",
        sizeClasses[size],
        className
      )}
    >
      <span className={cn("font-cherry text-white leading-none", textSizes[size].main)}>
        BOB
      </span>
      <span className={cn("font-cherry text-white leading-tight", textSizes[size].sub)}>
        Bud Over Bills
      </span>
    </div>
  );
}
